/**
 * ELO 结算算法（纯函数，无数据库依赖）。
 *
 * 依据 D-09 的结算规则（第 24 轮定案，当时标注「待明确：无」）：
 *
 *     期望胜率  E = 1 / (1 + 10^((R对手 − R自己) / 400))
 *     积分变化  Δ = K × (实际结果 − E)      K = 40
 *               实际结果：胜 = 1，负 = 0
 *
 * 其他已定参数：
 *   - 零和：一方 +X，另一方必 −X
 *   - 双打：搭档积分**取平均**作为一个队伍分；两人**增减相同**
 *
 * 为什么单独成文件且不碰数据库：算法是最需要逐值校对的部分，
 * 抽成纯函数后可以直接用决策文档里的数值表验证。
 */

export const K_FACTOR = 40;

/** 期望胜率。R 与 opponentRating 都是「队伍分」（双打为搭档平均分）。 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

/**
 * 一方的积分变化。
 *
 * @param rating          本方队伍分
 * @param opponentRating  对方队伍分
 * @param won             本方是否获胜
 * @param k                K 值（默认 40）
 */
export function delta(
  rating: number,
  opponentRating: number,
  won: boolean,
  k: number = K_FACTOR,
): number {
  const e = expectedScore(rating, opponentRating);
  return k * ((won ? 1 : 0) - e);
}

/**
 * 双打队伍分 = 搭档积分平均。
 *
 * 取整规则：四舍五入到整数。这是**唯一**取整的地方，
 * 之后的 Δ 计算都在这个值上进行，保证同一队两人得到完全相同的 Δ。
 */
export function teamRating(ratings: number[]): number {
  if (ratings.length === 0) throw new Error("队伍不能为空");
  const sum = ratings.reduce((a, b) => a + b, 0);
  return Math.round(sum / ratings.length);
}

export interface Settlement {
  /** A 方每人应加/减的分（**整数**）。 */
  deltaA: number;
  /** B 方每人应加/减的分。与 deltaA 严格互为相反数，保证零和。 */
  deltaB: number;
  teamAvgA: number;
  teamAvgB: number;
}

/**
 * 结算一场对局。
 *
 * **零和的实现方式**：只计算 A 方的 Δ 并取整，B 方取相反数。
 * 若两边各自取整，浮点误差可能让两者相加不为 0（例如 +7.4999 与 −7.5001
 * 各自四舍五入成 +7 与 −8，总和 −1），那不是零和。
 *
 * @param ratingsA A 方各成员积分（单打 1 个，双打 2 个）
 * @param ratingsB B 方各成员积分
 * @param winner   'a' 或 'b'
 */
export function settleMatch(
  ratingsA: number[],
  ratingsB: number[],
  winner: "a" | "b",
  k: number = K_FACTOR,
): Settlement {
  const teamAvgA = teamRating(ratingsA);
  const teamAvgB = teamRating(ratingsB);

  const aWon = winner === "a";
  const rawDeltaA = delta(teamAvgA, teamAvgB, aWon, k);

  const deltaA = Math.round(rawDeltaA);
  return {
    deltaA,
    deltaB: -deltaA, // 严格零和
    teamAvgA,
    teamAvgB,
  };
}
