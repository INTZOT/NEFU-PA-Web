-- 027: 收回 026 误授给机器人的 `UPDATE ON users`，并收紧其它多余权限。
--
-- 026 的注释写「bot 建号时要读 pending 的 handoff_hash（并写进 users）」，
-- 于是我顺手授了 UPDATE —— 但**这是多余的**：
--   bot 对 users 只做 INSERT（建号），读 pending 用的是
--   pending_registrations 的 SELECT（022 已授）。
--
-- 而表级 UPDATE 的实际能力是致命的：
--   UPDATE users SET role = 'super_admin' WHERE qq_number = '...';
--   UPDATE users SET password_hash = '...' WHERE role = 'super_admin';
-- 也就是「机器人被攻破」的后果会从「能建号」升级为「全站任意账号接管」。
--
-- 教训：GRANT 要按**该服务实际会执行的语句**授予，不是按「它大概跟这张表有关」。
-- 多授一个动词就是多一个后门。

REVOKE UPDATE ON users FROM nefu_bot;

-- bot 的 mark_reset_confirmed 只做一条 UPDATE...RETURNING，不需要 SELECT/INSERT/DELETE
REVOKE SELECT, INSERT, DELETE ON pending_password_resets FROM nefu_bot;

-- bot 不再负责踢会话（改密踢会话在 web 侧 applyReset 里做）
REVOKE DELETE ON login_sessions FROM nefu_bot;
