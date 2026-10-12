-- 社团照片（D-31）
--
-- 元数据存数据库、文件本体存命名卷 —— 这是 D-31 定的方案：
--   不入库二进制（会撑大数据库、拖慢备份）
--   不放 web/public（构建进镜像，下次部署会丢失）

CREATE TABLE IF NOT EXISTS photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 卷内的文件名（由服务端生成，不用用户提供的名字，避免路径穿越）
  filename     text        NOT NULL UNIQUE,
  -- 简短说明（D-31 第四条：界面上引导填写）
  caption      text,
  -- 精选：决定是否出现在首页（D-31 第三条）
  is_featured  boolean     NOT NULL DEFAULT false,
  width        integer,
  height       integer,
  bytes        integer,
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 相册按时间倒序；首页只取精选
CREATE INDEX IF NOT EXISTS photos_created_idx ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS photos_featured_idx ON photos(is_featured) WHERE is_featured;
