"""机器人回复文案：从网站取模板、填占位符。

为什么文案住在网站侧：
    管理员在后台改的就是它。机器人只取用、不自己存一份 ——
    两边各存一份必然漂移（与密码加密同理：规则只实现一份）。

为什么带缓存（TTL 60 秒）：
    每条消息都请求一次网站会给 web 带来无谓压力。
    60 秒的延迟对「改完文案想立刻看效果」完全够用，
    同时**不需要重启机器人**——这正是需求里要求的。

为什么取不到时用内置兜底：
    网站挂了不能连机器人一起变哑巴。兜底文案与网站侧默认值一致，
    是**有意的重复**：这里保证机器人在网站不可用时仍能工作。
"""

from __future__ import annotations

import logging
import os
import time

from . import shared_rules

log = logging.getLogger("bot")

CACHE_TTL_SECONDS = 60

# 内置兜底文案（与 web/src/modules/bot/messages.ts 的 fallback 保持一致）。
# 故意重复：网站不可用时机器人仍要能回复。
_FALLBACKS: dict[str, str] = {
    "bot.register.reply": (
        "你的邀请码：\n{code}\n\n注册地址：{url}/register\n\n"
        "注册时填：姓名、学号、密码、邀请码。\nQQ 号会自动带入，不需要你填。\n\n"
        "⚠️ 不要把邀请码转发给别人 —— 它等同于你的注册凭证。"
    ),
    "bot.register.already": "你已经注册过了，无需重复注册。\n如需重置密码，发送：重置密码",
    "bot.reset.prompt": (
        "请输入新密码（至少 {minPassword} 位）。\n"
        "提醒：新密码会经过 QQ 聊天记录，请勿使用你在其他网站用过的密码。"
    ),
    "bot.reset.notRegistered": "你还没有注册。发送「注册」获取邀请码。",
    "bot.reset.tooShort": "密码至少 {minPassword} 位，请重新输入。",
    "bot.reset.done": "密码已重置，其他设备上的登录已失效，可以用新密码登录了。",
    "bot.register.failed": "生成邀请码失败，请稍后再试或联系管理员。",
    "bot.reset.failed": "重置失败，请稍后再试或联系管理员。",
    "bot.unknown": (
        "我可以帮你注册与重置密码。\n发送「注册」获取邀请码，发送「重置密码」修改密码。"
    ),
    # ---- 群聊确认流程（D-45）----
    "bot.group.confirmPrompt": (
        "{name} 请回复「确认注册」来完成注册。\n"
        "（如果你没有注册过，忽略这条消息即可）"
    ),
    "bot.group.confirmResetPrompt": (
        "{name} 有人请求重置你的密码。\n"
        "如果这是你本人操作，请回复「确认重置」；\n"
        "如果不是你，请忽略这条消息。"
    ),
    "bot.group.registerDone": "✅ 注册成功，现在可以到网站登录了。",
    "bot.group.resetDone": (
        "✅ 已确认。请回到刚才那个浏览器页面设置新密码（10 分钟内有效）。"
    ),
    "bot.group.confirmExpired": "这次注册确认已超时，请回到网站重新发起。",
    "bot.group.resetExpired": "这次重置确认已超时，请回到网站重新发起。",
    "bot.group.confirmFailed": "处理时出错了，请稍后再试或联系管理员。",
    # ---- 群内查询（D-46）----
    "bot.group.roomList": (
        "🏓 当前有 {count} 个约球：\n{list}\n\n"
        "到网站「约球」页可以申请加入。"
    ),
    "bot.group.eventList": (
        "📅 即将开始的活动（{count} 个）：\n{list}\n\n"
        "到网站「活动」页可以报名。"
    ),
    "bot.group.noRooms": "目前没有正在招募的约球。\n你可以在网站「约球」页发起一个。",
    "bot.group.noEvents": "目前没有即将开始的活动。",
    "bot.group.queryFailed": "查询出错了，请稍后再试。",
    # ---- 帮助 ----
    "bot.group.help": (
        "我是社团机器人，在群里可以做这些事：\n"
        "\n"
        "· 查询约球 —— 看当前有哪些约球、还差几人\n"
        "· 查询活动 —— 看即将开始的活动、还剩几个名额\n"
        "· 确认注册 —— 完成注册（网站提交后会 @ 你）\n"
        "· 确认重置 —— 确认重置密码（网站提交后会 @ 你）\n"
        "\n"
        "注册与找回密码都在网站上发起，不用私聊我。"
    ),
}

_cache: dict[str, str] | None = None
_cache_at: float = 0.0


def _fetch() -> dict[str, str] | None:
    """向网站取全部模板。失败返回 None（由调用方决定回退）。"""
    try:
        result = shared_rules._post({"op": "get-bot-messages"})
        items = result.get("messages")
        if not isinstance(items, list):
            return None
        out: dict[str, str] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            key = item.get("key")
            template = item.get("template")
            # ⚠️ 空字符串是**有意义的取值**，不能当「没取到」丢掉。
            #
            # 管理员把某条文案留空 = 明确表示「这条不要回复」（目前用于
            # bot.unknown 静默）。这里曾写成 `and template`，于是空值被丢弃、
            # 回退到内置默认文案，静默功能直接失效 —— 而且表面上「设置成功」，
            # 排查时很容易被误导。
            if isinstance(key, str) and isinstance(template, str):
                out[key] = template
        # 只有一条都没拿到才算失败；拿到空值也算成功。
        return out or None
    except Exception as exc:  # noqa: BLE001
        log.warning("获取机器人文案失败，将使用内置兜底：%s", exc)
        return None


def _templates() -> dict[str, str]:
    """取模板（带 TTL 缓存）。网站不可用时回退到内置文案。"""
    global _cache, _cache_at

    now = time.monotonic()
    if _cache is not None and now - _cache_at < CACHE_TTL_SECONDS:
        return _cache

    fetched = _fetch()
    if fetched is not None:
        _cache = fetched
        _cache_at = now
        return fetched

    # 取不到：用上一次成功的缓存（若有），否则用内置兜底
    if _cache is not None:
        return _cache
    return _FALLBACKS


def message(key: str, **values: object) -> str:
    """取一条文案并填占位符。

    未知的占位符会被原样保留 —— 不静默删掉，
    这样文案写错时能一眼看出来，而不是丢失信息。
    """
    # ⚠️ 必须按「键是否存在」判断，**不能**用 `or` 链。
    #
    # 空字符串是有意义的取值（管理员把该文案留空 = 这条不要回复），
    # 而空串在 Python 里是假值 —— 用 `x or y` 会让它一路回退到内置默认文案，
    # 「留空即静默」就永远不生效。
    #
    # 这个坑在本文件里出现过三次（_fetch 的过滤、这里的取值），
    # 每次表面上都「保存成功」，排查代价很大 —— 所以这里显式区分「键不存在」与「值为空」。
    templates = _templates()
    if key in templates:
        template = templates[key]
    else:
        template = _FALLBACKS.get(key, "")

    site_url = os.environ.get("SITE_URL", "").rstrip("/")
    context: dict[str, object] = {"url": site_url, **values}

    out = template
    for name, value in context.items():
        out = out.replace("{" + name + "}", str(value))
    return out
