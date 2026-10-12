/**
 * 密码加密 —— 全项目唯一实现。
 *
 * 依据 docs/p3-blueprint.md 第三节「共享规则」：
 *   密码加密只在网站侧实现，机器人通过 /api/internal/shared-rules 调用它，
 *   避免两份实现漂移导致「机器人写入的密码，网站验不过」。
 *
 * 存储格式：scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 *   - 参数写入结果，将来调整强度不会让旧密码失效
 *   - 使用 Node 内置 crypto，无第三方依赖
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** scrypt 的 Promise 封装（Node 自带的重载签名不匹配，故手写）。 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 32;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error("密码不能为空");

  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEYLEN, PARAMS);

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  const derived = await scryptAsync(plain, salt, expected.length, { N, r, p });
  if (derived.length !== expected.length) return false;

  // 恒定时间比较，避免时序侧信道
  return timingSafeEqual(derived, expected);
}
