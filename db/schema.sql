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
  time_slot    text        NOT NULL,
  capacity     integer     NOT NULL,
  note         text,
  status       text        NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  cancelled_at timestamptz,
  CONSTRAINT match_rooms_status_chk   CHECK (status IN ('open','full','cancelled','expired')),
  CONSTRAINT match_rooms_capacity_chk CHECK (capacity > 0)
);
CREATE INDEX IF NOT EXISTS match_rooms_lobby_idx ON match_rooms(status, created_at DESC);

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
