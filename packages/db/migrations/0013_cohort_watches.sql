-- "Notify me when registration opens": users watch a scheduled cohort and are emailed
-- once its registration window opens.
CREATE TABLE cohort_watches (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id  UUID NOT NULL REFERENCES program_cohorts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cohort_id)
);
CREATE INDEX idx_cohort_watches_cohort ON cohort_watches(cohort_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON cohort_watches TO upskill_app;
GRANT SELECT ON cohort_watches TO upskill_readonly;
