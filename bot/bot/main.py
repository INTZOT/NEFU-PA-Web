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

from .handlers import handle_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("bot")

HEALTH_PORT = int(os.environ.get("BOT_HEALTH_PORT", "8000"))
WS_PORT = int(os.environ.get("BOT_WS_PORT", "3002"))
ACCESS_TOKEN = os.environ.get("ONEBOT_ACCESS_TOKEN", "")


class _HealthHandler(BaseHTTPRequestHandler):
    """仅用于容器健康检查，不承载业务。"""

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            body = b"ok"
            self.send_response(200)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
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
    if not _authorized(ws):
        log.warning("拒绝未授权的连接")
        await ws.close()
        return

    log.info("协议端已连接")

    async def send(user_id: str, text: str) -> None:
        await _call_api(
            ws,
            "send_private_msg",
            {"user_id": int(user_id), "message": text},
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

            # 只处理私聊消息（D-12、D-15 都要求私聊）
            if event.get("post_type") != "message":
                continue
            if event.get("message_type") != "private":
                continue

            user_id = str(event.get("user_id", ""))
            text = str(event.get("raw_message", ""))
            if not user_id:
                continue

            log.info("收到私聊 来自 %s", user_id)
            try:
                await handle_message(send, user_id, text)
            except Exception:
                log.exception("处理消息出错")
    except websockets.ConnectionClosed:
        log.warning("协议端连接断开")


async def _serve() -> None:
    log.info("等待协议端连接：ws://0.0.0.0:%s", WS_PORT)
    async with websockets.serve(_handle_connection, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # 永久运行


def main() -> None:
    _serve_health()
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
