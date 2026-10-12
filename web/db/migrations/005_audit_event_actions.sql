-- 操作记录增加活动相关动作
--
-- 起因：发布活动时错用了 announcement.create 来记录，语义不符。
-- 迁移文件一旦执行即不可变，因此追加新文件而不是改 003。

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
  'event.checkin'
));
