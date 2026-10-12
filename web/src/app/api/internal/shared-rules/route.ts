/**
 * 共享规则接口 —— 仅供机器人服务调用。
 *
 * 为什么需要它（docs/p3-blueprint.md 第三节）：
 *   密码加密与邀请码生成必须只有一份实现。网站用 TypeScript、
 *   机器人用 Python，若各写一份必然漂移，出现「机器人生成的邀请码
 *   网站认不出」「机器人写入的密码用户登录不了」这类致命故障。
 *
 * 安全（D-19、R-51）：
 *   必须持 SHARED_RULES_TOKEN；不得对普通访问者开放。
 *   该 Token 一旦泄露，等同可以重置任意账号密码。
 */

import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { generateInviteCode, isValidInviteCode, normalizeInviteCode } from "@/lib/invite-code";
import { invalidateAllSessions } from "@/lib/session";
import { queryOne } from "@/lib/db";

function authorized(request: Request): boolean {
  const expected = process.env.SHARED_RULES_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  // 长度不同直接拒绝；长度相同再逐字符比较
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    op?: string;
    password?: string;
    code?: string;
    qqNumber?: string;
  } | null;
  if (!body?.op) return NextResponse.json({ error: "missing op" }, { status: 400 });

  switch (body.op) {
    case "hash-password": {
      if (!body.password) return NextResponse.json({ error: "missing password" }, { status: 400 });
      return NextResponse.json({ hash: await hashPassword(body.password) });
    }

    case "generate-invite-code": {
      return NextResponse.json({ code: generateInviteCode() });
    }

    case "normalize-invite-code": {
      if (!body.code) return NextResponse.json({ error: "missing code" }, { status: 400 });
      const code = normalizeInviteCode(body.code);
      return NextResponse.json({ code, valid: isValidInviteCode(code) });
    }

    /**
     * 失效某账号的全部登录会话。
     *
     * 用途：用户在 QQ 里重置密码后，机器人调用它踢掉旧的登录态。
     * 为什么放在网站侧而不是让机器人直接删表：
     *   与密码加密同理 —— 「改密码后该做什么」属于账号规则，
     *   规则只能有一份实现，否则机器人侧漏掉一步就留下安全缺口。
     * 用 QQ 号定位（机器人只知道 QQ 号，不知道内部 user_id）。
     */
    case "invalidate-sessions": {
      if (!body.qqNumber) return NextResponse.json({ error: "missing qqNumber" }, { status: 400 });
      const row = await queryOne<{ id: string }>(
        "SELECT id FROM users WHERE qq_number = $1 LIMIT 1",
        [body.qqNumber],
      );
      if (!row) return NextResponse.json({ error: "user not found" }, { status: 404 });
      const killed = await invalidateAllSessions(row.id);
      return NextResponse.json({ killed });
    }

    default:
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }
}
