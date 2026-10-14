-- 028: 给 users.student_id 加唯一约束。
--
-- 为什么需要：
--   学号是登录标识之一（登录查询是 `WHERE student_id = $1 OR qq_number = $1 LIMIT 1`），
--   但**它一直没有唯一约束**，而 QQ 号有。结果：
--     * 两个账号可以共用同一个学号，登录时 LIMIT 1 命中哪一行不确定 ——
--       合法用户可能被「账号或密码不正确」挡住；
--     * /api/events/[id]/partner 也按 `qq_number OR student_id` 找人，
--       双打搭档可能绑到错误的人；
--     * 攻击者可用自己的 QQ 抢注别人的学号。
--   改绑学号的那条路径（credentials.ts）本来就**会**查重 ——
--   同一个不变量，修改路径查了、创建路径没查，这是遗漏而非有意设计。
--
-- 加约束前已核对生产数据：16 个账号，无重复、无空值、格式均合法。

CREATE UNIQUE INDEX IF NOT EXISTS users_student_id_key ON users (student_id);
