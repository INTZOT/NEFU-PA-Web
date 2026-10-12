-- 操作记录增加账号凭据相关动作
--
-- R-27/D-11 的自助换绑、R-42/D-16 的管理员人工兜底，都属于对账号凭据的改动，
-- 必须留痕（D-27）—— 尤其管理员代改他人凭据是高权限操作。

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
  'season.update',
  'credential.self',
  'credential.admin',
  'password.admin'
));
