-- 019: 约球的时间从「文本」改为「真实时间戳」，过期规则随之改为「活动结束后」。
--
-- 为什么改（D-44）：
--   原规则是 `expires_at = now() + 24 hours` —— **从发布时刻起算**。
--   后果：想组织「下周六打球」就得等到周五才能发，否则明天帖子就消失了。
--   成员办活动通常要提前几天通知，这条规则只适合「今天找搭子」。
--
--   改后：过期时间 = 活动结束后 2 小时（无结束时间则按开始后 4 小时）。
--   好处不止「能提前发」——时间已过的房间也会**自动下架**，
--   而原来它要等满 24 小时才消失。
--
-- 时间文本无法可靠解析成日期（「周六 14:00-16:00」是哪个周六？），
-- 因此本次迁移的存量数据由人工确认日期后写入，不做自动猜测。

-- ---------------------------------------------------------------------------
-- 1. 清理已取消的房间（连同其申请一起级联删除）
-- ---------------------------------------------------------------------------
-- 这些是演示/测试产生的，且 cancelled 无保留价值。
DELETE FROM match_rooms WHERE status = 'cancelled';

-- ---------------------------------------------------------------------------
-- 2. 增加真实时间列
-- ---------------------------------------------------------------------------
ALTER TABLE match_rooms ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE match_rooms ADD COLUMN IF NOT EXISTS end_at   timestamptz;

-- ---------------------------------------------------------------------------
-- 3. 存量数据的时间（日期由用户确认）
-- ---------------------------------------------------------------------------
-- 2026-10-13 是周二、2026-10-14 是周三。
-- 注意：周二那条的活动时间（15:00-17:00）已经过去，下面的过期时间会把它
-- 直接判为过期 —— 这是正确行为，不是 bug。
UPDATE match_rooms
   SET start_at = TIMESTAMPTZ '2026-10-13 15:00:00+08',
       end_at   = TIMESTAMPTZ '2026-10-13 17:00:00+08'
 WHERE time_slot = '周二15:00-17:00';

UPDATE match_rooms
   SET start_at = TIMESTAMPTZ '2026-10-14 20:30:00+08',
       end_at   = TIMESTAMPTZ '2026-10-14 22:30:00+08'
 WHERE time_slot = '周三 20.30-22.30';

-- ---------------------------------------------------------------------------
-- 4. 兜底：万一还有没被上面覆盖的行，按「创建时间 + 1 天」给它一个时间
-- ---------------------------------------------------------------------------
-- 宁可给一个不准的时间让人去改，也不要让迁移因 NOT NULL 失败而卡住。
-- 部署后应查一次这些行并订正。
UPDATE match_rooms
   SET start_at = created_at + interval '1 day',
       end_at   = created_at + interval '1 day' + interval '2 hours'
 WHERE start_at IS NULL;

-- 全部有值后才能加约束
ALTER TABLE match_rooms ALTER COLUMN start_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. 按新规则重算过期时间
-- ---------------------------------------------------------------------------
-- 无结束时间时给 4 小时缓冲（够一场球打完），有结束时间则 +2 小时。
UPDATE match_rooms
   SET expires_at = COALESCE(end_at + interval '2 hours', start_at + interval '4 hours');

-- ---------------------------------------------------------------------------
-- 6. 补约束并去掉旧列
-- ---------------------------------------------------------------------------
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_time_chk;
ALTER TABLE match_rooms ADD CONSTRAINT match_rooms_time_chk
  CHECK (end_at IS NULL OR end_at > start_at);

ALTER TABLE match_rooms DROP COLUMN IF EXISTS time_slot;

-- 列表默认按开始时间排序，加个索引
CREATE INDEX IF NOT EXISTS match_rooms_start_idx ON match_rooms (start_at);

-- 迁移后自检：应当没有任何一行缺 start_at
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM match_rooms WHERE start_at IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '仍有 % 行缺少 start_at', n;
  END IF;
END $$;
