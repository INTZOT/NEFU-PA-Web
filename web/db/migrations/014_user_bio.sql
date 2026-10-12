-- 个人简介（成员可见，D-35）
--
-- 可见范围与姓名一致（R-53：成员之间可见真实姓名，学号不展示）：
--   简介是**成员之间**可见的信息，不对外公开。
--   目前展示位置为个人主页；字段本身对成员可读，供后续在
--   需要判断「这个搭档/队友是什么水平」的地方使用。

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;

-- 上限 100 字（应用层校验 + 此处兜底）
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bio_len_chk;
ALTER TABLE users ADD CONSTRAINT users_bio_len_chk
  CHECK (bio IS NULL OR char_length(bio) <= 100);
