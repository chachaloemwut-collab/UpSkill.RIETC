-- In-video checkpoint scoring (anti-cheat): each checkpoint is worth 10 points.
-- A wrong answer costs 2 points; after 3 wrong attempts the checkpoint locks and the
-- lesson progress is reset so the learner must watch the lesson again from the start.
CREATE TABLE checkpoint_attempts (
  id                 UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id          UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  attempt_count      INT NOT NULL DEFAULT 0,
  correct_on_attempt INT,
  score              SMALLINT CHECK (score IS NULL OR score >= 0),
  passed_at          TIMESTAMPTZ,
  locked_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX idx_checkpoint_attempts_user ON checkpoint_attempts (user_id);

GRANT SELECT, INSERT, UPDATE ON checkpoint_attempts TO upskill_app;
GRANT SELECT ON checkpoint_attempts TO upskill_readonly;
