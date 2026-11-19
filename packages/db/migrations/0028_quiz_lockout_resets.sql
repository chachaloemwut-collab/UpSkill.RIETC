-- A03: replace "shift started_at backward" reset with an audited lockout-reset record.
-- When a reset exists, the daily attempt count is calculated from the reset timestamp
-- instead of the fixed 24-hour window, so historical attempt times are never modified.
CREATE TABLE quiz_lockout_resets (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    enrollment_id   UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    assessment_type VARCHAR(10) NOT NULL CHECK (assessment_type IN ('pre', 'lesson', 'post')),
    lesson_id       UUID REFERENCES lessons(id) ON DELETE SET NULL,
    reset_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by      UUID NOT NULL REFERENCES users(id),
    reason          TEXT
);
CREATE INDEX idx_quiz_lockout_resets_enrollment ON quiz_lockout_resets(enrollment_id, assessment_type, lesson_id, reset_at DESC);
