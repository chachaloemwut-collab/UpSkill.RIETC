-- 0036_grants_fix.sql
-- 0002_grants.sql used ON ALL TABLES which only covers tables existing at run time.
-- Tables created in later migrations (0028, 0032, 0034, 0035) were missed.
-- Fix: grant the app role on each new table, and set DEFAULT PRIVILEGES so every
-- future table is automatically granted without needing another patch migration.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  quiz_lockout_resets,
  system_settings,
  quiz_score_corrections,
  lesson_activities,
  lesson_activity_results
TO upskill_app;

GRANT SELECT ON TABLE
  quiz_lockout_resets,
  system_settings,
  quiz_score_corrections,
  lesson_activities,
  lesson_activity_results
TO upskill_readonly;

-- Prevent the same problem for all future tables in this schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO upskill_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO upskill_readonly;
