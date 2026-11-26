-- Scheduled expiry is a system event and has no human actor.
ALTER TABLE recovery_case_events ALTER COLUMN actor_id DROP NOT NULL;
