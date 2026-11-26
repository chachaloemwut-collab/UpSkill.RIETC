ALTER TABLE password_reset_tokens ADD COLUMN recipient_email citext;
CREATE TABLE recovery_cases (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 tracking_hash text UNIQUE NOT NULL,
 category text NOT NULL CHECK (category IN ('email','identity','duplicate','google','locked')),
 contact text NOT NULL,
 identifier text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','review','waiting','resolved','declined')),
 assignee_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_cases_queue ON recovery_cases(status, updated_at DESC);
CREATE TABLE recovery_case_events (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 case_id uuid NOT NULL REFERENCES recovery_cases(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL,
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON recovery_cases TO upskill_app;
GRANT SELECT, INSERT ON recovery_case_events TO upskill_app;
-- Retire links when a mailbox is removed or ceases to be primary.
CREATE FUNCTION invalidate_recovery_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE password_reset_tokens SET used_at = now()
 WHERE user_id = OLD.user_id AND reset_method = 'email_link' AND used_at IS NULL
 AND (recipient_email IS NULL OR recipient_email = OLD.email);
 RETURN NULL;
END $$;
CREATE TRIGGER invalidate_deleted_recovery_email AFTER DELETE ON user_emails
 FOR EACH ROW EXECUTE FUNCTION invalidate_recovery_email();
CREATE TRIGGER invalidate_changed_recovery_email AFTER UPDATE ON user_emails
 FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email OR (OLD.is_primary AND NOT NEW.is_primary)
 OR (OLD.verified_at IS NOT NULL AND NEW.verified_at IS NULL)) EXECUTE FUNCTION invalidate_recovery_email();
