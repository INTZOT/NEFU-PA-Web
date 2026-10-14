-- ============================================================
-- NEFU 匹克球社团网站 · 数据库表结构
-- 对应 P2 数据模型的 16 张表（docs/p2-data-model.md）
-- 本文件由 docker-entrypoint-initdb.d 在首次建库时执行
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1. 用户 ----------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,                                  -- 真实姓名，成员间可见
  student_id    text        NOT NULL,                                  -- 学号：登录标识，仅格式校验
  qq_number     text        NOT NULL UNIQUE,                           -- 登录标识 + 绑定凭据 + 重置核验
  password_hash text        NOT NULL,
  self_rating   integer     NOT NULL DEFAULT 500,
  role          text        NOT NULL DEFAULT 'member',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_student_id_fmt CHECK (student_id ~ '^[0-9]{10}$'),
  CONSTRAINT users_self_rating_rng CHECK (self_rating BETWEEN 0 AND 1000),
  CONSTRAINT users_role_chk       CHECK (role IN ('member','admin','super_admin'))
);

-- ---------- 2. 邀请码 ----------
CREATE TABLE IF NOT EXISTS invite_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL UNIQUE,
  qq_number  text        NOT NULL UNIQUE,                              -- 一码一 QQ，永久有效
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 3. 登录会话 ----------
CREATE TABLE IF NOT EXISTS login_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS login_sessions_user_idx ON login_sessions(user_id);

-- ---------- 4. 重置会话 ----------
CREATE TABLE IF NOT EXISTS reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'awaiting_new_password',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reset_tokens_status_chk CHECK (status IN ('awaiting_new_password','done','expired'))
);
CREATE INDEX IF NOT EXISTS reset_tokens_user_idx ON reset_tokens(user_id, status);

-- ---------- 5. 赛季 ----------
CREATE TABLE IF NOT EXISTS seasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,                             -- 如 2026/2027
  fall_start  date,
  fall_end    date,
  spring_start date,
  spring_end  date,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  status      text        NOT NULL DEFAULT 'active',
  is_estimated boolean    NOT NULL DEFAULT false,                      -- 起止日期为沿用上学期的推断值
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seasons_status_chk       CHECK (status IN ('active','archived')),
  CONSTRAINT seasons_date_order       CHECK (end_date > start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active_idx ON seasons(status) WHERE status = 'active';

-- ---------- 6. 赛季积分（每 用户 × 赛季 一条）----------
CREATE TABLE IF NOT EXISTS season_ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  season_id  uuid        NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  rating     integer     NOT NULL DEFAULT 500,
  wins       integer     NOT NULL DEFAULT 0,
  losses     integer     NOT NULL DEFAULT 0,
  matches    integer     NOT NULL DEFAULT 0,
  CONSTRAINT season_ratings_uniq     UNIQUE (user_id, season_id),
  CONSTRAINT season_ratings_wins_chk CHECK (wins   >= 0),
  CONSTRAINT season_ratings_loss_chk CHECK (losses >= 0),
  CONSTRAINT season_ratings_matches  CHECK (matches = wins + losses)
);
CREATE INDEX IF NOT EXISTS season_ratings_board_idx ON season_ratings(season_id, rating DESC);

-- ---------- 7. 等级分配置（K 值版本化）----------
CREATE TABLE IF NOT EXISTS rating_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  k_factor       integer     NOT NULL DEFAULT 40,
  effective_from timestamptz NOT NULL DEFAULT now(),
  note           text,
  CONSTRAINT rating_configs_k_chk CHECK (k_factor > 0)
);

-- ---------- 8. 公告 ----------
CREATE TABLE IF NOT EXISTS announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  content      text        NOT NULL,
  is_pinned    boolean     NOT NULL DEFAULT false,
  category     text,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  created_by   uuid        REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS announcements_feed_idx ON announcements(is_pinned DESC, published_at DESC);

