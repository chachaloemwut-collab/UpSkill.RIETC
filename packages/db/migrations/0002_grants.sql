-- =====================================================================
-- 0002_grants.sql : least-privilege grants for the application role
-- Even if the app is compromised via SQL injection, it cannot DROP/ALTER, and cannot
-- UPDATE/DELETE audit logs (blocked by both grant and trigger, as defense in depth).
-- =====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO upskill_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO upskill_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM upskill_app;
REVOKE DELETE, TRUNCATE ON certificates FROM upskill_app;
REVOKE DELETE, TRUNCATE ON anticheat_events FROM upskill_app;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO upskill_readonly;
-- The read-only role must not see secrets or credential hashes
REVOKE SELECT ON user_sessions, password_reset_tokens, email_verification_tokens FROM upskill_readonly;
-- A column-level REVOKE has no effect while a table-level GRANT exists, so revoke the table and grant columns
REVOKE SELECT ON users FROM upskill_readonly;
GRANT SELECT (id, email, email_verified_at, role, status, legal_name_locked_at, created_at, updated_at)
  ON users TO upskill_readonly;
