-- =====================================================================
-- 0001_init.sql : core schema (PostgreSQL 18+)
-- Differences from the original spec are marked [CHANGED] / [NEW].
-- See docs/SECURITY.md section "Spec deviations" for the reasoning.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email

-- Shared trigger for updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ==========================================
-- 1. IAM
-- ==========================================
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT uuidv7(),       -- [CHANGED] uuidv7: time-ordered, better index locality
    email                   CITEXT UNIQUE NOT NULL,                  -- [CHANGED] citext: blocks A@x.com vs a@x.com duplicates
    email_verified_at       TIMESTAMPTZ,
    password_hash           TEXT,                                    -- argon2id PHC string; NULL = Google-only account
    password_updated_at     TIMESTAMPTZ,

    legal_full_name_th      VARCHAR(255),
    legal_full_name_en      VARCHAR(255),
    legal_name_locked_at    TIMESTAMPTZ,                             -- [CHANGED] timestamp instead of a boolean (serves as evidence)

    role    VARCHAR(20) NOT NULL DEFAULT 'member'  CHECK (role IN ('member','instructor','admin')),
    status  VARCHAR(20) NOT NULL DEFAULT 'active'  CHECK (status IN ('active','suspended','banned')),

    -- [CHANGED] active_stream_token moved to Redis + learning_sessions (see section 3)

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Once the legal name is locked, it can no longer be changed (enforced at the DB layer, not just the app)
CREATE OR REPLACE FUNCTION guard_legal_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.legal_name_locked_at IS NOT NULL AND (
       NEW.legal_full_name_th IS DISTINCT FROM OLD.legal_full_name_th OR
       NEW.legal_full_name_en IS DISTINCT FROM OLD.legal_full_name_en OR
       NEW.legal_name_locked_at IS DISTINCT FROM OLD.legal_name_locked_at) THEN
    RAISE EXCEPTION 'legal name is locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_users_legal_name BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_legal_name();

CREATE TABLE user_oauth_accounts (
    id                UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          VARCHAR(30) NOT NULL DEFAULT 'google',
    provider_user_id  VARCHAR(255) NOT NULL,                         -- 'sub' claim
    provider_email    CITEXT NOT NULL,
    linked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id),
    UNIQUE (user_id, provider)
);

-- [CHANGED] Opaque session token (no JWT/refresh pair). Only the SHA-256 is stored; can be revoked immediately.
CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    user_agent      TEXT,
    ip_address      INET,                                            -- [CHANGED] INET instead of VARCHAR
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    idle_expires_at TIMESTAMPTZ NOT NULL,                            -- sliding (e.g. 7 days)
    expires_at      TIMESTAMPTZ NOT NULL,                            -- absolute (e.g. 30 days)
    revoked_at      TIMESTAMPTZ,
    revoked_reason  VARCHAR(50)
);
CREATE INDEX idx_user_sessions_user_active ON user_sessions (user_id) WHERE revoked_at IS NULL;

