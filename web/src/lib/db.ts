/**
 * PostgreSQL 连接池。
 *
 * 说明：
 *   - 全项目数据都在这里（16 张表，见 db/schema.sql）
 *   - 机器人服务直连同一个库，因此这里不做 ORM 封装，
 *     保持 SQL 直白可读，便于两边对照（D-19）
 *   - 连接池**惰性创建**：构建阶段没有数据库也应能编译通过
 */

import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // 开发模式热重载会重复求值模块，用全局变量避免连接池泄漏
  // eslint-disable-next-line no-var
  var __nefuPool: Pool | undefined;
}

export function getPool(): Pool {
  if (global.__nefuPool) return global.__nefuPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("缺少环境变量 DATABASE_URL");

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  global.__nefuPool = pool;
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * 在一个事务里执行一段逻辑。
 *
 * 为什么需要它：活动报名的「计数 → 插入」必须原子完成，
 * 否则两人同时报名时会都读到「还剩 1 个名额」，导致超额。
 * 事务内的调用方应自行对关键行加锁（SELECT ... FOR UPDATE）。
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
