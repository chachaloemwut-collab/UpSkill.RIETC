-- Personal API tokens for MCP access (and future programmatic integrations). The plaintext
-- token is shown only once; only its SHA-256 hash is stored.
CREATE TABLE user_api_tokens (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL,
  token_hash   CHAR(64) NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX idx_user_api_tokens_user ON user_api_tokens (user_id) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON user_api_tokens TO upskill_app;
GRANT SELECT ON user_api_tokens TO upskill_readonly;
