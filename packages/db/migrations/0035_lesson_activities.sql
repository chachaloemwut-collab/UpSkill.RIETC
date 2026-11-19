-- Multi-activity structure per lesson (G / 2A.1)
-- Replaces the single checkpoint_* columns on lessons with a flexible list of activities.
-- Old columns are kept for backward compatibility; existing data is migrated forward.

CREATE TABLE lesson_activities (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    activity_type   VARCHAR(20) NOT NULL
                      CHECK (activity_type IN ('question', 'content', 'pause', 'section', 'summary')),
    position_sec    INT NOT NULL CHECK (position_sec >= 0),
    sequence_order  SMALLINT NOT NULL DEFAULT 0,
    -- Published content (what learners see). JSON shape depends on activity_type.
    content         JSONB NOT NULL DEFAULT '{}',
    -- Policy: mode, scoring, on_lock, etc.
    policy          JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Draft system (2A.4): instructor edits land here until explicitly published
    draft_content   JSONB,
    draft_policy    JSONB,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lesson_activities_lesson
  ON lesson_activities (lesson_id, position_sec)
  WHERE is_active;

-- Per-enrollment activity result (replaces checkpoint_attempts for new activities)
CREATE TABLE lesson_activity_results (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    activity_id        UUID NOT NULL REFERENCES lesson_activities(id) ON DELETE CASCADE,
    enrollment_id      UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_count      INT NOT NULL DEFAULT 0,
    correct_on_attempt INT,
    score              SMALLINT CHECK (score IS NULL OR score >= 0),
    passed_at          TIMESTAMPTZ,
    locked_at          TIMESTAMPTZ,
    answer_data        JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (activity_id, enrollment_id)
);

CREATE INDEX idx_lesson_activity_results_enrollment
  ON lesson_activity_results (enrollment_id);
CREATE INDEX idx_lesson_activity_results_activity
  ON lesson_activity_results (activity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_activities TO upskill_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_activity_results TO upskill_app;
GRANT SELECT ON lesson_activities TO upskill_readonly;
GRANT SELECT ON lesson_activity_results TO upskill_readonly;

-- ── Migrate existing checkpoint data ─────────────────────────────────────
-- Each lesson with a checkpoint gets one 'question' activity (published).
INSERT INTO lesson_activities
  (lesson_id, activity_type, position_sec, sequence_order, content, policy, is_active, published_at)
SELECT
  id,
  'question',
  checkpoint_at_sec,
  0,
  jsonb_build_object(
    'question', checkpoint_question,
    'options',  checkpoint_options,
    'correct_index', checkpoint_correct_index
  ),
  jsonb_build_object(
    'mode', 'required',
    'scoring', jsonb_build_object(
      'points', 10,
      'penalty_per_wrong', 2,
      'max_attempts', 3
    ),
    'on_lock', jsonb_build_object(
      'rewatch_sec', 60
    )
  ),
  true,
  now()
FROM lessons
WHERE checkpoint_question IS NOT NULL
  AND checkpoint_at_sec IS NOT NULL;

-- Migrate checkpoint_attempts → lesson_activity_results
-- Joins through lesson_activities by lesson_id and through enrollments by user+course
INSERT INTO lesson_activity_results
  (activity_id, enrollment_id, user_id,
   attempt_count, correct_on_attempt, score, passed_at, locked_at)
SELECT
  la.id,
  e.id,
  ca.user_id,
  ca.attempt_count,
  ca.correct_on_attempt,
  ca.score,
  ca.passed_at,
  ca.locked_at
FROM checkpoint_attempts ca
JOIN lessons l    ON l.id = ca.lesson_id
JOIN lesson_activities la
  ON la.lesson_id = ca.lesson_id
  AND la.activity_type = 'question'
JOIN enrollments e
  ON e.user_id = ca.user_id
  AND e.course_id = l.course_id
ON CONFLICT (activity_id, enrollment_id) DO NOTHING;
