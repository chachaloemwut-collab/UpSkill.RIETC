-- Runtime-managed outbound email configuration. Sensitive SMTP credentials are
-- encrypted by the application before they reach this table.
CREATE TABLE email_provider_settings (
    id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled                    BOOLEAN NOT NULL DEFAULT TRUE,
    sender_name                VARCHAR(255) NOT NULL,
    sender_email               CITEXT NOT NULL,
    reply_to_email             CITEXT,
    smtp_host                  VARCHAR(255) NOT NULL,
    smtp_port                  INT NOT NULL CHECK (smtp_port BETWEEN 1 AND 65535),
    smtp_security              VARCHAR(20) NOT NULL CHECK (smtp_security IN ('none','starttls','tls')),
    smtp_username              VARCHAR(255),
    smtp_password_encrypted    TEXT,
    version                    INT NOT NULL DEFAULT 1 CHECK (version > 0),
    last_tested_at             TIMESTAMPTZ,
    last_test_status           VARCHAR(20) CHECK (last_test_status IS NULL OR last_test_status IN ('success','failed')),
    last_test_error            TEXT,
    updated_by                 UUID REFERENCES users(id),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((smtp_username IS NULL) = (smtp_password_encrypted IS NULL))
);
CREATE TRIGGER trg_email_provider_settings_updated BEFORE UPDATE ON email_provider_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON email_provider_settings TO upskill_app;
GRANT SELECT ON email_provider_settings TO upskill_readonly;
REVOKE SELECT (smtp_password_encrypted) ON email_provider_settings FROM upskill_readonly;