-- [NEW] The spec has email_verified_at but no verification flow
CREATE TABLE email_verification_tokens (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    email       CITEXT NOT NULL,                                     -- the email being verified (prevents a link from verifying a changed address)
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    reset_method  VARCHAR(30) NOT NULL CHECK (reset_method IN ('email_link','google_reauth')),
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 2. Courses & Lessons
-- ==========================================
CREATE TABLE courses (
    id                    UUID PRIMARY KEY DEFAULT uuidv7(),
    instructor_id         UUID NOT NULL REFERENCES users(id),
    title                 VARCHAR(255) NOT NULL,
    slug                  VARCHAR(255) UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description           TEXT,
    thumbnail_url         TEXT CHECK (thumbnail_url IS NULL OR thumbnail_url ~ '^https://'),
    visibility            VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (visibility IN ('draft','published','unlisted','suspended')),
    is_verified_course    BOOLEAN NOT NULL DEFAULT FALSE,
    min_watch_percentage  INT NOT NULL DEFAULT 90 CHECK (min_watch_percentage BETWEEN 50 AND 100),
    passing_quiz_score    INT NOT NULL DEFAULT 80 CHECK (passing_quiz_score BETWEEN 0 AND 100),
    max_quiz_attempts_per_day INT NOT NULL DEFAULT 3 CHECK (max_quiz_attempts_per_day BETWEEN 1 AND 20), -- [NEW] anti brute-force answers
    quiz_time_limit_sec   INT NOT NULL DEFAULT 1800 CHECK (quiz_time_limit_sec BETWEEN 60 AND 14400),  -- [NEW]
    is_sequential_locked  BOOLEAN NOT NULL DEFAULT TRUE,
    total_duration_sec    INT NOT NULL DEFAULT 0,
    published_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_courses_instructor ON courses (instructor_id);
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE lessons (
    id                UUID PRIMARY KEY DEFAULT uuidv7(),
    course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sequence_order    INT NOT NULL CHECK (sequence_order > 0),
    title             VARCHAR(255) NOT NULL,
    youtube_video_id  VARCHAR(11) NOT NULL CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),  -- [CHANGED] strict format
    duration_sec      INT NOT NULL CHECK (duration_sec > 0),
    video_status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (video_status IN ('active','broken')),
    video_checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),          -- [NEW] for the recheck cron
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- [CHANGED] DEFERRABLE so lessons can be reordered inside one transaction without a unique violation
    CONSTRAINT uq_lessons_order UNIQUE (course_id, sequence_order) DEFERRABLE INITIALLY IMMEDIATE
);

-- [NEW] Client-side reports of broken videos are only a "signal". The worker re-checks with the YouTube API before marking a lesson broken
CREATE TABLE video_reports (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    error_code   INT NOT NULL CHECK (error_code IN (2,5,100,101,150,153)),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);
CREATE INDEX idx_video_reports_open ON video_reports (lesson_id) WHERE resolved_at IS NULL;

-- ==========================================
-- 3. Learning tracking & anti-cheat
-- ==========================================
CREATE TABLE enrollments (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','revoked')),
    enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    UNIQUE (user_id, course_id)
);

-- [NEW] One row per viewing window. The active pointer lives in Redis (atomic swap).
-- This table is the forensic trail when a certificate is disputed.
CREATE TABLE learning_sessions (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id      UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id          UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    token_hash         BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    last_seq           INT NOT NULL DEFAULT 0,                       -- anti-replay: seq must strictly increase
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at           TIMESTAMPTZ,
    end_reason         VARCHAR(30) CHECK (end_reason IN ('superseded','completed','expired','logout')),
    ip_address         INET,
    user_agent         TEXT
);
CREATE INDEX idx_learning_sessions_user ON learning_sessions (user_id, started_at DESC);

