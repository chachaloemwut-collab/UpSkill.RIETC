-- Multi-stage assessments: pre-test, per-lesson checks, and post-test.
-- Existing questions/attempts remain post-tests through the defaults below.

ALTER TABLE quiz_questions
  ADD COLUMN assessment_type VARCHAR(20) NOT NULL DEFAULT 'post'
    CHECK (assessment_type IN ('pre','lesson','post')),
  ADD COLUMN lesson_id UUID REFERENCES lessons(id) ON DELETE RESTRICT,
  ADD CONSTRAINT chk_quiz_question_target
    CHECK ((assessment_type = 'lesson') = (lesson_id IS NOT NULL));

CREATE INDEX idx_quiz_questions_assessment
  ON quiz_questions (course_id, assessment_type, lesson_id, created_at)
  WHERE is_active;

ALTER TABLE quiz_attempts
  ADD COLUMN assessment_type VARCHAR(20) NOT NULL DEFAULT 'post'
    CHECK (assessment_type IN ('pre','lesson','post')),
  ADD COLUMN lesson_id UUID REFERENCES lessons(id) ON DELETE RESTRICT,
  ADD COLUMN focus_event_count INT NOT NULL DEFAULT 0 CHECK (focus_event_count >= 0),
  ADD CONSTRAINT chk_quiz_attempt_target
    CHECK ((assessment_type = 'lesson') = (lesson_id IS NOT NULL));

CREATE INDEX idx_quiz_attempts_target
  ON quiz_attempts (enrollment_id, assessment_type, lesson_id, started_at DESC);

CREATE TABLE assessment_focus_events (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id     UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type     VARCHAR(20) NOT NULL CHECK (event_type IN ('hidden','pagehide')),
    elapsed_sec    INT NOT NULL DEFAULT 0 CHECK (elapsed_sec >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessment_focus_attempt
  ON assessment_focus_events (attempt_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_focus_events TO upskill_app;
GRANT USAGE, SELECT ON SEQUENCE assessment_focus_events_id_seq TO upskill_app;
GRANT SELECT ON assessment_focus_events TO upskill_readonly;
