-- Google OAuth can be configured later from the protected admin settings page.
-- The client secret is encrypted by the application before storage.
CREATE TABLE google_oauth_settings (
    id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled                    BOOLEAN NOT NULL DEFAULT FALSE,
    client_id                  TEXT,
    client_secret_encrypted    TEXT,
    version                    INT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by                 UUID REFERENCES users(id),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT enabled OR (client_id IS NOT NULL AND client_secret_encrypted IS NOT NULL))
);
CREATE TRIGGER trg_google_oauth_settings_updated BEFORE UPDATE ON google_oauth_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON google_oauth_settings TO upskill_app;
GRANT SELECT ON google_oauth_settings TO upskill_readonly;
REVOKE SELECT (client_secret_encrypted) ON google_oauth_settings FROM upskill_readonly;

