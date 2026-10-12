-- 操作记录（审计日志）
--
-- 为什么需要（Q41 第 3 问，用户答复「需要」）：
--   超级管理员账号是**多人共用**的（D-16），因此登录身份无法区分具体是谁在操作。
--   用户明确接受这一点（Q41 第 1 问），但要求对管理动作留痕。
--   本表记录「谁（账号）在什么时候做了什么」，是账号共用前提下最低成本的追溯手段。
--
-- 设计取舍：
--   actor_name 是**快照**而非外键。账号可能被改名或删除，
--   若靠 JOIN 取名字，历史记录会随账号变动而失真。
--   外键用 ON DELETE SET NULL：账号删了，记录仍在，只是不知道是谁了。

CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name    text NOT NULL,          -- 操作者姓名快照
  action        text NOT NULL,          -- 动作标识，如 role.grant
  detail        text,                   -- 人类可读的说明
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_chk CHECK (action IN (
    'role.grant',           -- 设为管理员
    'role.revoke',          -- 取消管理员
    'announcement.create',
    'announcement.update',
    'announcement.delete'
  ))
);

-- 后台按时间倒序查看，这个索引就够了
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
