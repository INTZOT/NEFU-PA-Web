-- 022: 注册/重置密码改为「群内 @ 确认」（D-45）。
--
-- 背景：机器人**非好友私聊**是腾讯风控的高危模式（陌生人私聊骚扰的典型特征）。
-- 原流程要让成员先私聊机器人拿邀请码，因此每次注册都会产生一次陌生私聊。
--
-- 新流程把确认搬到**群聊**，而且**全程不在群里传任何凭据**：
--   注册：网站填表 → 机器人群里 @ 本人 → 本人回复「确认注册」→ 完成
--   重置：网站发起 → 机器人群里 @ 本人 → 本人回复「确认重置」→ 一次性链接改密
--
-- 安全性由「**双向匹配**」保证：机器人在群里 @ 的是目标本人，
-- 而 bot 只认**发言者的 QQ 号**（消息里的号码一律不信）。
-- 攻击者无法用别人的号发言，因此无法代他人确认。

-- ---------------------------------------------------------------------------
-- 注册待确认
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 与 users.qq_number 同样唯一：一个 QQ 号同时只能有一笔待确认，防止刷屏
  qq_number     text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  student_id    text        NOT NULL,
  -- ⚠️ 这是「必要的恶」：确认发生在**另一个请求**里，密码必须活到那时。
  --    缓解：① 10 分钟 TTL ② 确认后随记录一起删除 ③ 与正式密码同一套 scrypt。
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- 重置密码待确认
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 一次性改密令牌。**只在机器人的 @ 消息里出现**，用掉即删。
  -- 即便群里有人看到，也已被 TTL + 一次性 + 会话校验三重限制。
  token       text        NOT NULL UNIQUE,
  -- 发起重置时该用户的登录会话（可为空 —— 他是忘了密码来重置的，多半没登录）。
  -- 用途：改密完成后使该会话失效，避免旧凭据残留。
  session_id  uuid        REFERENCES login_sessions(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS pending_resets_user_idx
  ON pending_password_resets (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 机器人账号授权（沿用现有最小授权方式）
-- ---------------------------------------------------------------------------
-- 注册确认要在事务里建 users + season_ratings，因此这两张表需要 INSERT。
GRANT SELECT, INSERT, DELETE ON pending_registrations TO nefu_bot;
GRANT SELECT, INSERT, DELETE ON pending_password_resets TO nefu_bot;
GRANT INSERT ON season_ratings TO nefu_bot;

-- 惰性清理：过期的待确认没有保留价值（与 rooms/seasons 同一模式）
DELETE FROM pending_registrations WHERE expires_at < now();
DELETE FROM pending_password_resets WHERE expires_at < now();
