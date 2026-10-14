"""群聊确认流程（D-45）：注册与重置密码。

为什么把确认搬到群聊：
    机器人**非好友私聊**是腾讯风控的高危模式（陌生人私聊骚扰的典型特征）。
    原流程要求成员先私聊机器人拿邀请码，于是每次注册都产生一次陌生私聊。

安全依据是「**双向匹配**」，两点缺一不可：
    1. 机器人 @ 的是**目标本人**（@ 只是提醒，不是凭据）；
    2. bot 只认**发言者的 QQ 号**（消息文本里写的号码一律不信）。
    攻击者无法用别人的号在群里发言，因此无法代他人确认。

全过程**不在群里传任何凭据**：
    注册：确认即在服务端建号，群里只回一句成功提示；
    重置：一次性改密令牌**只发在私聊**，群里只回一句成功提示。
"""

from __future__ import annotations

import asyncio
import logging
import os

from . import db, messages

log = logging.getLogger("bot.group")

# 群内确认词。用明确的措辞而不是泛泛的「确认」——
# 逼用户读一眼，降低「看到 @ 就顺手回复」的误确认风险（社交工程缓解）。
CONFIRM_REGISTER = "确认注册"
CONFIRM_RESET = "确认重置"


def group_id() -> str:
    """要监听的群。未配置则不处理任何群消息。"""
    return os.environ.get("BOT_GROUP_ID", "").strip()


def site_url() -> str:
    return os.environ.get("SITE_URL", "").rstrip("/")


async def handle_group_message(
    *, group: str, sender: str, text: str, send_group, send_private
) -> None:
    """处理一条群消息。

    send_group(text)    —— 在当前群里回一句
    send_private(qq, text) —— 给指定 QQ 号发私聊（仅用于一次性令牌）
    """
    want = group_id()
    if not want:
        return
    if group != want:
        # 只认配置的那个群：别的群一律不响应，避免误触发
        return

    content = text.strip()
    if content == CONFIRM_REGISTER:
        await _confirm_registration(sender, send_group)
    elif content == CONFIRM_RESET:
        await _confirm_reset(sender, send_group)
    # 其他群消息**静默**：群里闲聊不该触发机器人（会刷屏、也招风控）


async def _confirm_registration(qq_number: str, send_group) -> None:
    """群内确认注册。发言者的 QQ 号就是全部凭据。"""
    try:
        result = await asyncio.to_thread(db.confirm_registration, qq_number)
    except Exception:
        log.exception("确认注册失败")
        await send_group(messages.message("bot.group.confirmFailed"))
        return

    if result == "ok":
        await send_group(messages.message("bot.group.registerDone"))
        return
    if result == "expired":
        await send_group(messages.message("bot.group.confirmExpired"))
        return
    # none：该号没有待确认。可能是群里闲聊时碰巧发了这几个字 —— 保持安静更合适。
    log.info("群内确认注册：无待确认记录 qq=%s", qq_number)


async def _confirm_reset(qq_number: str, send_group) -> None:
    """群内确认重置密码 → 标记为可改密（**改密在网站同一浏览器里完成**）。

    为什么不发链接（方案 B）：
        发链接的方案有个真实缺陷 —— 「谁发起」与「谁确认」可能是两个人。
        攻击者可以发起重置，再诱导被 @ 的人「看到提醒就顺手回复确认」，
        于是凭据落到攻击者能诱导到的位置。

        改成「同浏览器完成」后，改密**额外要求带着发起时的 httpOnly cookie**，
        攻击者拿不到受害者浏览器里的 cookie，因此即使诱导成功也改不了密码。
        顺带还彻底不需要私聊 —— 机器人不需要主动联系任何人。
    """
    try:
        user_id = await asyncio.to_thread(db.get_user_id_by_qq, qq_number)
    except Exception:
        log.exception("查询用户失败")
        await send_group(messages.message("bot.group.confirmFailed"))
        return

    if user_id is None:
        # 该号未注册，或没有待确认的重置（可能是群里闲聊碰巧发了这几个字）
        log.info("群内确认重置：该号未注册 qq=%s", qq_number)
        return

    try:
        marked = await asyncio.to_thread(db.mark_reset_confirmed, user_id)
    except Exception:
        log.exception("标记重置确认失败")
        await send_group(messages.message("bot.group.confirmFailed"))
        return

    if not marked:
        # 没有有效的待确认（过期 / 不是他发起的）—— 群里保持安静，避免刷屏
        log.info("群内确认重置：无有效待确认 qq=%s", qq_number)
        return

    await send_group(messages.message("bot.group.resetDone"))
