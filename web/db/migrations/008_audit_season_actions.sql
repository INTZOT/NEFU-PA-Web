-- 操作记录增加赛季相关动作
--
-- D-25 的赛季配置由超管修改，属于管理动作，需留痕（D-27）。

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
  'rating.revoke',
  'season.create',
  'season.update'
));
