"""QQ 机器人服务入口。

架构位置（D-19）：
    机器人无状态，业务数据全在数据库；
    密码加密与邀请码生成调用网站侧的共享规则接口；
    因此它只做「收消息 → 判断 → 回复」三件事。

连接方式：**反向 WebSocket**。
    机器人启动一个 WebSocket 服务端（默认 :3002），
    NapCat 作为客户端连上来。这样协议端重连、换号都不影响机器人。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import websockets

from . import messages, shared_rules
from .group_handlers import group_id, handle_group_message
from .handlers import handle_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("bot")

HEALTH_PORT = int(os.environ.get("BOT_HEALTH_PORT", "8000"))
WS_PORT = int(os.environ.get("BOT_WS_PORT", "3002"))
ACCESS_TOKEN = os.environ.get("ONEBOT_ACCESS_TOKEN", "")


# 协议端是否已连接。
#
# 这是「机器人是否在工作」的**唯一真相源** —— bot 与 NapCat 之间的 WebSocket
# 连接状态。网站侧无法自行判断它（两个独立容器），因此由这里上报。
#
# 由 asyncio 事件循环写入、由健康检查线程读取。CPython 的 GIL 保证
# 布尔赋值的原子性，且这里只用于状态展示，无需加锁。
_connected = False

# 当前活跃的协议端连接，供 HTTP 线程发起主动调用（群内 @ 通知）。
#
# 为什么要这个：HTTP 端点跑在**独立线程**里，而 websockets 对象属于 asyncio 事件循环，
# 不能跨线程直接 await。这里保存引用，再用 run_coroutine_threadsafe 投递到事件循环。
_ws = None
_loop: asyncio.AbstractEventLoop | None = None


def _notify_group_mention(qq_number: str, name: str, kind: str) -> bool:
    """请机器人在群里 @ 某人（由 HTTP 线程调用）。

    返回是否已投递。协议端未连接时返回 False —— 调用方据此回 503，
    而不是假装成功（那会让网站在等一个永远不会来的 @ 消息）。
    """
    ws, loop = _ws, _loop
    if ws is None or loop is None:
        return False

    key = "bot.group.confirmResetPrompt" if kind == "reset" else "bot.group.confirmPrompt"
    text = messages.message(key, name=_mention(qq_number, name))
    fut = asyncio.run_coroutine_threadsafe(
        _call_api(ws, "send_group_msg", {"group_id": int(group_id()), "message": text}),
        loop,
    )
    fut.result(timeout=10)
    return True


def _mention(qq_number: str, name: str) -> str:
    """构造群内的 @ 段（OneBot 11 的 CQ 码）。"""
    return f"[CQ:at,qq={qq_number}] {name}"


class _HealthHandler(BaseHTTPRequestHandler):
    """健康检查、状态上报，以及网站侧发来的「请在群里 @ 某人」请求。"""

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        """网站 → 机器人：请在群里 @ 某人完成确认。"""
        if self.path != "/notify/confirm":
            self.send_response(404)
            self.end_headers()
            return

        token = os.environ.get("SHARED_RULES_TOKEN", "")
        if token and self.headers.get("authorization", "") != f"Bearer {token}":
            self._json(401, {"ok": False, "error": "unauthorized"})
            return

        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > 8192:
            self._json(400, {"ok": False, "error": "bad length"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"ok": False, "error": "bad json"})
            return

        qq_number = str(payload.get("qq", "")).strip()
        name = str(payload.get("name", "")).strip()
        kind = str(payload.get("kind", "register")).strip()
        if not qq_number or not name or not group_id():
            self._json(400, {"ok": False, "error": "missing qq/name/group config"})
            return

        try:
            sent = _notify_group_mention(qq_number, name, kind)
        except Exception as exc:  # noqa: BLE001
            log.exception("发送群内 @ 通知失败")
            self._json(500, {"ok": False, "error": str(exc)})
            return

        if not sent:
            self._json(503, {"ok": False, "error": "协议端未连接"})
            return

        self._json(200, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            # 未连接时返回 503：让 Docker 把容器标记为 unhealthy。
            # 之前这里**永远返回 200**，即使 NapCat 早已断开 —— 那个健康检查是假的，
            # 曾导致机器人停摆近 4 小时而无人察觉。
            connected = _connected
            body = b"ok" if connected else b"protocol-down"
            self.send_response(200 if connected else 503)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/status":
            payload = json.dumps({"connected": _connected}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, *args: object) -> None:
        """静默健康检查日志。"""


def _serve_health() -> None:
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), _HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log.info("健康检查已监听 :%s", HEALTH_PORT)


def _authorized(ws) -> bool:
    """校验 NapCat 带来的访问令牌（若配置了）。"""
    if not ACCESS_TOKEN:
        return True
    header = ws.request.headers.get("authorization", "")
    return header == f"Bearer {ACCESS_TOKEN}"


async def _call_api(ws, action: str, params: dict) -> None:
    """调用 OneBot API。"""
    payload = {"action": action, "params": params, "echo": action}
    await ws.send(json.dumps(payload))


async def _handle_connection(ws) -> None:
    global _connected, _ws, _loop

    if not _authorized(ws):
        log.warning("拒绝未授权的连接")
        await ws.close()
        return

    _connected = True
    # 供 HTTP 线程发起主动调用（群内 @ 通知）
    _ws = ws
    _loop = asyncio.get_running_loop()
    log.info("协议端已连接")

    async def send(user_id: str, text: str) -> None:
        await _call_api(
            ws,
            "send_private_msg",
            {"user_id": int(user_id), "message": text},
        )

    async def send_group(text: str) -> None:
        await _call_api(
            ws,
            "send_group_msg",
            {"group_id": int(group_id()), "message": text},
        )

    try:
        async for raw in ws:
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            # 忽略 API 调用的回执
            if event.get("echo") is not None:
                continue

            if event.get("post_type") != "message":
                continue

            message_type = event.get("message_type")
            user_id = str(event.get("user_id", ""))
            text = str(event.get("raw_message", ""))
            if not user_id:
                continue

            if message_type == "group":
                # 群聊：只用于「确认注册 / 确认重置」（D-45）。
                # ⚠️ 传的是**发言者的 QQ 号**——这是整个确认机制的安全依据，
                #    绝不使用消息文本里写的号码。
                group = str(event.get("group_id", ""))
                log.info("收到群消息 来自 %s（群 %s）", user_id, group)
                try:
                    await handle_group_message(
                        group=group,
                        sender=user_id,
                        text=text,
                        send_group=send_group,
                        send_private=send,
                    )
                except Exception:
                    log.exception("处理群消息出错")
                continue

            # 私聊：**已停用**（D-45）。
            #
            # 原注册流程要求成员私聊机器人领取邀请码，而「非好友私聊」正是腾讯风控的
            # 高危模式。改为群内确认后，私聊不再承担任何流程，因此这里**完全不回复**——
            # 回了反而又把机器人拉回「陌生人私聊」的行为特征里。
            log.info("忽略私聊（已停用，D-45）来自 %s", user_id)
    except websockets.ConnectionClosed:
        log.warning("协议端连接断开")
    finally:
        # 任何退出路径（正常断开、异常、被取消）都要把状态置回未连接，
        # 否则状态会一直停在「已连接」，健康检查又变成假的。
        _connected = False
        _ws = None
        _loop = None


async def _serve() -> None:
    log.info("等待协议端连接：ws://0.0.0.0:%s", WS_PORT)
    async with websockets.serve(_handle_connection, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # 永久运行


def main() -> None:
    _serve_health()
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
