-- room_applications 增加 expired 状态
--
-- 起因：D-29 第三条定了「无人处理的申请随房间 24 小时一起过期」，
-- 实现时用了 status='expired'，但原始 schema 的 CHECK 约束只有
-- ('pending','approved','rejected','withdrawn') —— 写入直接违反约束，页面 500。
--
-- 教训：新增状态值时必须同时改 CHECK 约束。这类问题在编译期无法发现，
-- 只能靠「真的走一遍这条分支」才能暴露。

ALTER TABLE room_applications DROP CONSTRAINT IF EXISTS room_applications_status;

ALTER TABLE room_applications ADD CONSTRAINT room_applications_status CHECK (
  status IN ('pending', 'approved', 'rejected', 'withdrawn', 'expired')
);
