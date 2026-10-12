-- 社团介绍（对外名片）
--
-- 依据 M1 / R-07：社团介绍是对外名片，含「概况、组织架构、章程、联系方式」。
-- 准入为游客（公开）。
--
-- 为什么放数据库而不是写死在页面里：
--   联系方式、组织架构这类内容会变（换届、换群号），
--   若写死在代码里，每次改一句话都要改代码 + 重新构建 + 重新部署。
--   管理员可编辑是这里的关键性质（R-07 的责任方标注为「管理员」）。
--
-- 为什么是固定几行而不是随意增删的列表：
--   这四块内容是 R-07 规定的固定结构，不需要增删，只需要编辑。
--   因此用 slug 作为稳定标识，保存时按 slug upsert。

CREATE TABLE IF NOT EXISTS club_pages (
  slug       text PRIMARY KEY,          -- overview / organization / charter / contact
  title      text NOT NULL,
  content    text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT club_pages_slug_chk CHECK (slug IN (
    'overview', 'organization', 'charter', 'contact'
  ))
);

-- 预置四块空白内容，管理员在后台填写
INSERT INTO club_pages (slug, title, content) VALUES
  ('overview',     '社团概况', ''),
  ('organization', '组织架构', ''),
  ('charter',      '社团章程', ''),
  ('contact',      '联系方式', '')
ON CONFLICT (slug) DO NOTHING;
