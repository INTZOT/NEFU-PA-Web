/**
 * 赛季管理与自动归档。
 *
 * 依据 D-25：
 *   - 一赛季 = **一学年**，命名 `2026/2027` 格式
 *   - 两学期的起止日期由**管理员配置**；系统按配置**自动**开启新赛季
 *   - **结束当天归档**（乙式：旧赛季积分与对局记录**完整保留**）
 *   - 寒暑假为休赛期，不开展活动
 *   - 新赛季所有成员**重新起 500**
 *
 * 归档采用**惰性触发**（与约球房间过期同一策略）：没有定时任务，
 * 每次有人访问需要赛季信息的地方时检查一次。对单人维护的项目足够，
 * 且不需要引入额外的常驻组件。
 */

import { query, queryOne, withTransaction } from "@/lib/db";

export interface SeasonDetail {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  fallStart: string | null;
  fallEnd: string | null;
  springStart: string | null;
  springEnd: string | null;
  status: "active" | "archived";
  isEstimated: boolean;
}

interface Row {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  fall_start: string | null;
  fall_end: string | null;
  spring_start: string | null;
  spring_end: string | null;
  status: "active" | "archived";
  is_estimated: boolean;
}

function toSeason(r: Row): SeasonDetail {
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    fallStart: r.fall_start,
    fallEnd: r.fall_end,
    springStart: r.spring_start,
    springEnd: r.spring_end,
    status: r.status,
    isEstimated: r.is_estimated,
  };
}

const COLUMNS = `
  id, name, start_date, end_date, fall_start, fall_end,
  spring_start, spring_end, status, is_estimated
`;

export async function listAll(): Promise<SeasonDetail[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM seasons ORDER BY start_date DESC`,
  );
  return rows.map(toSeason);
}

export async function getActive(): Promise<SeasonDetail | null> {
  const row = await queryOne<Row>(
    `SELECT ${COLUMNS} FROM seasons WHERE status = 'active' LIMIT 1`,
  );
  return row ? toSeason(row) : null;
}

export async function getById(id: string): Promise<SeasonDetail | null> {
  const row = await queryOne<Row>(`SELECT ${COLUMNS} FROM seasons WHERE id = $1`, [id]);
  return row ? toSeason(row) : null;
}

/**
 * 惰性归档：已过结束日期的赛季自动转为 archived。
 *
 * **不删除任何数据** —— 乙式归档（D-25）：旧赛季的积分与对局记录完整保留，
 * 只是状态变为归档、不再出现在「当前赛季」的位置。
 *
 * 返回本次归档的赛季名（无则空数组）。
 */
export async function archiveDue(): Promise<string[]> {
  return withTransaction(async (client) => {
    const res = await client.query<{ name: string }>(
      `UPDATE seasons SET status = 'archived'
        WHERE status = 'active' AND end_date < CURRENT_DATE
        RETURNING name`,
    );
    return res.rows.map((r) => r.name);
  });
}

export type SeasonInput = {
  name: string;
  startDate: string;
  endDate: string;
  fallStart: string | null;
  fallEnd: string | null;
  springStart: string | null;
  springEnd: string | null;
  isEstimated: boolean;
};

export type ParseResult = { ok: true; value: SeasonInput } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSeasonInput(form: {
  name: string;
  startDate: string;
  endDate: string;
  fallStart: string;
  fallEnd: string;
  springStart: string;
  springEnd: string;
}): ParseResult {
  const name = form.name.trim();
  if (!/^\d{4}\/\d{4}$/.test(name)) {
    return { ok: false, error: "赛季名格式应为 2026/2027" };
  }

  const startDate = form.startDate.trim();
  const endDate = form.endDate.trim();
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { ok: false, error: "学年起止日期格式不正确" };
  }
  if (endDate <= startDate) {
    return { ok: false, error: "结束日期必须晚于开始日期" };
  }

  const optional = (v: string, label: string): string | null | { error: string } => {
    const t = v.trim();
    if (!t) return null;
    if (!DATE_RE.test(t)) return { error: `${label}格式不正确` };
    return t;
  };

  const fallStart = optional(form.fallStart, "秋季学期开始");
  if (fallStart && typeof fallStart === "object") return { ok: false, error: fallStart.error };
  const fallEnd = optional(form.fallEnd, "秋季学期结束");
  if (fallEnd && typeof fallEnd === "object") return { ok: false, error: fallEnd.error };
  const springStart = optional(form.springStart, "春季学期开始");
  if (springStart && typeof springStart === "object") return { ok: false, error: springStart.error };
  const springEnd = optional(form.springEnd, "春季学期结束");
  if (springEnd && typeof springEnd === "object") return { ok: false, error: springEnd.error };

  return {
    ok: true,
    value: {
      name,
      startDate,
      endDate,
      fallStart: fallStart as string | null,
      fallEnd: fallEnd as string | null,
      springStart: springStart as string | null,
      springEnd: springEnd as string | null,
      // 管理员手工填写即视为准确值（seed 推断出来的才会标记 is_estimated）
      isEstimated: false,
    },
  };
}

/** 新建赛季。同一时间只应有一个 active 赛季，因此新赛季建立时把旧的归档。 */
export async function createSeason(input: SeasonInput): Promise<string> {
  return withTransaction(async (client) => {
    await client.query(
      "UPDATE seasons SET status = 'archived' WHERE status = 'active'",
    );
    const res = await client.query<{ id: string }>(
      `INSERT INTO seasons
         (name, start_date, end_date, fall_start, fall_end, spring_start, spring_end, is_estimated, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id`,
      [
        input.name,
        input.startDate,
        input.endDate,
        input.fallStart,
        input.fallEnd,
        input.springStart,
        input.springEnd,
        input.isEstimated,
      ],
    );
    return res.rows[0].id;
  });
}

/**
 * 修正当前赛季的起止日期（seed 生成的是推断值，管理员需校正）。
 *
 * 只允许改日期，不允许改名字 —— 名字是赛季的身份，改名会让历史对不上。
 */
export async function updateDates(
  id: string,
  input: Omit<SeasonInput, "name">,
): Promise<void> {
  await query(
    `UPDATE seasons
        SET start_date = $2, end_date = $3,
            fall_start = $4, fall_end = $5,
            spring_start = $6, spring_end = $7,
            is_estimated = false
      WHERE id = $1`,
    [
      id,
      input.startDate,
      input.endDate,
      input.fallStart,
      input.fallEnd,
      input.springStart,
      input.springEnd,
    ],
  );
}
