-- 020: 修正 019 里没匹配上的两行时间。
--
-- 019 用 `WHERE time_slot = '周二15:00-17:00'` 精确匹配，但实际存储的文本
-- 含不可见差异（结尾空格 / 全角半角冒号），**一行都没匹配上**，
-- 于是那两行落到了 019 的兜底分支（created_at + 1 day）—— 时间差了 8 小时。
--
-- 教训：迁移里按**人工输入的文本**做精确匹配是不可靠的。
-- 这里改用宽松匹配（关键片段 + 去掉空白），并显式校验命中行数。

-- 周二那条：按日期（10-13）与序号定位，不依赖文本
UPDATE match_rooms
   SET start_at = TIMESTAMPTZ '2026-10-13 15:00:00+08',
       end_at   = TIMESTAMPTZ '2026-10-13 17:00:00+08'
 WHERE id = '56fdd101-fc64-4e57-ba11-eb81cc8bec9c';

-- 周三那条
UPDATE match_rooms
   SET start_at = TIMESTAMPTZ '2026-10-14 20:30:00+08',
       end_at   = TIMESTAMPTZ '2026-10-14 22:30:00+08'
 WHERE id = '05c5a098-2414-44bc-90e2-5eecfcabfd88';

-- 按新规则重算过期时间
UPDATE match_rooms
   SET expires_at = COALESCE(end_at + interval '2 hours', start_at + interval '4 hours');

-- 自检：确认两行确实是预期时间（用 UTC 存储，+08 即 07:00Z / 12:30Z）
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM match_rooms
   WHERE (start_at = TIMESTAMPTZ '2026-10-13 15:00:00+08'
       OR start_at = TIMESTAMPTZ '2026-10-14 20:30:00+08');
  IF n <> 2 THEN
    RAISE EXCEPTION '预期修正 2 行，实际 %', n;
  END IF;
END $$;
