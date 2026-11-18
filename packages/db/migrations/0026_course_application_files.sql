-- =====================================================================
-- 0026_course_application_files.sql — additive only
-- Files attached to a course application (เอกสารประกอบการสมัคร): PDF/JPG/PNG up to 5 MB each.
-- Uploaded before the application is submitted (application_id NULL = pending), attached on submit.
-- The bytes live in the private file storage (same backend as certificate PDFs, prefix applications/);
-- downloads go through the app (owner or course manager only). Deleted on account erasure.
-- =====================================================================

CREATE TABLE course_application_files (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id UUID REFERENCES course_applications(id) ON DELETE CASCADE,
    doc_key        VARCHAR(40) NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    content_type   VARCHAR(40) NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes     INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    sha256         BYTEA NOT NULL,
    storage_key    VARCHAR(200) NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_course_application_files_app ON course_application_files (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX idx_course_application_files_pending ON course_application_files (user_id, course_id, created_at DESC) WHERE application_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON course_application_files TO upskill_app;
