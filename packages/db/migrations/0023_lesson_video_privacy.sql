-- =====================================================================
-- 0023_lesson_video_privacy.sql : Lesson video privacy & link copy permission
-- Adds is_public boolean flag to lessons to determine whether the video source is
-- public (allow copying link) or unlisted/private (prohibit copying link).
-- =====================================================================

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

GRANT SELECT, INSERT, UPDATE, DELETE ON lessons TO upskill_app;
GRANT SELECT ON lessons TO upskill_readonly;
