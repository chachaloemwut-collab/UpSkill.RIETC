-- I-04: Add 'enrollment_closed' visibility state so instructors can stop accepting
-- new learners while existing learners continue to access and complete the course.
-- This separates "stop new enrollment" from "hide from catalog" (unlisted) and
-- "fully retire" (archived).

ALTER TABLE courses DROP CONSTRAINT courses_visibility_check;
ALTER TABLE courses ADD CONSTRAINT courses_visibility_check
  CHECK (visibility IN ('draft', 'published', 'unlisted', 'suspended', 'archived', 'enrollment_closed'));
