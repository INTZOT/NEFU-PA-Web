/**
 * 邀请码生成 —— 全项目唯一实现（同 password.ts 的理由）。
 *
 * 特性（D-13）：
 *   - 与一个 QQ 号永久绑定，不设有效期
 *   - 重复申领返回同一个码
 *   - 属凭据级信息，不得出现在任何展示面或群聊中
 */

import { randomInt } from "node:crypto";

// 去掉容易混淆的字符（0/O、1/I/L），便于用户手抄与转述
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 12;

export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** 归一化用户输入：容忍大小写与空白差异。 */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidInviteCode(input: string): boolean {
  const code = normalizeInviteCode(input);
  if (code.length !== LENGTH) return false;
  return [...code].every((ch) => ALPHABET.includes(ch));
}
