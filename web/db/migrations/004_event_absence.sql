-- 活动：未到场状态（D-28 / Q58 的答复）
--
-- 背景：原设计用 checked_in_at IS NULL 表示「没签到」，但无法区分两种情况：
--   1. 活动还没开始 / 还没结束  → 未签到是正常的
--   2. 活动已结束但该人没来    → 这才是「缺席」
-- 若只用时间戳，就只能在查询时靠比较时间推断，逻辑会散落在各处。
-- 因此显式引入 'absent' 状态：由管理员在活动结束后确认，或由归档流程标记。

ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_status;

ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_status CHECK (
  status IN ('registered', 'waitlisted', 'cancelled', 'absent')
);

-- 缺席查询用（候补优先级、活动统计都要按它筛）
CREATE INDEX IF NOT EXISTS event_registrations_absent_idx
  ON event_registrations(user_id) WHERE status = 'absent';
