-- 026: 修掉「注册状态接口 = 任意账号接管」的严重漏洞。
--
-- 漏洞（已实测确认）：
--   GET /api/auth/register/status?qq=<任意已注册QQ>  一个请求、零凭据
--   → 服务端 createSession() 并下发 nefu_session cookie
--   → 请求者立即成为该用户（含 super_admin）。
--
-- 根因：`registrationStatus()` 把「用户存在」当成了「刚完成注册」。
--   它只需 SELECT users WHERE qq_number = $1 命中就返回 done，
--   而**所有老用户都命中**。于是「注册完自动进站」变成了通用后门。
--
-- 修法：自动进站必须能**证明**「你刚完成这次注册」，用一次性 handoff 令牌：
--   ① 网站发起注册时生成 handoff，明文进浏览器 httpOnly cookie，库里只存哈希；
--   ② 机器人确认建号时，把哈希**复制**到 users.handoff_hash，并盖上 10 分钟有效期；
--   ③ 轮询接口只在 cookie 与哈希匹配**且**未过期时才建会话，用后立即清除。
--
-- 这样「用户存在」不再是凭据 —— 必须持有发起时那个浏览器里的 cookie。

-- 待确认记录里带上 handoff 哈希（建号时复制给用户）
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS handoff_hash text;

-- 建号后的一次性进站凭据。用过即清空，过期即失效。
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS handoff_hash text,
  ADD COLUMN IF NOT EXISTS handoff_expires_at timestamptz;

-- bot 建号时要读 pending 的 handoff_hash（并写进 users）
GRANT UPDATE ON users TO nefu_bot;
