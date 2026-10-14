"""数据库读写。

机器人直连数据库（D-19、R-105）。它碰的表（均为最小授权）：
    users / invite_codes / reset_tokens / season_ratings
    pending_registrations / pending_password_resets   （D-45 群内确认）

注意：密码散列不在这里生成 —— 那是网站侧的唯一实现，
      通过 shared_rules.hash_password() 取得。
"""

from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.rows import dict_row


def _connect():
    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        raise RuntimeError("缺少 DATABASE_URL")
    return psycopg.connect(dsn, row_factory=dict_row)


def find_user_by_qq(qq_number: str) -> dict[str, Any] | None:
    """按 QQ 号查用户；不存在返回 None。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, role FROM users WHERE qq_number = %s LIMIT 1",
                (qq_number,),
            )
            return cur.fetchone()


def find_invite_by_qq(qq_number: str) -> dict[str, Any] | None:
    """查询该 QQ 号是否已有邀请码。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT code, used_at FROM invite_codes WHERE qq_number = %s LIMIT 1",
                (qq_number,),
            )
            return cur.fetchone()


def create_invite(qq_number: str, code: str) -> None:
    """为该 QQ 号创建邀请码。唯一约束保证一码一 QQ。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO invite_codes (code, qq_number) VALUES (%s, %s)",
                (code, qq_number),
            )
        conn.commit()


def create_reset_session(user_id: str) -> str:
    """创建一个「等待输入新密码」的重置会话，返回其 id。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO reset_tokens (user_id, status) VALUES (%s, %s) RETURNING id",
                (user_id, "awaiting_new_password"),
            )
            row = cur.fetchone()
        conn.commit()
    if row is None:
        raise RuntimeError("创建重置会话失败")
    return str(row["id"])


def get_pending_reset(user_id: str) -> dict[str, Any] | None:
    """取该用户尚未完成的最近一个重置会话。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM reset_tokens"
                " WHERE user_id = %s AND status = 'awaiting_new_password'"
                " ORDER BY created_at DESC LIMIT 1",
                (user_id,),
            )
            return cur.fetchone()


def complete_reset(reset_id: str, user_id: str, password_hash: str) -> None:
    """写入新密码并结束重置会话（两件事必须在同一事务内）。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (password_hash, user_id),
            )
            cur.execute(
                "UPDATE reset_tokens SET status = 'done' WHERE id = %s",
                (reset_id,),
            )
        conn.commit()

# ---------------------------------------------------------------------------
# 群内确认（D-45）：注册与重置密码
# ---------------------------------------------------------------------------


def create_pending_registration(
    qq_number: str, name: str, student_id: str, password_hash: str
) -> None:
    """写入一笔待确认注册（10 分钟有效）。

    qq_number 有唯一约束：同一 QQ 号重复发起会**覆盖**旧记录，
    避免一个人连点多次把群刷屏。
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pending_registrations
                       (qq_number, name, student_id, password_hash, expires_at)
                VALUES (%s, %s, %s, %s, now() + interval '10 minutes')
                ON CONFLICT (qq_number) DO UPDATE
                   SET name = EXCLUDED.name,
                       student_id = EXCLUDED.student_id,
                       password_hash = EXCLUDED.password_hash,
                       created_at = now(),
                       expires_at = EXCLUDED.expires_at
                """,
                (qq_number, name, student_id, password_hash),
            )
        conn.commit()


