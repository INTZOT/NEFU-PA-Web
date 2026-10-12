"""数据库读写。

机器人直连数据库（D-19、R-105）。它只碰三张表：
    users / invite_codes / reset_tokens

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
