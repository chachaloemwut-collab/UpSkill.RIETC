-- 0037_course_defaults_match_columns.sql — data only (works with the running app version)
-- 0032 seeded course_defaults with looser values than the courses column defaults
-- (free_complete navigation, pass 60, no sequential lock, 60-min quiz), silently
-- weakening every new course. Restore the column defaults, but only if no admin
-- has saved course_defaults yet (updated_by is set by updateCourseDefaults).

UPDATE system_settings
SET value = '{
      "min_watch_percentage": 90,
      "passing_quiz_score": 80,
      "max_quiz_attempts_per_day": 3,
      "quiz_time_limit_min": 30,
      "is_sequential_locked": true,
      "navigation_mode": "linear",
      "completion_rule": "post_test"
    }'::jsonb,
    updated_at = now()
WHERE key = 'course_defaults'
  AND updated_by IS NULL;
