-- 021: 修复「过期状态与时间不一致」的房间。
--
-- 成因：019 迁移先按「创建时间 +1 天」给了兜底时间，随后 expireDue() 跑过一次，
-- 把当时已到期的房间标成了 expired。020 修正了 start_at/end_at，
-- 但 status 是**单向标记**（只从 open/full 变为 expired，不会自己变回来），
-- 于是出现「还没到期却显示已过期」的不一致。
--
-- 这里做一次性对账：把「过期时间仍在未来」的房间恢复为可招募状态。
-- 注意只处理 open/full/expired，不动 cancelled（那是终态）。

UPDATE match_rooms
   SET status = CASE
         -- 已通过人数 + 发起人 >= 上限 → 满员，否则开放
         WHEN (SELECT count(*) FROM room_applications a
                WHERE a.room_id = match_rooms.id AND a.status = 'approved') + 1
              >= match_rooms.capacity
         THEN 'full'
         ELSE 'open'
       END
 WHERE expires_at > now()
   AND status = 'expired';

-- 自检：不该再有「未到期却已过期」的房间
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM match_rooms
   WHERE expires_at > now() AND status = 'expired';
  IF n > 0 THEN
    RAISE EXCEPTION '仍有 % 个未到期却标记过期的房间', n;
  END IF;
END $$;
