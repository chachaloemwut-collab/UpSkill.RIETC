-- =====================================================================
-- 0024_course_units_and_completion_rules.sql
-- Additive only (safe with the app version currently running):
--  1. course_units: learning units (หน่วยการเรียนรู้) grouping lessons, each with a summary article
--  2. lessons.unit_id / description / learner_note: unit membership, source credit and a caution note
--  3. courses.navigation_mode:
--       'linear'        = current behaviour (no seeking past the furthest point watched)
--       'free_complete' = seek anywhere, but every part of the video must be watched to complete
--  4. courses.completion_rule:
--       'post_test'            = current behaviour (pass the end-of-course post-test)
--       'lesson_tests_average' = no post-test; the combined score of all end-of-lesson tests must
--                                reach passing_quiz_score
-- Defaults keep every existing course on its current behaviour.
-- =====================================================================

CREATE TABLE course_units (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sequence_order  INT NOT NULL CHECK (sequence_order > 0),
    title           VARCHAR(255) NOT NULL CHECK (length(btrim(title)) > 0),
    summary         TEXT CHECK (summary IS NULL OR length(summary) <= 20000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_units_order UNIQUE (course_id, sequence_order) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX idx_course_units_course ON course_units (course_id, sequence_order);

ALTER TABLE lessons
    ADD COLUMN unit_id      UUID REFERENCES course_units(id) ON DELETE SET NULL,
    ADD COLUMN description  TEXT CHECK (description IS NULL OR length(description) <= 5000),
    ADD COLUMN learner_note TEXT CHECK (learner_note IS NULL OR length(learner_note) <= 2000);
CREATE INDEX idx_lessons_unit ON lessons (unit_id) WHERE unit_id IS NOT NULL;

ALTER TABLE courses
    ADD COLUMN navigation_mode VARCHAR(20) NOT NULL DEFAULT 'linear'
        CHECK (navigation_mode IN ('linear', 'free_complete')),
    ADD COLUMN completion_rule VARCHAR(30) NOT NULL DEFAULT 'post_test'
        CHECK (completion_rule IN ('post_test', 'lesson_tests_average'));

GRANT SELECT, INSERT, UPDATE, DELETE ON course_units TO upskill_app;
GRANT SELECT ON course_units TO upskill_readonly;
