"""共享规则客户端。

为什么需要它（docs/p3-blueprint.md 第三节）：
    密码加密与邀请码生成必须只有一份实现。网站用 TypeScript、机器人用
    Python，若各写一份必然漂移，出现「机器人生成的邀请码网站认不出」
    「机器人写入的密码用户登录不了」这类致命故障。

    因此规则住在网站侧，本模块只负责调用它。
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


class SharedRulesError(RuntimeError):
    """共享规则接口调用失败。"""


def _post(payload: dict[str, object]) -> dict[str, object]:
    url = os.environ.get("SHARED_RULES_URL", "")
    token = os.environ.get("SHARED_RULES_TOKEN", "")
    if not url or not token:
        raise SharedRulesError("缺少 SHARED_RULES_URL 或 SHARED_RULES_TOKEN")

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        raise SharedRulesError(f"共享规则接口返回 {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SharedRulesError(f"无法连接共享规则接口: {exc.reason}") from exc


def generate_invite_code() -> str:
    """生成邀请码（唯一实现在网站侧）。"""
    result = _post({"op": "generate-invite-code"})
    code = result.get("code")
    if not isinstance(code, str) or not code:
        raise SharedRulesError("接口未返回邀请码")
    return code


def hash_password(plain: str) -> str:
    """加密密码（唯一实现在网站侧）。"""
    result = _post({"op": "hash-password", "password": plain})
    hashed = result.get("hash")
    if not isinstance(hashed, str) or not hashed:
        raise SharedRulesError("接口未返回密码散列")
    return hashed
