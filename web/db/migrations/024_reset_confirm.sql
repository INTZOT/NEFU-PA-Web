-- 024: 重置密码改为「同浏览器完成」（D-45 方案 B）。
--
-- 为什么放弃「私聊发一次性链接」：
--   发链接的方案有个真实缺陷 —— **「谁发起」与「谁确认」可能是两个人**。
--   攻击者可以发起重置，再诱导被 @ 的人「看到提醒就顺手回复确认」，
--   于是改密凭据落到攻击者能诱导到的位置。
--
-- 方案 B 把「发起者」也绑进去：
--   ① 用户浏览器发起重置时，服务器给他一个 httpOnly cookie（发起凭据）
--   ② 群里 @ 本人确认 —— 证明 **QQ 号所有权**
--   ③ 改密必须同时满足两者：群里确认过 **且** 带着发起时的 cookie
--
-- 攻击者即便诱导受害者确认成功，也拿不到受害者浏览器里的 cookie，因此改不了密码。
-- 顺带的好处：**彻底不需要私聊** —— 机器人不必主动联系任何人。

-- 群内确认的时刻。改密要求它非空。
ALTER TABLE pending_password_resets
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 发起凭据的哈希。存哈希而不是明文：
-- 万一数据库泄露，攻击者也无法据此伪造「发起者」。
ALTER TABLE pending_password_resets
  ADD COLUMN IF NOT EXISTS initiator_hash text;

-- 旧的 token 列不再使用（改密不再靠链接里的令牌）。
ALTER TABLE pending_password_resets
  ALTER COLUMN token DROP NOT NULL;

-- 机器人需要能 UPDATE（标记 confirmed_at）—— 022 已授，这里确保一次
GRANT UPDATE ON pending_password_resets TO nefu_bot;
