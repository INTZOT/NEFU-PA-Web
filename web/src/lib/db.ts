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

/**
 * 所有 uuid 类型的列名（与 db/schema.sql 一致）。
 *
 * 维护提示：新增 uuid 列时同步此列表，否则针对新列的非法 id 仍会返回 500。
 */
const UUID_COLUMNS = [
  "id", "user_id", "event_id", "season_id", "room_id", "applicant_id",
  "initiator_id", "created_by", "recorded_by", "initiated_by",
  "user_a_id", "user_b_id", "match_result_id",
] as const;

const COL_PATTERN = UUID_COLUMNS.join("|");

/** 匹配「列名 = $N」或「$N::uuid」，捕获 uuid 参数的位置。 */
const UUID_PARAM_RE = new RegExp(
  // 前半：列名 = $N。列名前一个字符不能是单词字符或 $，
  //   否则 `user_a_id = $1` 里的 `a_id` 会被单独当成一个列名（正则的经典坑）。
  `(?<![\\w$])(?:${COL_PATTERN})\\s*=\\s*\\$(\\d+)` +
    // 后半：显式类型转换 $N::uuid
    `|\\$(\\d+)::uuid`,
  "gi",
);

/** 合法 UUID 的形状。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 用于「匹配不到任何行」的哨兵 UUID。
 *
 * 为什么不用 null：参数可能是**数组**（如 `ANY($1::uuid[])`）。
 * 把数组整体换成 null 会让 PostgreSQL 报「op ANY/ALL 需要右侧为数组」，
 * 反而制造新的 500。随机 UUID 则安全 —— 必然匹配不到任何行。
 * （全零值也不怕：主键由 gen_random_uuid() 生成，不会产生全零。）
 */
const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";

function sanitizeUuidValue(v: unknown): unknown {
  if (typeof v === "string") return UUID_RE.test(v) ? v : NO_MATCH_UUID;
  if (Array.isArray(v)) return v.map(sanitizeUuidValue);
  return v; // null 等原样保留
}

/**
 * 把**用于 uuid 列的非法参数**替换为哨兵值。
 *
 * 为什么需要这一步：
 *   路径参数是用户可控的（`/rooms/任意字符串`），最终会传给 PostgreSQL 的 uuid 列。
 *   字符串转 uuid 在**语法层面**就会失败，抛 `invalid input syntax for type uuid`，
 *   页面直接 500。实测有 8 个路由受影响 —— 表现都是「随便改一下 URL 就让服务器报错」。
 *
 * 为什么放在这一层：
 *   这是全项目**唯一的参数出口**。放在这里，任何调用方都自动受保护，
 *   不必在 26 个路由里各写一遍校验（写 26 遍必然有遗漏）。
 *
 * 为什么只处理「与 uuid 列做等值比较」的参数：
 *   不能把所有非 UUID 字符串都替换 —— 邀请码、时间段、姓名等**本来就是普通文本**。
 *   因此先从 SQL 文本解析出哪些 `$N` 落在 uuid 列的位置，只动这些。
 *
 * 已知边界：`INSERT ... VALUES ($1)` 里传给 uuid 列的参数识别不到。
 *   可接受 —— 那些位置的值都来自**已认证的用户 id**（服务端查出的合法 UUID），
 *   不是用户可控的原始输入。
 */
function sanitizeParams(text: string, params: unknown[]): unknown[] {
  if (params.length === 0) return params;

  const uuidSlots = new Set<number>();
  for (const m of text.matchAll(UUID_PARAM_RE)) {
    const n = m[1] ?? m[2];
    if (n) uuidSlots.add(Number(n));
  }
  if (uuidSlots.size === 0) return params;

  return params.map((v, i) => (uuidSlots.has(i + 1) ? sanitizeUuidValue(v) : v));
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, sanitizeParams(text, params));
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

  // 事务内的调用方直接用 client.query，绕过了上面的 sanitizeParams。
  // 这里包一层，让事务里的参数也享受同样的保护 —— 否则
  // 「申请加入房间」这类走事务的接口仍会因非法 id 返回 500。
  const wrapped = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return (text: string, params?: unknown[]) =>
          target.query(text, params ? sanitizeParams(text, params) : params);
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  try {
    await client.query("BEGIN");
    const result = await fn(wrapped as PoolClient);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
