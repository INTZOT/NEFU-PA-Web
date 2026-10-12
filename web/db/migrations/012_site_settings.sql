-- 站点可配置文本（首页 hero 等）
--
-- 为什么用「键值表」而不是「一张表一个字段」：
--   这类「一小段可编辑文本」会陆续出现（首页标题、副标题、将来可能还有页脚说明…）。
--   每加一条就建一张表、写一个迁移、做一个页面，成本过高。
--   键值表让新增一项配置只需要：加一个键 + 在管理页加一个输入框。
--
-- 与 club_pages 的关系：
--   club_pages 是社团介绍的四块长文本（有固定结构，故用固定行 + slug）；
--   本表是零散的短配置。两者结构不同，故不强行合并。

CREATE TABLE IF NOT EXISTS site_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  label      text NOT NULL,          -- 管理界面上的字段名，由代码维护
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- 预置首页 hero 的两段文本（值取当前硬编码内容，保证升级后页面不变）
INSERT INTO site_settings (key, value, label) VALUES
  ('home.hero.title', '东北林业大学匹克球协会', '首页大标题'),
  ('home.hero.subtitle', '欢迎加入匹克球协会。这里发布社团公告与活动信息；成员登录后可使用约球大厅、活动报名与积分排行。', '首页副标题')
ON CONFLICT (key) DO NOTHING;
