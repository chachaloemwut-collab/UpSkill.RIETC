-- In-video checkpoint question (anti-cheat): a random question pops up at a set position
-- and the video pauses until the learner answers correctly. Deters headless/automated
-- playback that the server-side heartbeat alone cannot catch.
ALTER TABLE lessons
  ADD COLUMN checkpoint_question TEXT,
  ADD COLUMN checkpoint_options JSONB CHECK (checkpoint_options IS NULL OR jsonb_typeof(checkpoint_options) = 'array'),
  ADD COLUMN checkpoint_correct_index SMALLINT CHECK (checkpoint_correct_index IS NULL OR checkpoint_correct_index >= 0),
  ADD COLUMN checkpoint_at_sec INT CHECK (checkpoint_at_sec IS NULL OR checkpoint_at_sec > 0),
  ADD CONSTRAINT lesson_checkpoint_all_or_none CHECK (
    (checkpoint_question IS NULL AND checkpoint_options IS NULL AND checkpoint_correct_index IS NULL AND checkpoint_at_sec IS NULL)
    OR (checkpoint_question IS NOT NULL AND checkpoint_options IS NOT NULL AND checkpoint_correct_index IS NOT NULL AND checkpoint_at_sec IS NOT NULL)
  );
