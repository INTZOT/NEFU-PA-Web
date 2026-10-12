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
STATE_FILE = STATE_DIR / "napcat-watchdog.json"

CONTAINER = os.environ.get("NAPCAT_CONTAINER", "nefu-pa-web-napcat-1")
BOT_SERVICE = os.environ.get("BOT_SERVICE", "bot")

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


def kicked_offline() -> bool:
    """看 NapCat 近期日志里有没有「被踢下线」。

    只有被踢才值得自动重启 —— 若是别的原因（比如容器正在启动），
    重启反而会打断正常的启动过程。
    """
    try:
        res = subprocess.run(
            [DOCKER, "logs", "--since", LOG_LOOKBACK, CONTAINER],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return "KickedOffLine" in (res.stdout + res.stderr)
    except Exception as exc:  # noqa: BLE001
        log(f"读取 NapCat 日志失败：{exc}")
        return False


def read_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
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

    if bot_connected():
        # 已连接：清掉「上次尝试」的痕迹，面板上就不会一直挂着告警
        if state.get("lastAttemptAt"):
            state["recoveredAt"] = now
            state.pop("lastAttemptAt", None)
            state.pop("lastAttemptResult", None)
        state.pop("lastSkipReason", None)
        write_state(state)
        log("协议端已连接，无需处理")
        return 0

    log("协议端未连接")

    if not kicked_offline():
        log("但近期日志里没有被踢记录 —— 可能正在启动，本次不动")
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
        log("[dry-run] 本应重启 napcat 容器")
        return 0

    log(f"检测到被踢下线且不在冷却期，重启 napcat（容器 {CONTAINER}）")
    try:
        # compose restart 会让 entrypoint 重跑，从而恢复 -q 快速登录参数。
        # 必须带 --profile napcat —— 该服务在 profiles 里，默认不参与 compose 命令。
        res = compose("--profile", "napcat", "restart", "napcat", timeout=180)
        ok = res.returncode == 0
        result = "restarted" if ok else f"failed: {(res.stderr or '').strip()[:200]}"
    except Exception as exc:  # noqa: BLE001
        ok = False
        result = f"failed: {exc}"

    state["lastAttemptAt"] = now
    state["lastAttemptResult"] = result
    state.pop("lastSkipReason", None)
    write_state(state)
    log(f"重启结果：{result}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
