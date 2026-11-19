-- I-01: system-level default values that pre-fill new courses
CREATE TABLE system_settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT  -- user id (nullable for initial seed)
);

-- Seed default course criteria so they are readable even before an admin edits them
INSERT INTO system_settings (key, value) VALUES (
  'course_defaults',
  '{
    "min_watch_percentage": 90,
    "passing_quiz_score": 60,
    "max_quiz_attempts_per_day": 3,
    "quiz_time_limit_min": 60,
    "is_sequential_locked": false,
    "navigation_mode": "free_complete",
    "completion_rule": "post_test"
  }'::jsonb
);
