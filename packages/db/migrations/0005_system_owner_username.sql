-- A single protected system-owner account can sign in with a username.
-- Ordinary members still use a validated email address or Google OAuth.
ALTER TABLE users
  ADD COLUMN username CITEXT,
  ADD COLUMN is_system_owner BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT users_username_format CHECK (
    username IS NULL OR username::text ~ '^[a-z][a-z0-9._-]{2,31}$'
  );

CREATE UNIQUE INDEX users_username_unique ON users (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX users_single_system_owner ON users (is_system_owner) WHERE is_system_owner;

CREATE OR REPLACE FUNCTION guard_system_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system_owner AND (
       NEW.is_system_owner IS DISTINCT FROM TRUE OR
       NEW.role IS DISTINCT FROM 'admin' OR
       NEW.status IS DISTINCT FROM 'active' OR
       NEW.username IS DISTINCT FROM OLD.username
  ) THEN
    RAISE EXCEPTION 'system owner account is protected' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_system_owner AND (
       NEW.role IS DISTINCT FROM 'admin' OR
       NEW.status IS DISTINCT FROM 'active' OR
       NEW.username IS NULL
  ) THEN
    RAISE EXCEPTION 'system owner must be an active admin with a username' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_users_system_owner
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION guard_system_owner();