def get_expired_pending_registration(qq_number: str) -> bool:
    """该 QQ 号是否有已过期的待确认（用于给出更准确的提示）。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM pending_registrations"
                " WHERE qq_number = %s AND expires_at < now() LIMIT 1",
                (qq_number,),
            )
            return cur.fetchone() is not None


def confirm_registration(qq_number: str) -> str | None:
    """完成注册。

    返回 'ok' / 'expired' / 'none'。

    ⚠️ 调用方必须已确认「发言者 QQ 号 == 待确认记录的 QQ 号」——
    本函数不再校验，因为那正是整个机制的安全依据。
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            # 锁住这一行：两个「确认注册」同时到达时，只有一个能成功
            cur.execute(
                "SELECT id, name, student_id, password_hash, expires_at"
                "  FROM pending_registrations WHERE qq_number = %s FOR UPDATE",
                (qq_number,),
            )
            row = cur.fetchone()
            if row is None:
                return "none"
            if row["expires_at"] is not None and row["expires_at"] < _now(cur):
                return "expired"

            # 已注册过（可能通过管理员人工方式）→ 视为已完成，不重复建号
            cur.execute("SELECT id FROM users WHERE qq_number = %s", (qq_number,))
            if cur.fetchone() is not None:
                cur.execute(
                    "DELETE FROM pending_registrations WHERE id = %s", (row["id"],)
                )
                conn.commit()
                return "ok"

            cur.execute(
                """
                INSERT INTO users (name, student_id, qq_number, password_hash)
                VALUES (%s, %s, %s, %s) RETURNING id
                """,
                (row["name"], row["student_id"], qq_number, row["password_hash"]),
            )
            new_user = cur.fetchone()
            assert new_user is not None

            # 为新成员建立本赛季积分（D-09：初始 500）
            cur.execute(
                """
                INSERT INTO season_ratings (user_id, season_id)
                SELECT %s, id FROM seasons WHERE status = 'active' LIMIT 1
                ON CONFLICT DO NOTHING
                """,
                (new_user["id"],),
            )

            # 密码哈希用完即删：不留副本
            cur.execute("DELETE FROM pending_registrations WHERE id = %s", (row["id"],))
        conn.commit()
    return "ok"


def _now(cur) -> object:
    """取数据库当前时间。用库时间而非进程时间，避免时钟偏差。"""
    cur.execute("SELECT now() AS t")
    row = cur.fetchone()
    return row["t"]


def create_pending_reset(user_id: str, token: str, session_id: str | None) -> None:
    """写入一笔重置待确认（10 分钟有效），并清掉该用户更早的待确认。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM pending_password_resets WHERE user_id = %s AND used_at IS NULL",
                (user_id,),
            )
            cur.execute(
                """
                INSERT INTO pending_password_resets (user_id, token, session_id, expires_at)
                VALUES (%s, %s, %s, now() + interval '10 minutes')
                """,
                (user_id, token, session_id),
            )
        conn.commit()


def get_pending_reset_by_token(token: str) -> dict[str, Any] | None:
    """按一次性令牌查待确认的重置（未用过、未过期）。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, r.user_id, r.session_id, u.name
                  FROM pending_password_resets r
                  JOIN users u ON u.id = r.user_id
                 WHERE r.token = %s
                   AND r.used_at IS NULL
                   AND r.expires_at > now()
                 LIMIT 1
                """,
                (token,),
            )
            return cur.fetchone()


def get_user_id_by_qq(qq_number: str) -> str | None:
    """按 QQ 号取用户 id（重置流程用）。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE qq_number = %s LIMIT 1", (qq_number,))
            row = cur.fetchone()
            return str(row["id"]) if row else None


def get_reset_token_for_user(user_id: str) -> dict[str, Any] | None:
    """取该用户当前有效（未用、未过期）的一次性重置令牌。"""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT token FROM pending_password_resets
                 WHERE user_id = %s AND used_at IS NULL AND expires_at > now()
                 ORDER BY created_at DESC LIMIT 1
                """,
                (user_id,),
            )
            return cur.fetchone()


def mark_reset_confirmed(user_id: str) -> bool:
    """把该用户最近一笔有效的重置待确认标记为「已确认」。

    返回是否标记成功（没有有效待确认时为 False）。

    ⚠️ 只做标记，**不碰任何凭据** —— 改密仍需网站在同一浏览器里校验发起 cookie。
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pending_password_resets
                   SET confirmed_at = now()
                 WHERE id = (
                       SELECT id FROM pending_password_resets
                        WHERE user_id = %s AND used_at IS NULL AND expires_at > now()
                        ORDER BY created_at DESC LIMIT 1
                       )
                   AND confirmed_at IS NULL
                RETURNING id
                """,
                (user_id,),
            )
            ok = cur.fetchone() is not None
        conn.commit()
    return ok

