-- Quiz pool drawing and answer-key correction records (I-15).

-- 1. Per-question tags for pool membership (e.g. 'hard', 'topic_x')
ALTER TABLE quiz_questions
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

-- 2. How many questions to draw per attempt (null = use all)
ALTER TABLE courses
  ADD COLUMN quiz_draw_count SMALLINT
    CHECK (quiz_draw_count IS NULL OR quiz_draw_count BETWEEN 1 AND 200);

-- 3. Answer-key correction records — created when an instructor changes
--    correct_option_id; applying them updates attempt score/is_passed.
CREATE TABLE quiz_score_corrections (
    id                   UUID PRIMARY KEY DEFAULT uuidv7(),
    course_id            UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    question_id          UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    attempt_id           UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    old_correct_text     TEXT NOT NULL,  -- option text that was correct before the change
    new_correct_text     TEXT NOT NULL,  -- option text that is correct after the change
    old_score_percentage NUMERIC(5,2) NOT NULL,
    new_score_percentage NUMERIC(5,2) NOT NULL,
    old_is_passed        BOOLEAN NOT NULL,
    new_is_passed        BOOLEAN NOT NULL,
    applied_at           TIMESTAMPTZ,
    applied_by           UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (question_id, attempt_id)
);
CREATE INDEX idx_quiz_corrections_course ON quiz_score_corrections (course_id, applied_at NULLS FIRST);
CREATE INDEX idx_quiz_corrections_question ON quiz_score_corrections (question_id, applied_at NULLS FIRST);

GRANT SELECT, INSERT, UPDATE, DELETE ON quiz_score_corrections TO upskill_app;
GRANT SELECT ON quiz_score_corrections TO upskill_readonly;
