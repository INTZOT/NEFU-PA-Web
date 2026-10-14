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
from datetime import datetime
from zoneinfo import ZoneInfo

from . import db, messages

# 北京时间。显式指定，不依赖容器的本地时区设置。
TZ_CN = ZoneInfo("Asia/Shanghai")

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
    elif content in QUERY_ROOMS:
        await _query_rooms(send_group)
    elif content in QUERY_EVENTS:
        await _query_events(send_group)
    elif content == QUERY_ALL:
        await _query_all(send_group)
    elif content in HELP_COMMANDS:
        await send_group(messages.message("bot.group.help"))
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

# ---------------------------------------------------------------------------
# 群内查询：约球 / 活动（D-46）
# ---------------------------------------------------------------------------

# 群内可用的查询词。做成多个别名，因为中文里这几种说法都自然。
QUERY_ALL = "查询"
QUERY_ROOMS = ("查询约球", "约球", "查约球")
QUERY_EVENTS = ("查询活动", "活动", "查活动")

# 帮助。做成多个别名，因为群里有人会打「菜单」「命令」之类。
HELP_COMMANDS = ("帮助", "help", "菜单", "命令")


def _fmt_time(start, end) -> str:
    """把时间渲染成群里好读的样子（今天/明天 + 北京时间）。

    ⚠️ 必须**显式**转成北京时间，不能依赖容器的本地时区。

    原因：数据库返回的 timestamptz 是**带时区的时间点**（psycopg 取出来通常是 UTC），
    而 `datetime.now()` 是容器的本地时间。之前直接混用两者，
    结果是北京时间 09:35 的约球被显示成「今天 01:35」——
    看起来像数据错了，实际是少了一次时区换算。

    显式换算还有个好处：即使将来容器 TZ 配错了，显示仍然正确。
    """
    if start is None:
        return "时间待定"

    start = start.astimezone(TZ_CN)
    end = end.astimezone(TZ_CN) if end is not None else None

    # 「今天/明天」比日期更贴近群里的说话习惯
    today = datetime.now(TZ_CN).date()
    delta = (start.date() - today).days
    if delta == 0:
        prefix = "今天"
    elif delta == 1:
        prefix = "明天"
    elif 1 < delta < 7:
        prefix = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][start.weekday()]
    else:
        prefix = f"{start.month}月{start.day}日"

    out = f"{prefix} {start.strftime('%H:%M')}"
    if end is not None:
        return out + f"-{end.strftime('%H:%M')}"
    return out + " 开始"


async def _query_rooms(send_group) -> None:
    """列出当前有效的约球。"""
    try:
        rooms = await asyncio.to_thread(db.list_open_rooms)
    except Exception:
        log.exception("查询约球失败")
        await send_group(messages.message("bot.group.queryFailed"))
        return

    if not rooms:
        await send_group(messages.message("bot.group.noRooms"))
        return

    lines: list[str] = []
    for r in rooms:
        ts = _fmt_time(r["start_at"], r["end_at"])
        approved = r["approved"] or 0
        pending = r["pending"] or 0
        capacity = r["capacity"]
        # 发起人占一个名额
        joined = approved + 1
        seats = max(0, capacity - joined)
        status = "已满" if seats == 0 else f"还差 {seats} 人"
        line = f"· {ts}｜{r["initiator_name"]}｜{joined}/{capacity}（{status}）"
        if pending:
            line += f"｜待处理 {pending}"
        lines.append(line)

    body = "\n".join(lines)
    await send_group(messages.message("bot.group.roomList", count=len(rooms), list=body))


async def _query_events(send_group) -> None:
    """列出即将开始的活动。"""
    try:
        events = await asyncio.to_thread(db.list_upcoming_events)
    except Exception:
        log.exception("查询活动失败")
        await send_group(messages.message("bot.group.queryFailed"))
        return

    if not events:
        await send_group(messages.message("bot.group.noEvents"))
        return

    lines: list[str] = []
    for e in events:
        ts = _fmt_time(e["start_at"], None).replace(" 开始", "")
        kind = "双打" if e["format"] == "doubles" else "单打"
        unit = "队" if e["capacity_unit"] == "teams" else "人"
        registered = e["registered"] or 0
        waitlisted = e["waitlisted"] or 0
        capacity = e["capacity"]
        seats = max(0, capacity - registered)
        status = "已满" if seats == 0 else f"还剩 {seats}{unit}"
        line = f"· {ts}｜{e['title']}（{kind}）｜{registered}/{capacity}（{status}）"
        if e["location"]:
            line += f"｜{e['location']}"
        if waitlisted:
            line += f"｜候补 {waitlisted}"
        lines.append(line)

    body = "\n".join(lines)
    await send_group(messages.message("bot.group.eventList", count=len(events), list=body))


async def _query_all(send_group) -> None:
    """「查询」不带宾语时：两样都给。"""
    await _query_rooms(send_group)
    await _query_events(send_group)

