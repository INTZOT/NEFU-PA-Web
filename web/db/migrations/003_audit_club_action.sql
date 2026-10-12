-- 操作记录增加「修改社团介绍」动作
--
-- 为什么单独一个迁移而不是改 001：
--   001 已经在生产库执行过了，修改它不会重新执行。
--   迁移文件一旦执行就视为不可变，变更必须追加新文件。

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_chk;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_chk CHECK (action IN (
  'role.grant',
  'role.revoke',
  'announcement.create',
  'announcement.update',
  'announcement.delete',
  'club.update'
));
