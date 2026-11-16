-- =====================================================================
-- 0021_user_secondary_emails.sql : Multi-email support & data flexibility
-- Every account can link multiple emails (e.g. personal, institutional).
-- INVARIANT: An account must always retain at least one email.
-- =====================================================================

CREATE TABLE user_emails (
    id                      UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email                   CITEXT UNIQUE NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT false,
    verified_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_emails_user_id ON user_emails(user_id);
CREATE UNIQUE INDEX idx_user_emails_unique_primary ON user_emails(user_id) WHERE is_primary = true;
CREATE TRIGGER trg_user_emails_updated BEFORE UPDATE ON user_emails FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce that an account cannot delete its only email or its primary email (unless the user itself is deleted)
CREATE OR REPLACE FUNCTION guard_user_emails_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user_exists BOOLEAN;
    v_remaining INT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) INTO v_user_exists;
    IF v_user_exists THEN
        SELECT count(*) INTO v_remaining FROM user_emails WHERE user_id = OLD.user_id AND id <> OLD.id;
        IF v_remaining < 1 THEN
            RAISE EXCEPTION 'cannot delete the only email of a user: at least one email is required' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.is_primary THEN
            RAISE EXCEPTION 'cannot delete primary email: designate another primary email first' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_user_emails_delete BEFORE DELETE ON user_emails FOR EACH ROW EXECUTE FUNCTION guard_user_emails_delete();

-- Backfill existing primary emails from users table into user_emails
INSERT INTO user_emails (user_id, email, is_primary, verified_at, created_at)
SELECT id, email, true, email_verified_at, created_at
FROM users
ON CONFLICT (email) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_emails TO upskill_app;
GRANT SELECT ON user_emails TO upskill_readonly;
