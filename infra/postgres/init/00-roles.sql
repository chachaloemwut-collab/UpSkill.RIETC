-- Runs once when the dev container is first created.
-- Separate roles by least privilege:
--   upskill_owner    : owns the schema and runs migrations (DDL only, never used by the app)
--   upskill_app      : used by web/worker. DML only, and can only INSERT into audit_logs
--   upskill_readonly : for reports/BI
-- In production, create these roles the same way and keep passwords in a Secret Manager.

CREATE ROLE upskill_app LOGIN PASSWORD 'dev_app_password';
CREATE ROLE upskill_readonly LOGIN PASSWORD 'dev_readonly_password';

GRANT CONNECT ON DATABASE upskill TO upskill_app, upskill_readonly;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO upskill_app, upskill_readonly;