-- ---------- 9. 赛事 ----------
CREATE TABLE IF NOT EXISTS events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text        NOT NULL,
  description           text,
  start_at              timestamptz NOT NULL,
  end_at                timestamptz,
  location              text,
  format                text        NOT NULL,
  capacity              integer     NOT NULL,
  capacity_unit         text        NOT NULL,
  registration_deadline timestamptz,
  status                text        NOT NULL DEFAULT 'draft',
  created_by            uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_format_chk   CHECK (format IN ('singles','doubles')),
  CONSTRAINT events_unit_chk     CHECK (capacity_unit IN ('people','teams')),
  CONSTRAINT events_status_chk   CHECK (status IN ('draft','open','closed','finished')),
  CONSTRAINT events_capacity_chk CHECK (capacity > 0),
  -- 名额单位由赛制决定：单打按人、双打按队（R-101）
  CONSTRAINT events_unit_match  CHECK (
    (format = 'singles' AND capacity_unit = 'people') OR
    (format = 'doubles' AND capacity_unit = 'teams')
  )
);

-- ---------- 10. 活动报名 ----------
CREATE TABLE IF NOT EXISTS event_registrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'registered',
  registered_at  timestamptz NOT NULL DEFAULT now(),
  cancelled_at   timestamptz,
  promoted_at    timestamptz,
  checked_in_at  timestamptz,                                          -- 管理员现场确认签到（R-107）
  CONSTRAINT event_registrations_uniq   UNIQUE (event_id, user_id),
  CONSTRAINT event_registrations_status CHECK (status IN ('registered','waitlisted','cancelled'))
);
CREATE INDEX IF NOT EXISTS event_registrations_queue_idx ON event_registrations(event_id, status, registered_at);

-- ---------- 11. 搭档配对 ----------
CREATE TABLE IF NOT EXISTS pairings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_a_id    uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  user_b_id    uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  initiated_by uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  proposed_by  text        NOT NULL DEFAULT 'member',
  status       text        NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pairings_distinct CHECK (user_a_id <> user_b_id),
  CONSTRAINT pairings_proposer CHECK (proposed_by IN ('member','admin')),
  CONSTRAINT pairings_status   CHECK (status IN ('pending','confirmed','rejected','cancelled'))
);
-- 同一赛事内，同一对人只能有一条未取消的配对（忽略 A/B 顺序）
CREATE UNIQUE INDEX IF NOT EXISTS pairings_uniq_pair_idx
  ON pairings(event_id, LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id))
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS pairings_event_idx ON pairings(event_id, status);

-- ---------- 12. 比赛对局（仅官方比赛）----------
CREATE TABLE IF NOT EXISTS match_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  season_id      uuid        NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  format         text        NOT NULL,
  winner         text        NOT NULL,
  rating_applied boolean     NOT NULL DEFAULT false,
  k_factor_used  integer     NOT NULL,
  recorded_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_results_format CHECK (format IN ('singles','doubles')),
  CONSTRAINT match_results_winner CHECK (winner IN ('a','b'))
);
CREATE INDEX IF NOT EXISTS match_results_event_idx  ON match_results(event_id);
CREATE INDEX IF NOT EXISTS match_results_season_idx ON match_results(season_id);

-- ---------- 13. 对局参与者（长表，便于按人查询与统计）----------
CREATE TABLE IF NOT EXISTS match_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id uuid    NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  user_id         uuid    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  side            text    NOT NULL,
  CONSTRAINT match_participants_side  CHECK (side IN ('a','b')),
  CONSTRAINT match_participants_uniq  UNIQUE (match_result_id, user_id)
);
CREATE INDEX IF NOT EXISTS match_participants_user_idx ON match_participants(user_id);

-- ---------- 14. 积分流水 ----------
CREATE TABLE IF NOT EXISTS rating_ticks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  season_id          uuid        NOT NULL REFERENCES seasons(id)       ON DELETE RESTRICT,
  match_result_id    uuid        NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  delta              integer     NOT NULL,
  rating_after       integer     NOT NULL,
  team_avg_before    integer     NOT NULL,
  opponent_avg_before integer    NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rating_ticks_uniq UNIQUE (match_result_id, user_id)        -- 一场对局每人只结算一次
);
CREATE INDEX IF NOT EXISTS rating_ticks_user_idx ON rating_ticks(user_id, season_id);

