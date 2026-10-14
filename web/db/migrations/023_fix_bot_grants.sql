-- 023: 补齐机器人数据库账号缺失的权限。
--
-- 022 建的授权**不够用**，实测暴露两个问题：
--
-- 1. ⚠️ `SELECT ... FOR UPDATE` 需要 **UPDATE 权限**，不只是 SELECT。
--    PostgreSQL 会为 FOR UPDATE 加行锁，因此要求该表的 UPDATE/DELETE/TRUNCATE 之一。
--    只授 SELECT,INSERT,DELETE 时，022 的「确认注册」会在加锁那一步直接报
--    `permission denied for table pending_registrations`。
--    教训：**授权要按「会执行的操作」推，而不是按「会读写的表」推** ——
--    行锁这类隐式要求很容易漏。
--
-- 2. 建积分记录时要读 `seasons`（找当前赛季），但 bot 从未被授过该表权限。
--    这条错误在 022 时没暴露，因为确认注册在那之前就失败了。
--
-- 另：重置密码后要使旧会话失效，需要 DELETE `login_sessions`（同理此前缺失）。

-- FOR UPDATE 加锁需要
GRANT UPDATE ON pending_registrations TO nefu_bot;
GRANT UPDATE ON pending_password_resets TO nefu_bot;

-- 建积分时读当前赛季
GRANT SELECT ON seasons TO nefu_bot;

-- 重置后使所有登录会话失效（密码是唯一凭据，改了就必须踢掉旧会话）
GRANT DELETE ON login_sessions TO nefu_bot;
