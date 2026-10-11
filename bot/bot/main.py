"""QQ 机器人服务（阶段 1 骨架）。

职责范围（D-14、D-19）：
  - 收到「注册」→ 查重 → 生成邀请码 → 回复
  - 收到「重置密码」→ 维护对话状态 → 写入新密码

注意：密码加密与邀请码生成**不在本服务实现**，而是调用网站的共享规则接口
      （见 docs/p3-blueprint.md 第三节「共享规则」）。
"""

from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

HEALTH_PORT = int(os.environ.get("BOT_HEALTH_PORT", "8000"))


class _HealthHandler(BaseHTTPRequestHandler):
    """仅用于容器健康检查，不承载任何业务。"""

    def do_GET(self) -> None:  # noqa: N802 (stdlib 命名约定)
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
        """静默健康检查日志，避免刷屏。"""


def _serve_health() -> None:
    """在后台线程提供健康检查端点。"""
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), _HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def main() -> None:
    _serve_health()

    database_url = os.environ.get("DATABASE_URL", "")
    onebot_ws_url = os.environ.get("ONEBOT_WS_URL", "")
    shared_rules_url = os.environ.get("SHARED_RULES_URL", "")

    print("[bot] 阶段 1 骨架已启动", flush=True)
    print(f"[bot] 健康检查端口: {HEALTH_PORT}", flush=True)
    print(f"[bot] 数据库已配置: {bool(database_url)}", flush=True)
    print(f"[bot] OneBot 地址: {onebot_ws_url or '(未设置)'}", flush=True)
    print(f"[bot] 共享规则接口: {shared_rules_url or '(未设置)'}", flush=True)
    print("[bot] 三条流程尚未实现，将在阶段 3 完成。", flush=True)

    # 阶段 1 仅保持进程存活，等待阶段 3 接入 OneBot 与数据库。
    threading.Event().wait()


if __name__ == "__main__":
    main()
