-- Migration 0022: Course archival support and deletion guardrail
-- 1. Allow 'archived' in courses.visibility so closed/historical courses can be archived
--    while permanently preserving all completed enrollments and certificate snapshots.
ALTER TABLE courses DROP CONSTRAINT courses_visibility_check;
ALTER TABLE courses ADD CONSTRAINT courses_visibility_check
  CHECK (visibility IN ('draft', 'published', 'unlisted', 'suspended', 'archived'));

-- 2. Guard against accidental deletion of courses that have completed learners or certificates.
--    Such courses must be archived, not deleted, to maintain cryptographic and audit integrity.
CREATE OR REPLACE FUNCTION guard_course_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM certificates WHERE course_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION 'CANNOT_DELETE_COURSE_WITH_CERTIFICATES: หลักสูตรนี้มีการออกใบรับรองแล้ว ไม่สามารถลบได้ กรุณาเปลี่ยนสถานะเป็น archived แทน'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM enrollments WHERE course_id = OLD.id AND status = 'completed' LIMIT 1) THEN
    RAISE EXCEPTION 'CANNOT_DELETE_COURSE_WITH_COMPLETED_ENROLLMENTS: หลักสูตรนี้มีผู้เรียนที่จบการศึกษาแล้ว ไม่สามารถลบได้ กรุณาเปลี่ยนสถานะเป็น archived แทน'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_course_delete ON courses;
CREATE TRIGGER trg_guard_course_delete
  BEFORE DELETE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION guard_course_delete();