CREATE TABLE lesson_progress (
    id                     UUID PRIMARY KEY DEFAULT uuidv7(),
    enrollment_id          UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id              UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    watched_chunks         INT[] NOT NULL DEFAULT '{}',              -- 10-second chunk indexes verified by the server
    total_chunks_required  INT NOT NULL CHECK (total_chunks_required > 0),
    max_watched_sec        INT NOT NULL DEFAULT 0,                   -- advances only through verified playback
    last_position_sec      INT NOT NULL DEFAULT 0,
    accumulated_valid_sec  INT NOT NULL DEFAULT 0,
    last_ping_at           TIMESTAMPTZ,
    -- [NEW] Start of the current continuous playback segment, used to detect speed-up cumulatively
    -- (e.g. 1.25x can't be seen in a single ping but shows up within 2-3 pings)
    segment_start_pos_sec  INT,
    segment_started_at     TIMESTAMPTZ,
    cheat_flag_count       INT NOT NULL DEFAULT 0,
    is_completed           BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at           TIMESTAMPTZ,
    UNIQUE (enrollment_id, lesson_id)
);

-- [NEW] Details of every flag (instead of only incrementing a counter) so admins can review evidence
CREATE TABLE anticheat_events (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id           UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    reason              VARCHAR(40) NOT NULL,                        -- TOO_FAST | POSITION_JUMP | REPLAY | ...
    details             JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anticheat_user ON anticheat_events (user_id, created_at DESC);

-- ==========================================
-- 4. Assessment
-- ==========================================
CREATE TABLE quiz_questions (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    question_text      TEXT NOT NULL,
    options            JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 8),
    correct_option_id  VARCHAR(10) NOT NULL,                         -- never send to the client
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,                -- [NEW] soft delete; keeps old attempts intact
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quiz_questions_course ON quiz_questions (course_id) WHERE is_active;

CREATE TABLE quiz_attempts (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    enrollment_id       UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,                        -- [NEW] time limit enforced by the server
    submitted_at        TIMESTAMPTZ,
    -- [CHANGED] the snapshot includes the answer key at the start of the attempt (server only),
    -- so grading is not affected if the instructor edits questions mid-attempt
    questions_snapshot  JSONB NOT NULL,
    user_answers        JSONB,
    score_percentage    NUMERIC(5,2),
    is_passed           BOOLEAN
);
-- Only one open attempt per enrollment at a time
CREATE UNIQUE INDEX uq_quiz_attempt_open ON quiz_attempts (enrollment_id) WHERE submitted_at IS NULL;

-- ==========================================
-- 5. Certificates
-- ==========================================
CREATE TABLE certificates (
    id                          UUID PRIMARY KEY DEFAULT uuidv7(),
    certificate_code            VARCHAR(32) UNIQUE NOT NULL,         -- [CHANGED] CERT-2026-XXXX-XXXX-XXXX (60-bit, Crockford base32)
    enrollment_id               UUID UNIQUE NOT NULL REFERENCES enrollments(id),
    user_id                     UUID NOT NULL REFERENCES users(id),
    course_id                   UUID NOT NULL REFERENCES courses(id),

    recipient_name_snapshot     VARCHAR(255) NOT NULL,
    course_title_snapshot       VARCHAR(255) NOT NULL,
    instructor_name_snapshot    VARCHAR(255) NOT NULL,
    total_actual_study_sec      INT NOT NULL,
    quiz_score_snapshot         NUMERIC(5,2) NOT NULL,
    is_verified_course_snapshot BOOLEAN NOT NULL,

    -- [CHANGED] HMAC replaced by Ed25519 + key id:
    --  * keys can be rotated without breaking old certificates
    --  * third parties can verify offline with the public key at /.well-known/certificate-keys.json
    --  * signed_payload stores the exact bytes that were signed (avoids timestamp precision/serialization bugs)
    signed_payload              TEXT NOT NULL,
    signature                   TEXT NOT NULL,                        -- base64url
    signing_key_id              VARCHAR(40) NOT NULL,

    issued_at                   TIMESTAMPTZ NOT NULL,
    revoked_at                  TIMESTAMPTZ,
    revoked_reason              TEXT,
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

-- After a certificate is issued, only revoked_at/revoked_reason may change, and only once
CREATE OR REPLACE FUNCTION guard_certificate_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'certificates are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at' - 'revoked_reason') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at' - 'revoked_reason') THEN
    RAISE EXCEPTION 'certificate fields are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'certificate already revoked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_certificates_immutable BEFORE UPDATE OR DELETE ON certificates
  FOR EACH ROW EXECUTE FUNCTION guard_certificate_immutable();

-- ==========================================
-- 6. Append-only audit log
-- ==========================================
CREATE TABLE audit_logs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(50),
    entity_id    UUID,
    ip_address   INET,
    user_agent   TEXT,
    details      JSONB NOT NULL DEFAULT '{}',                         -- never put passwords/tokens/PII beyond what is necessary
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
-- Note: ON DELETE SET NULL on user_id is blocked by this trigger => users with an audit history
-- cannot be hard-deleted. For PDPA erasure, anonymize the users row instead of deleting it (see docs/SECURITY.md).
