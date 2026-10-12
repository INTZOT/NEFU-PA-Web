-- 操作记录增加积分相关动作
--
-- D-30 定了「允许撤销最近一场」，撤销必须留痕。

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_chk;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_chk CHECK (action IN (
  'role.grant',
  'role.revoke',
  'announcement.create',
  'announcement.update',
  'announcement.delete',
  'club.update',
  'event.create',
  'event.update',
  'event.checkin',
  'rating.settle',
  'rating.revoke'
));