-- ---------- 15. 约球房间 ----------
CREATE TABLE IF NOT EXISTS match_rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 活动时间。用真实时间戳而非文本（D-44）：
  -- 过期时间要按「活动结束后」算，文本无法可靠解析成日期。
  start_at     timestamptz NOT NULL,
  end_at       timestamptz,                 -- 选填：打到几点常说不准
  capacity     integer     NOT NULL,
  note         text,
  status       text        NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- 由应用层按 start_at/end_at 计算：结束后 2 小时（无结束时间则开始后 4 小时）
  expires_at   timestamptz NOT NULL,
  cancelled_at timestamptz,
  CONSTRAINT match_rooms_status_chk   CHECK (status IN ('open','full','cancelled','expired')),
  CONSTRAINT match_rooms_capacity_chk CHECK (capacity > 0),
  CONSTRAINT match_rooms_time_chk     CHECK (end_at IS NULL OR end_at > start_at)
);
CREATE INDEX IF NOT EXISTS match_rooms_lobby_idx ON match_rooms(status, start_at ASC);

-- ---------- 16. 约球申请 ----------
CREATE TABLE IF NOT EXISTS room_applications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid        NOT NULL REFERENCES match_rooms(id) ON DELETE CASCADE,
  applicant_id uuid        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending',
  applied_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  CONSTRAINT room_applications_uniq   UNIQUE (room_id, applicant_id),
  CONSTRAINT room_applications_status CHECK (status IN ('pending','approved','rejected','withdrawn'))
);
CREATE INDEX IF NOT EXISTS room_applications_queue_idx ON room_applications(room_id, status, applied_at);

-- ---------- 初始配置数据 ----------
INSERT INTO rating_configs (k_factor, note)
SELECT 40, '初始配置：标准 ELO'
WHERE NOT EXISTS (SELECT 1 FROM rating_configs);

-- ============================================================
-- 以下表由后续迁移新增。
--
-- ⚠️ 这份 schema.sql 只负责**首次建库**（postgres 官方镜像会在首次建库时
--    执行 /docker-entrypoint-initdb.d/），此后所有结构变更都走
--    web/db/migrations/ 下的迁移。
--
--    因此这里必须与迁移**保持同步** —— 否则读这份「权威 schema」的人
--    会以为项目里只有 16 张表。以下内容按迁移编号顺序补录。
-- ============================================================

-- ---------- 17. 社团照片（迁移 010，D-31）----------
CREATE TABLE IF NOT EXISTS photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 卷内的文件名（由服务端生成，不用用户提供的名字，避免路径穿越）
  filename     text        NOT NULL UNIQUE,
  caption      text,
  -- 精选：决定是否出现在首页（D-31 第三条）
  is_featured  boolean     NOT NULL DEFAULT false,
  width        integer,
  height       integer,
  bytes        integer,
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- 18. 站点可配置文案（迁移 012，D-34）----------
CREATE TABLE IF NOT EXISTS site_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  label      text NOT NULL,          -- 管理界面上的字段名，由代码维护
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- ---------- 19. 站内消息通知（迁移 018，D-43）----------
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,   -- 事件类型，如 room.applied
  title      text        NOT NULL,   -- 已渲染的标题（写入时定稿）
  body       text,
  link       text,                   -- 站内跳转路径
  dedupe_key text,                   -- 去重键：同一键在窗口内只留一条
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id) WHERE read_at IS NULL;

-- ---------- 20. 群内确认：注册（迁移 022，D-45）----------
CREATE TABLE IF NOT EXISTS pending_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 与 users.qq_number 同样唯一：一个 QQ 号同时只能有一笔待确认，防止刷屏
  qq_number     text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  student_id    text        NOT NULL,
  -- ⚠️ 必要的恶：确认发生在**另一个请求**里，密码必须活到那时。
  --    缓解：① 10 分钟 TTL ② 确认后随记录一起删除 ③ 与正式密码同一套 scrypt。
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

-- ---------- 21. 群内确认：重置密码（迁移 022 + 024，D-45）----------
CREATE TABLE IF NOT EXISTS pending_password_resets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 发起凭据的 sha256。明文只存在于发起者的 httpOnly cookie 里。
  -- 改密要求「群里确认过」**且**「带着它」—— 见 D-45 方案 B。
  initiator_hash text,
  session_id     uuid        REFERENCES login_sessions(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  -- 群内确认的时刻。为空表示还没人在群里确认，此时不允许改密。
  confirmed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS pending_resets_user_idx
  ON pending_password_resets (user_id, created_at DESC);
