-- Program-level certificate: one certificate can span a whole program (several course
-- enrollments). Either a certificate belongs to one course enrollment (as before) or to
-- one program cohort — never both, never neither.
ALTER TABLE certificates ALTER COLUMN enrollment_id DROP NOT NULL;
ALTER TABLE certificates ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE certificates
  ADD COLUMN program_id UUID REFERENCES programs(id) ON DELETE RESTRICT,
  ADD COLUMN cohort_id UUID REFERENCES program_cohorts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT certificates_course_or_program CHECK (
    (course_id IS NOT NULL AND enrollment_id IS NOT NULL AND program_id IS NULL AND cohort_id IS NULL)
    OR (course_id IS NULL AND enrollment_id IS NULL AND program_id IS NOT NULL AND cohort_id IS NOT NULL)
  );
CREATE INDEX idx_certificates_program ON certificates (program_id) WHERE program_id IS NOT NULL;
