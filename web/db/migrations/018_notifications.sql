-- 站内消息通知。
--
-- 背景：约球被申请、活动报名被审核、被设为管理员等事件，当事人原本无从知晓，
-- 只能靠自己反复刷新页面碰运气。
--
-- 设计取舍（D-43）：
--   * **只做站内**，不经 QQ 推送。机器人侧主动发消息是账号风控的高危行为，
--     且此前已拒绝过主动推送（见 D-14）。
--   * 文案在**写入时定稿**（存 title/body 而非 payload）：
--     通知是事件的快照，「当时通知了什么」就该保持不变，
--     也避免历史通知因后续改名/改文案而变样。这与审计日志同思路。

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,   -- 事件类型，如 room.applied
  title      text        NOT NULL,   -- 已渲染的标题
  body       text,                   -- 已渲染的正文，可为空
  link       text,                   -- 站内跳转路径，如 /rooms/<id>
  dedupe_key text,                   -- 去重键：同一键在窗口内只留一条
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 列表按「某人 + 时间倒序」查，这是最主要的访问模式
CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC);

-- 未读计数单独走部分索引：红点在每次页面渲染时都会查，值得让它更小更快
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id) WHERE read_at IS NULL;

-- 去重查询：按 user + dedupe_key + 时间
CREATE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON notifications (user_id, dedupe_key, created_at DESC)
  WHERE dedupe_key IS NOT NULL;
