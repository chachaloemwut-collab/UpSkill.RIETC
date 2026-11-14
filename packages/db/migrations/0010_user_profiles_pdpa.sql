-- =====================================================================
-- 0010: member profile collected at sign-up, under the PDPA privacy notice.
--
-- Personal data is kept apart from `users` so it can be restricted and erased on its own:
--   * national ID: never stored in clear. national_id_hmac (keyed digest) enforces one account per person,
--     national_id_encrypted (AES-256-GCM, app key) allows authorised retrieval, last4 is for display.
--   * the read-only role gets no access to this table.
-- =====================================================================

CREATE TABLE user_profiles (
    user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    title_th               VARCHAR(40)  NOT NULL,
    first_name_th          VARCHAR(100) NOT NULL,
    last_name_th           VARCHAR(100) NOT NULL,
    title_en               VARCHAR(40)  NOT NULL,
    first_name_en          VARCHAR(100) NOT NULL,
    last_name_en           VARCHAR(100) NOT NULL,
    phone                  VARCHAR(10)  NOT NULL CHECK (phone ~ '^0[2-9][0-9]{7,8}$'),
    birth_date             DATE NOT NULL CHECK (birth_date >= DATE '1900-01-01'),
    address_line           VARCHAR(255) NOT NULL,
    subdistrict            VARCHAR(100) NOT NULL,
    district               VARCHAR(100) NOT NULL,
    province               VARCHAR(100) NOT NULL,
    postal_code            CHAR(5) NOT NULL CHECK (postal_code ~ '^[1-9][0-9]{4}$'),
    national_id_hmac       BYTEA NOT NULL UNIQUE CHECK (octet_length(national_id_hmac) = 32),
    national_id_encrypted  TEXT NOT NULL,
    national_id_last4      CHAR(4) NOT NULL CHECK (national_id_last4 ~ '^[0-9]{4}$'),
    -- Applicants under 20: a guardian is recorded and must have consented
    guardian_name          VARCHAR(255),
    guardian_phone         VARCHAR(10) CHECK (guardian_phone IS NULL OR guardian_phone ~ '^0[2-9][0-9]{7,8}$'),
    guardian_consented_at  TIMESTAMPTZ,
    -- Which privacy notice the member accepted, and when (evidence of consent)
    pdpa_notice_version    VARCHAR(20) NOT NULL,
    pdpa_consented_at      TIMESTAMPTZ NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((guardian_name IS NULL) = (guardian_phone IS NULL)),
    CHECK ((guardian_name IS NULL) = (guardian_consented_at IS NULL))
);
CREATE TRIGGER trg_user_profiles_updated BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Identity fields are fixed once set: the national ID always, the names after the certificate name is locked
CREATE OR REPLACE FUNCTION guard_user_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.national_id_hmac IS DISTINCT FROM OLD.national_id_hmac
     OR NEW.national_id_encrypted IS DISTINCT FROM OLD.national_id_encrypted
     OR NEW.national_id_last4 IS DISTINCT FROM OLD.national_id_last4 THEN
    RAISE EXCEPTION 'national id cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.title_th, NEW.first_name_th, NEW.last_name_th, NEW.title_en, NEW.first_name_en, NEW.last_name_en)
       IS DISTINCT FROM (OLD.title_th, OLD.first_name_th, OLD.last_name_th, OLD.title_en, OLD.first_name_en, OLD.last_name_en)
     AND EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.legal_name_locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'legal name is locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_user_profiles_guard BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION guard_user_profile();

GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles TO upskill_app;
