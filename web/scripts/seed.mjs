// 初始化脚本：确保存在进行中的赛季，并按 SUPER_ADMIN_QQ 预先指定超级管理员（D-23）。
//
// 为什么不是「第一个注册的账号」：预先指定可避免抢注风险
// （链接先流出、他人抢先注册成为超管）。
//
// 用法（容器内执行）：
//   docker compose exec -T web node scripts/seed.mjs

import { Pool } from 'pg';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, 32, { N: 16384, r: 8, p: 1 });
  return ['scrypt', 16384, 8, 1, salt.toString('base64'), derived.toString('base64')].join('$');
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('缺少 DATABASE_URL');

  const pool = new Pool({ connectionString });

  try {
    // ---- 1. 确保存在进行中的赛季 ----
    const active = await pool.query("SELECT id, name FROM seasons WHERE status = 'active' LIMIT 1");
    let season = active.rows[0];

    if (!season) {
      const today = new Date();
      const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
      const name = startYear + '/' + (startYear + 1);

      const inserted = await pool.query(
        `INSERT INTO seasons (name, start_date, end_date, status, is_estimated)
         VALUES ($1, $2, $3, 'active', true)
         ON CONFLICT (name) DO UPDATE SET status = 'active'
         RETURNING id, name`,
        [name, startYear + '-09-01', (startYear + 1) + '-08-31'],
      );
      season = inserted.rows[0];
      console.log('[seed] 已创建赛季 ' + season.name + '（起止日期为推断值，请在后台校正）');
    } else {
      console.log('[seed] 已有进行中的赛季：' + season.name);
    }

    // ---- 2. 为已有用户补建本赛季积分记录 ----
    const backfill = await pool.query(
      `INSERT INTO season_ratings (user_id, season_id)
       SELECT u.id, $1 FROM users u
       ON CONFLICT (user_id, season_id) DO NOTHING`,
      [season.id],
    );
    console.log('[seed] 补建本赛季积分记录：' + backfill.rowCount + ' 条');

    // ---- 3. 超级管理员 ----
    const adminQq = (process.env.SUPER_ADMIN_QQ ?? '').trim();
    if (!adminQq) {
      console.log('[seed] 未设置 SUPER_ADMIN_QQ，跳过超管初始化');
      return;
    }

    const existing = await pool.query('SELECT id, name, role FROM users WHERE qq_number = $1', [adminQq]);

    if (existing.rowCount > 0) {
      const u = existing.rows[0];
      if (u.role === 'super_admin') {
        console.log('[seed] ' + u.name + ' 已是超级管理员');
      } else {
        await pool.query("UPDATE users SET role = 'super_admin' WHERE id = $1", [u.id]);
        console.log('[seed] 已将 ' + u.name + ' 提升为超级管理员');
      }
    } else {
      const randomPw = randomBytes(24).toString('base64url');
      const hash = await hashPassword(randomPw);
      await pool.query(
        `INSERT INTO users (name, student_id, qq_number, password_hash, role)
         VALUES ($1, $2, $3, $4, 'super_admin')`,
        ['超级管理员', '0000000000', adminQq, hash],
      );
      console.log('[seed] 已创建超级管理员占位账号（QQ ' + adminQq + '）');
      console.log('[seed] 其密码为随机值。请在 QQ 群私聊机器人发送「重置密码」设置密码后再登录。');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] 失败：', err);
  process.exit(1);
});
