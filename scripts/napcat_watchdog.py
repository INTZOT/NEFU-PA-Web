#!/usr/bin/env python3
"""NapCat 登录看门狗。

运行位置：宿主机（非容器）—— 只有它能重启容器。

它解决什么问题：
  QQ 服务端偶发地把机器人账号踢下线（日志出现 KickedOffLine 与「你的账号当前登录已失效」）。
  NapCat 随后会**在容器内部重启**，但 entrypoint 不会重跑，
  于是启动时那个关键参数 -q <QQ号>（快速登录）就丢了，
  NapCat 退化成二维码登录、卡住等人扫 —— 而没人知道它掉了。
  实测停摆可达数小时。

它做什么：
  发现「未连接 + 日志里有 KickedOffLine」时，重启 napcat 容器。
  容器重启会让 entrypoint 重跑，-q 参数恢复，于是自动快速登录。

为什么必须防循环：
  若会话是真的失效（不是被踢），重启也登不上，就会无限重启。
  因此冷却窗口内只尝试一次，并把尝试记录写到状态文件，
  由超管面板展示；自动恢复失败时，管理者在面板上能看到二维码并手动扫。

用法：
    python3 scripts/napcat_watchdog.py            # 单次检查（供 systemd timer 调用）
    python3 scripts/napcat_watchdog.py --dry-run  # 只报告，不真的重启
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = PROJECT_DIR / "state"
STATE_FILE = STATE_DIR / "protocol-watchdog.json"
# 兼容改造前的状态文件名，避免丢掉「上次尝试」的记录
_LEGACY_STATE_FILE = STATE_DIR / "napcat-watchdog.json"

BOT_SERVICE = os.environ.get("BOT_SERVICE", "bot")

# 可能存在的协议端容器，按优先级排列。
#
# 为什么是「多个」：项目里同时有两套实现（LLBot 为主、NapCat 备选），
# **同一时间只启用一个**。看门狗不该写死其中一个 ——
# 它会自动找出正在运行的那个，并对它做重启与日志判断。
#
# 识别方式不用 `docker ps`（需解析输出），而是直接探测 compose 服务名：
# docker compose ps -q <service> 在服务未运行时返回空。
PROTOCOL_CANDIDATES = [
    {
        "service": "llbot",
        "container": os.environ.get("LLBOT_CONTAINER", "nefu-pa-web-llbot-1"),
        "profile": "llbot",
    },
    {
        "service": "napcat",
        "container": os.environ.get("NAPCAT_CONTAINER", "nefu-pa-web-napcat-1"),
        "profile": "napcat",
    },
]

# 被踢下线的日志特征。
#
# ⚠️ 只放**明确表示「服务端主动踢下线」**的措辞，**不要**放 `Login Error`：
#   扫码登录时也会周期性打印 Login Error（每次换码都有一条），
#   把它当成被踢标志会在正常登录过程中触发重启 —— 反而制造不稳定。
#
# LLBot 的措辞已实测确认（见下）。
KICK_MARKERS = ["KickedOffLine", "下线通知"]

# 「登录态已失效」的特征 —— 两个协议端用词不同：
#   NapCat: "登录态已失效" / "你的用户身份已失效"
#   LLBot : "SSO Heartbeat.Alive failed" / "身份验证失败，请你重新登录"
#
# 为什么单独一类：这类状态下**服务端已作废会话，重启也没用**（凭据同样失效），
# 必须人工扫码。把它与「被踢」区分开，可以让看门狗不去做无谓的重启，
# 也让面板能如实告诉用户「需要你扫一下码」。
SESSION_DEAD_MARKERS = [
    "登录态已失效",
    "用户身份已失效",
    "Heartbeat.Alive] Failed",
    "身份验证失败，请你重新登录",
]

# 判断「登录态已死」时回看的日志时间窗。
# 取 5 分钟：协议端的心跳间隔是秒级/分钟级，5 分钟内没有心跳失败
# 就应认为会话是活的；窗口太长会把早已恢复的旧失败也算进来。
ALIVE_LOOKBACK = os.environ.get("WATCHDOG_ALIVE_LOOKBACK", "5m")

# 冷却窗口：这段时间内不重复尝试自动重启。
# 取 30 分钟 —— 足够覆盖「重启 → 快速登录 → 确认成功」的全过程。
COOLDOWN_SECONDS = int(os.environ.get("WATCHDOG_COOLDOWN", "1800"))

# 看多久之前的日志用来判断是否被踢
LOG_LOOKBACK = os.environ.get("WATCHDOG_LOOKBACK", "40m")

DOCKER = os.environ.get("DOCKER_BIN", "/usr/bin/docker")


def log(msg: str) -> None:
    print(f"[watchdog] {msg}", flush=True)


def compose(*args: str, timeout: int = 120) -> subprocess.CompletedProcess:
    """在项目目录里执行 docker compose 命令。

    注意用 compose exec 而不是 docker exec：
    本机的 docker CLI 不支持 docker exec -T（-T 是 compose 的选项）。
    """
    return subprocess.run(
        [DOCKER, "compose", *args],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def bot_connected() -> bool:
    """向 bot 容器内的 /status 询问协议端是否已连接。

    这是判断「机器人是否在工作」的唯一真相源 ——
    不靠 NapCat 日志猜，因为日志里既有历史错误也有重启噪音。
    """
    script = (
        "import urllib.request;"
        "print(urllib.request.urlopen('http://127.0.0.1:8000/status',timeout=5).read().decode())"
    )
    try:
        res = compose("exec", "-T", BOT_SERVICE, "python3", "-c", script, timeout=30)
        if res.returncode != 0:
            return False
        return json.loads(res.stdout.strip()).get("connected") is True
    except Exception as exc:  # noqa: BLE001
        log(f"查询 bot 状态失败：{exc}")
        return False


def session_dead(container: str) -> bool:
    """看近期日志里有没有「登录态已失效」的证据。

    ⚠️ 这个判断是给**面板显示**用的，动机是一次真实踩坑：
    LLBot 被服务端作废会话后**并不断开 WebSocket** —— 它继续上报 meta_event，
    只是心跳一直失败。于是 bot 侧看到连接正常、面板显示「运行中」，
    而实际上机器人已经收不到任何消息了。

    这种「假在线」比明显掉线更危险，所以必须单独判断。
    """
    try:
        res = subprocess.run(
            [DOCKER, "logs", "--since", ALIVE_LOOKBACK, container],
            capture_output=True,
            text=True,
            timeout=60,
        )
        text = res.stdout + res.stderr
        return any(m in text for m in SESSION_DEAD_MARKERS)
    except Exception as exc:  # noqa: BLE001
        log(f"读取 {container} 日志失败：{exc}")
        return False


def active_protocol() -> dict | None:
    """找出当前正在运行的协议端。

    用 `compose ps -q <service>`：服务未运行时输出为空。
    比解析 `docker ps` 的表格输出可靠。

    **必须带 --profile** —— 两个服务都声明在 profiles 里，
    不带 profile 时 compose 会认为该服务不存在。
    """
    for cand in PROTOCOL_CANDIDATES:
        try:
            res = compose(
                "--profile", cand["profile"], "ps", "-q", cand["service"], timeout=30
            )
            if res.returncode == 0 and res.stdout.strip():
                return cand
        except Exception as exc:  # noqa: BLE001
            log(f"探测 {cand['service']} 失败：{exc}")
    return None


def kicked_offline(container: str) -> bool:
    """看协议端近期日志里有没有「被踢下线」的迹象。

    只有被踢才值得自动重启 —— 若是别的原因（比如容器正在启动），
    重启反而会打断正常的启动过程。
    """
    try:
        res = subprocess.run(
            [DOCKER, "logs", "--since", LOG_LOOKBACK, container],
            capture_output=True,
            text=True,
            timeout=60,
        )
        text = res.stdout + res.stderr
        return any(m in text for m in KICK_MARKERS)
    except Exception as exc:  # noqa: BLE001
        log(f"读取 {container} 日志失败：{exc}")
        return False


def read_state() -> dict:
    for path in (STATE_FILE, _LEGACY_STATE_FILE):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
    return {}


def write_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    # 原子替换：避免 web 侧读到写了一半的文件
    tmp.replace(STATE_FILE)


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    state = read_state()
    now = int(time.time())
    state["checkedAt"] = now

    # 无论连没连上，都记录当前在跑的协议端 —— 面板据此决定读哪个二维码文件。
    current = active_protocol()
    state["activeService"] = current["service"] if current else None

    # 另外记录「登录态是否还有效」——面板据此区分「真在线」与「假在线」。
    # LLBot 被作废会话后不会断开 WebSocket，只看连接状态会误判为正常。
    state["sessionDead"] = (
        session_dead(current["container"]) if current else False
    )

    if bot_connected():
        # 已连接：清掉「上次尝试」的痕迹，面板上就不会一直挂着告警
        if state.get("lastAttemptAt"):
            state["recoveredAt"] = now
            state.pop("lastAttemptAt", None)
            state.pop("lastAttemptResult", None)
        state.pop("lastSkipReason", None)
        write_state(state)
        svc = current["service"] if current else "未知"
        if state["sessionDead"]:
            # 连接看着是好的，但登录态已失效 —— 必须点明，否则会误以为一切正常。
            log(
                f"⚠️ {svc} 连接看似正常，但登录态已失效（假在线）——"
                "机器人实际收不到消息，需要人工扫码重新登录"
            )
        else:
            log(f"协议端已连接（当前为 {svc}），无需处理")
        return 0

    log("协议端未连接")

    # 找出**正在运行的那个**协议端 —— 项目里同时存在 LLBot 与 NapCat，
    # 同一时间只启用一个。写死其中一个会在切换后失效。
    proto = current
    if proto is None:
        log("没有任何协议端容器在运行 —— 无法自动恢复，需人工处理")
        state["lastSkipReason"] = "no-protocol"
        write_state(state)
        return 0

    if state["sessionDead"]:
        # 登录态已被服务端作废，本地凭据一并失效 —— 重启恢复不了。
        # 不做无谓重启，如实记录「需要人工扫码」，让人从面板上看到。
        log(f"{proto['service']} 登录态已失效（需人工扫码），重启无用，本次不动")
        state["lastSkipReason"] = "session-dead"
        write_state(state)
        return 0

    if not kicked_offline(proto["container"]):
        log(f"{proto['service']} 近期日志里没有被踢记录 —— 可能正在启动，本次不动")
        state["lastSkipReason"] = "not-kicked"
        write_state(state)
        return 0

    last = int(state.get("lastAttemptAt") or 0)
    elapsed = now - last
    if last and elapsed < COOLDOWN_SECONDS:
        log(f"冷却中：{elapsed} 秒前已尝试过（窗口 {COOLDOWN_SECONDS} 秒），本次不重试")
        state["lastSkipReason"] = "cooldown"
        write_state(state)
        return 0

    if dry_run:
        log(f"[dry-run] 本应重启 {proto['service']} 容器")
        return 0

    log(f"检测到被踢下线且不在冷却期，重启 {proto['service']}（容器 {proto['container']}）")
    try:
        # compose restart 会让容器的启动流程重跑，从而恢复快速登录参数
        # （LLBot 读 AUTO_LOGIN_QQ，NapCat 读 ACCOUNT）。
        # 必须带 --profile —— 两个服务都在 profiles 里，默认不参与 compose 命令。
        res = compose("--profile", proto["profile"], "restart", proto["service"], timeout=180)
        ok = res.returncode == 0
        result = "restarted" if ok else f"failed: {(res.stderr or '').strip()[:200]}"
    except Exception as exc:  # noqa: BLE001
        ok = False
        result = f"failed: {exc}"

    state["lastAttemptAt"] = now
    state["lastAttemptResult"] = result
    state["lastAttemptService"] = proto["service"]
    state.pop("lastSkipReason", None)
    write_state(state)
    log(f"重启结果：{result}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
