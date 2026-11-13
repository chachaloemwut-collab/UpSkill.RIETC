-- Transactional email delivery, preferences, provider events, and course assignments.

CREATE TABLE email_preferences (
    user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    course_updates_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    learning_reminders_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_summary_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_email_preferences_updated BEFORE UPDATE ON email_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE email_suppressions (
    email          CITEXT PRIMARY KEY,
    reason         VARCHAR(30) NOT NULL CHECK (reason IN ('hard_bounce','complaint','manual')),
    provider_event_id VARCHAR(255),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_email     CITEXT NOT NULL,
    template_key        VARCHAR(80) NOT NULL,
    template_version    INT NOT NULL DEFAULT 1 CHECK (template_version > 0),
    payload             JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    deduplication_key   VARCHAR(255) NOT NULL UNIQUE,
    category            VARCHAR(30) NOT NULL DEFAULT 'transactional'
                          CHECK (category IN ('security','transactional','course_update','learning_reminder','system')),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','sent','failed','suppressed')),
    attempt_count       INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at          TIMESTAMPTZ,
    provider_message_id VARCHAR(255),
    last_error_code     VARCHAR(100),
    last_error_message  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ
);
CREATE INDEX idx_email_outbox_pending ON email_outbox (next_attempt_at, created_at)
  WHERE status IN ('pending','processing');
CREATE INDEX idx_email_outbox_user ON email_outbox (user_id, created_at DESC);

CREATE TABLE email_delivery_events (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    outbox_id           UUID REFERENCES email_outbox(id) ON DELETE SET NULL,
    provider_event_id   VARCHAR(255) UNIQUE,
    provider_message_id VARCHAR(255),
    recipient_email     CITEXT,
    event_type          VARCHAR(30) NOT NULL
                          CHECK (event_type IN ('queued','sent','delivered','deferred','soft_bounce','hard_bounce','complaint','rejected','opened','clicked')),
    payload             JSONB NOT NULL DEFAULT '{}',
    occurred_at         TIMESTAMPTZ NOT NULL,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_delivery_events_outbox ON email_delivery_events (outbox_id, occurred_at DESC);

CREATE TABLE learning_groups (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_learning_groups_updated BEFORE UPDATE ON learning_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE learning_group_members (
    group_id   UUID NOT NULL REFERENCES learning_groups(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE course_assignments (
    id                UUID PRIMARY KEY DEFAULT uuidv7(),
    course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assigned_by       UUID NOT NULL REFERENCES users(id),
    target_user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    target_group_id   UUID REFERENCES learning_groups(id) ON DELETE CASCADE,
    note              TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
    due_at            TIMESTAMPTZ,
    status            VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at      TIMESTAMPTZ,
    CHECK ((target_user_id IS NULL) <> (target_group_id IS NULL)),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX idx_course_assignments_course ON course_assignments (course_id, created_at DESC);

CREATE TABLE course_assignment_recipients (
    assignment_id UUID NOT NULL REFERENCES course_assignments(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at  TIMESTAMPTZ,
    PRIMARY KEY (assignment_id, user_id)
);
CREATE INDEX idx_course_assignment_recipients_user ON course_assignment_recipients (user_id, assigned_at DESC);

ALTER TABLE certificates
  ADD COLUMN pdf_ready_at TIMESTAMPTZ,
  ADD COLUMN pdf_failed_at TIMESTAMPTZ,
  ADD COLUMN pdf_last_error TEXT;

-- Signed certificate fields stay immutable. Operational PDF state and one-time revocation may change.
CREATE OR REPLACE FUNCTION guard_certificate_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'certificates are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at' - 'revoked_reason' - 'pdf_ready_at' - 'pdf_failed_at' - 'pdf_last_error')
       IS DISTINCT FROM
     (to_jsonb(OLD) - 'revoked_at' - 'revoked_reason' - 'pdf_ready_at' - 'pdf_failed_at' - 'pdf_last_error') THEN
    RAISE EXCEPTION 'certificate fields are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (
       NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason) THEN
    RAISE EXCEPTION 'certificate already revoked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON email_preferences, email_suppressions, email_outbox,
  email_delivery_events, learning_groups, learning_group_members, course_assignments,
  course_assignment_recipients TO upskill_app;
GRANT USAGE, SELECT ON SEQUENCE email_delivery_events_id_seq TO upskill_app;

REVOKE DELETE, TRUNCATE ON email_outbox, email_delivery_events FROM upskill_app;
REVOKE UPDATE, DELETE, TRUNCATE ON email_delivery_events FROM upskill_app;

GRANT SELECT ON email_preferences, email_outbox, email_delivery_events, learning_groups,
  learning_group_members, course_assignments, course_assignment_recipients TO upskill_readonly;
REVOKE SELECT ON email_suppressions FROM upskill_readonly;
