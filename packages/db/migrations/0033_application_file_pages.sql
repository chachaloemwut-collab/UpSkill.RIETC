-- =====================================================================
-- 0033_application_file_pages.sql — additive only
-- I-10: multi-page document slots and file version history.
-- page_no: each doc_key can have multiple ordered pages (e.g. front/back of ID).
-- superseded_at: set when the applicant re-uploads after an admin re-upload request;
--   the old file stays readable so reviewers can compare versions.
-- =====================================================================

ALTER TABLE course_application_files
  ADD COLUMN page_no INT NOT NULL DEFAULT 1,
  ADD COLUMN superseded_at TIMESTAMPTZ;

ALTER TABLE course_application_files
  ADD CONSTRAINT chk_page_no CHECK (page_no BETWEEN 1 AND 10);
