-- 「是否参与排行」开关（D-39）
--
-- 语义：用户自愿**暂时**退出排行榜，可随时恢复。
--   - 不影响比赛积分：隐藏期间仍参赛、积分照常结算
--   - 因此对其他人**完全公平**（他们仍在与隐藏者对战）
--   - 只影响「是否出现在榜单上」
--
-- 为什么放在 season_ratings 而不是 users：
--   这是**按赛季**的选择 —— 新赛季开始时会重新计算，
--   用户上个赛季不想上榜、这个赛季想上榜是很自然的事。
--   放在 users 上会导致一次关闭就永久生效。

ALTER TABLE season_ratings
  ADD COLUMN IF NOT EXISTS leaderboard_hidden boolean NOT NULL DEFAULT false;

-- 榜单查询会以 (season_id, rating DESC) 之外再过滤该列，加上部分索引更省
CREATE INDEX IF NOT EXISTS season_ratings_visible_idx
  ON season_ratings(season_id, rating DESC) WHERE NOT leaderboard_hidden;
