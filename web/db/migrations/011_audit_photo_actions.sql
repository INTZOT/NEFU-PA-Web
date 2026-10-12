-- 操作记录增加照片相关动作（D-31）

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_chk;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_chk CHECK (action IN (
  'role.grant', 'role.revoke',
  'announcement.create', 'announcement.update', 'announcement.delete',
  'club.update',
  'event.create', 'event.update', 'event.checkin',
  'rating.settle', 'rating.revoke',
  'season.create', 'season.update',
  'credential.self', 'credential.admin', 'password.admin',
  'photo.upload', 'photo.update', 'photo.delete'
));
