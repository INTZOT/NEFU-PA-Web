"""三条流程的处理逻辑。

职责范围（D-14、D-19）：
    1. 收到「注册」→ 查重 → 生成邀请码 → 回复
    2. 收到「重置密码」→ 建立重置会话 → 提示输入新密码
    3. 处于重置会话中 → 收到新密码 → 写入并结束

对话状态存放在数据库（reset_tokens），机器人本身无状态（D-19）。
"""

from __future__ import annotations

import asyncio
import logging
import os

from . import db, shared_rules

log = logging.getLogger("bot.handlers")

REGISTER_COMMAND = "注册"
RESET_COMMAND = "重置密码"
MIN_PASSWORD = 6


def _site_url() -> str:
    return os.environ.get("SITE_URL", "").rstrip("/")


def _register_hint(code: str) -> str:
    """注册引导文案。邀请码属凭据级信息，故强调不要转发。"""
    lines = [
        "你的邀请码：",
        code,
        "",
    ]
    url = _site_url()
    if url:
        lines.append(f"注册地址：{url}/register")
        lines.append("")
    lines.append("注册时填：姓名、学号、密码、邀请码。")
    lines.append("QQ 号会自动带入，不需要你填。")
    lines.append("")
    lines.append("⚠️ 不要把邀请码转发给别人 —— 它等同于你的注册凭证。")
    return "\n".join(lines)


async def _reply(send, user_id: str, text: str) -> None:
    await send(user_id, text)


async def handle_message(send, user_id: str, text: str) -> None:
    """处理一条私聊消息。send 是一个 `await send(user_id, text)` 可调用对象。"""
    content = text.strip()
    if not content:
        return

    # ---- 优先级 1：若处于重置会话中，本条消息即新密码 ----
    # 先查用户，再判断是否有待完成的重置会话
    user = await asyncio.to_thread(db.find_user_by_qq, user_id)
    if user is not None:
        pending = await asyncio.to_thread(db.get_pending_reset, user["id"])
        if pending is not None:
            # 用户可能改主意去发别的指令：只有明显不是指令时才当作密码
            if content not in (REGISTER_COMMAND, RESET_COMMAND):
                await _apply_new_password(send, user_id, user, pending, content)
                return

    # ---- 指令：注册 ----
    if content == REGISTER_COMMAND:
        await _handle_register(send, user_id, user)
        return

    # ---- 指令：重置密码 ----
    if content == RESET_COMMAND:
        await _handle_reset_start(send, user_id, user)
        return

    # ---- 其他：给出可用指令 ----
    await _reply(
        send,
        user_id,
        "可用指令：\n· 注册\n· 重置密码",
    )


async def _handle_register(send, user_id: str, user: dict | None) -> None:
    # 已注册 → 拒绝（D-13：一个 QQ 号只能注册一次）
    if user is not None:
        await _reply(send, user_id, "你已经注册过了，无需重复注册。\n如需重置密码，发送：重置密码")
        return

    existing = await asyncio.to_thread(db.find_invite_by_qq, user_id)
    if existing is not None and existing.get("used_at") is None:
        # 重复申领 → 返回同一个码（D-13）
        await _reply(send, user_id, _register_hint(existing["code"]))
        return

    # 首次申领 → 生成并绑定
    try:
        code = await asyncio.to_thread(shared_rules.generate_invite_code)
        await asyncio.to_thread(db.create_invite, user_id, code)
    except Exception:
        log.exception("生成邀请码失败")
        await _reply(send, user_id, "生成邀请码失败，请稍后再试或联系管理员。")
        return

    await _reply(send, user_id, _register_hint(code))


async def _handle_reset_start(send, user_id: str, user: dict | None) -> None:
    if user is None:
        await _reply(send, user_id, "你还没有注册。发送「注册」获取邀请码。")
        return

    pending = await asyncio.to_thread(db.get_pending_reset, user["id"])
    if pending is None:
        await asyncio.to_thread(db.create_reset_session, user["id"])

    await _reply(
        send,
        user_id,
        "请输入新密码（至少 6 位）。\n"
        "提醒：新密码会经过 QQ 聊天记录，请勿使用你在其他网站用过的密码。",
    )


async def _apply_new_password(send, user_id: str, user: dict, pending: dict, plain: str) -> None:
    if len(plain) < MIN_PASSWORD:
        await _reply(send, user_id, f"密码至少 {MIN_PASSWORD} 位，请重新输入。")
        return

    try:
        hashed = await asyncio.to_thread(shared_rules.hash_password, plain)
        await asyncio.to_thread(db.complete_reset, pending["id"], user["id"], hashed)
    except Exception:
        log.exception("重置密码失败")
        await _reply(send, user_id, "重置失败，请稍后再试或联系管理员。")
        return

    await _reply(send, user_id, "密码已重置，可以用新密码登录了。")
