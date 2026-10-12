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

from . import db, messages, shared_rules

log = logging.getLogger("bot.handlers")

REGISTER_COMMAND = "注册"
RESET_COMMAND = "重置密码"
MIN_PASSWORD = 6


def _register_hint(code: str) -> str:
    """注册引导文案（模板可自定义，见 messages 模块）。

    邀请码属凭据级信息，因此默认文案里强调了不要转发；
    但文案本身由管理员在后台维护，这里只负责填 {code}。
    """
    return messages.message("bot.register.reply", code=code)


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
    await _reply(send, user_id, messages.message("bot.unknown"))


async def _handle_register(send, user_id: str, user: dict | None) -> None:
    # 已注册 → 拒绝（D-13：一个 QQ 号只能注册一次）
    if user is not None:
        await _reply(send, user_id, messages.message("bot.register.already"))
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
        await _reply(send, user_id, messages.message("bot.register.failed"))
        return

    await _reply(send, user_id, _register_hint(code))


async def _handle_reset_start(send, user_id: str, user: dict | None) -> None:
    if user is None:
        await _reply(send, user_id, messages.message("bot.reset.notRegistered"))
        return

    pending = await asyncio.to_thread(db.get_pending_reset, user["id"])
    if pending is None:
        await asyncio.to_thread(db.create_reset_session, user["id"])

    await _reply(
        send,
        user_id,
        messages.message("bot.reset.prompt", minPassword=MIN_PASSWORD),
    )


async def _apply_new_password(send, user_id: str, user: dict, pending: dict, plain: str) -> None:
    if len(plain) < MIN_PASSWORD:
        await _reply(
            send, user_id, messages.message("bot.reset.tooShort", minPassword=MIN_PASSWORD)
        )
        return

    try:
        hashed = await asyncio.to_thread(shared_rules.hash_password, plain)
        await asyncio.to_thread(db.complete_reset, pending["id"], user["id"], hashed)
        # 密码是这个账号的唯一凭据：改了就必须让旧登录态失效
        await asyncio.to_thread(shared_rules.invalidate_sessions, user_id)
    except Exception:
        log.exception("重置密码失败")
        await _reply(send, user_id, messages.message("bot.reset.failed"))
        return

    await _reply(send, user_id, messages.message("bot.reset.done"))
