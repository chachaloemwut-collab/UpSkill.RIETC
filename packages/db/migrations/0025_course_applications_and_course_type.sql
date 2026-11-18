-- =====================================================================
-- 0025_course_applications_and_course_type.sql — additive only (works with the running app version)
--  1. courses.course_type: what the owner offers —
--       'certified_training' = อบรมเพื่อรับใบรับรอง
--       'short_course'       = หลักสูตรอบรมระยะสั้น ออกใบประกาศนียบัตร
--  2. courses.application_settings: per-course application form (ใบสมัคร); '{}' = off (one-click enroll as before).
--     Interpreted only by packages/core application.ts.
--  3. course_applications: one application per learner per course, with a running number (APP-<BE year>-<seq>),
--     a snapshot of what the applicant declared, and the staff section (verification, registration, payment).
--     Personal data: exported only by course managers (audited); anonymized on account erasure.
-- =====================================================================

ALTER TABLE courses
    ADD COLUMN course_type VARCHAR(30) NOT NULL DEFAULT 'certified_training'
        CHECK (course_type IN ('certified_training', 'short_course')),
    ADD COLUMN application_settings JSONB NOT NULL DEFAULT '{}'
        CHECK (jsonb_typeof(application_settings) = 'object');

CREATE SEQUENCE course_application_no_seq;

CREATE TABLE course_applications (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    application_no      VARCHAR(32) NOT NULL UNIQUE,
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id       UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    -- Course details as printed on the application at the time (code, intake, schedule, venue, fee)
    course_snapshot     JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(course_snapshot) = 'object'),
    -- Applicant identity + contact as declared (national id: last 4 digits only; the full id stays encrypted in user_profiles)
    applicant           JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(applicant) = 'object'),
    education           JSONB,
    occupation          JSONB,
    guardian            JSONB,
    -- { "<doc key>": { "label": ..., "declared": bool, "verified": bool|null } }
    documents           JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(documents) = 'object'),
    declaration_name    VARCHAR(255) NOT NULL,
    declared_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    pdpa_notice_version VARCHAR(40) NOT NULL,
    -- Staff section (ส่วนเจ้าหน้าที่)
    status              VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'incomplete')),
    payment_status      VARCHAR(20) NOT NULL DEFAULT 'not_required' CHECK (payment_status IN ('not_required', 'pending', 'paid', 'waived')),
    receipt_no          VARCHAR(64),
    staff_note          TEXT CHECK (staff_note IS NULL OR length(staff_note) <= 2000),
    reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_applications_user UNIQUE (course_id, user_id)
);
CREATE INDEX idx_course_applications_course ON course_applications (course_id, created_at DESC);
CREATE INDEX idx_course_applications_user ON course_applications (user_id);
CREATE INDEX idx_courses_type ON courses (course_type) WHERE visibility = 'published';

GRANT SELECT, INSERT, UPDATE, DELETE ON course_applications TO upskill_app;
GRANT USAGE, SELECT ON SEQUENCE course_application_no_seq TO upskill_app;
