-- Instructor invitations: only an admin can invite someone to become an instructor.
-- Regular users have no self-promotion path; the invitation is single-use, expires,
-- and is revoked explicitly when needed. A pending invitation for an email is also
-- auto-accepted when that email registers (invited_user_id stays null until then).
CREATE TABLE instructor_invitations (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  email            CITEXT NOT NULL,
  invited_by       UUID NOT NULL REFERENCES users(id),
  token_hash       CHAR(64) NOT NULL UNIQUE,
  token            TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_user_id  UUID REFERENCES users(id),
  message          TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_instructor_invitations_pending ON instructor_invitations (status, expires_at);
CREATE INDEX idx_instructor_invitations_email ON instructor_invitations (email);

GRANT SELECT, INSERT, UPDATE ON instructor_invitations TO upskill_app;
GRANT SELECT ON instructor_invitations TO upskill_readonly;
