-- 0042_partner_api_clients.sql — new tables only (additive); works with the app version running now
-- Server-to-server API for other agencies' systems (docs/PARTNER_API.md). A partner looks up training results
-- by a national ID it already holds; the system never sends national IDs out.
--  * the key is shown once at creation; only its SHA-256 is stored (key_prefix finds the row, then a constant-time compare)
--  * every client must have an IP allowlist and an expiry; revoking takes effect on the next request
--  * every call is logged in partner_api_requests WITHOUT the national ID (only whether a person matched)

CREATE TABLE partner_api_clients (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    name          VARCHAR(200) NOT NULL,
    purpose       TEXT NOT NULL CHECK (length(purpose) BETWEEN 10 AND 2000),
    key_prefix    VARCHAR(16) NOT NULL UNIQUE,
    key_hash      CHAR(64) NOT NULL,
    scopes        TEXT[] NOT NULL DEFAULT ARRAY['training:lookup']::text[],
    allowed_ips   TEXT[] NOT NULL CHECK (cardinality(allowed_ips) BETWEEN 1 AND 50),
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    revoked_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    last_used_at  TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);

CREATE TABLE partner_api_requests (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    client_id     UUID REFERENCES partner_api_clients(id) ON DELETE CASCADE,
    endpoint      VARCHAR(100) NOT NULL,
    ip            VARCHAR(64) NOT NULL,
    status        SMALLINT NOT NULL,
    error_code    VARCHAR(64),
    matched       BOOLEAN,
    result_count  INT,
    -- the partner's own reference for the request (no personal data), echoed back for their records
    reference     VARCHAR(100),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_api_requests_client ON partner_api_requests (client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON partner_api_clients TO upskill_app;
GRANT SELECT, INSERT ON partner_api_requests TO upskill_app;
GRANT SELECT ON partner_api_clients TO upskill_readonly;
GRANT SELECT ON partner_api_requests TO upskill_readonly;
