#!/usr/bin/env node
/**
 * 最小迁移执行器。
 *
 * 为什么需要它：
 *   PostgreSQL 官方镜像只在**数据卷为空时**执行 /docker-entrypoint-initdb.d/ 下的脚本。
 *   项目一旦有了真实数据，schema.sql 的改动就再也不会自动生效 ——
 *   必须有一个「在已有数据的库上追加变更」的机制。
 *
 * 设计取舍：
 *   - 不引入迁移框架：本项目是单人维护，变更频率低，几十行足够。
 *   - 每个文件在**独立事务**中执行，失败即回滚，不会留下半成品。
 *   - 已执行的文件记入 schema_migrations，重复运行安全。
 *
 * 用法（在部署机上）：
 *   docker compose exec -T web node scripts/migrate.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

// 迁移文件随镜像一同部署到 /app/db/migrations（见 web/Dockerfile）
const migrationsDir = join(process.cwd(), "db", "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] 缺少 DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
  );

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] 已执行，跳过：${file}`);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf8");
    console.log(`[migrate] 执行：${file}`);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[migrate] 完成：${file}`);
      count += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[migrate] 失败并已回滚：${file}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  console.log(count === 0 ? "[migrate] 数据库已是最新" : `[migrate] 本次执行 ${count} 个迁移`);
}

main()
  .catch((error) => {
    console.error("[migrate] 出错：", error.message);
    process.exit(1);
  })
  .finally(() => client.end());