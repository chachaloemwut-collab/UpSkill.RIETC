-- Per-course credential configuration and preferred email language.

ALTER TABLE email_preferences
  ADD COLUMN preferred_locale VARCHAR(5) NOT NULL DEFAULT 'th' CHECK (preferred_locale IN ('th','en'));

ALTER TABLE courses
  ADD COLUMN credential_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN credential_type VARCHAR(40) NOT NULL DEFAULT 'completion' CHECK (credential_type ~ '^[a-z0-9_]+$'),
  ADD COLUMN credential_name_th VARCHAR(120) NOT NULL DEFAULT 'ใบรับรอง',
  ADD COLUMN credential_name_en VARCHAR(120),
  ADD COLUMN credential_template_key VARCHAR(40) NOT NULL DEFAULT 'standard' CHECK (credential_template_key ~ '^[a-z0-9_]+$'),
  ADD COLUMN credential_validity_days INT CHECK (credential_validity_days IS NULL OR credential_validity_days BETWEEN 1 AND 36500),
  ADD COLUMN credential_signer_name VARCHAR(255),
  ADD COLUMN credential_signer_title VARCHAR(255);

ALTER TABLE certificates
  ADD COLUMN payload_version INT NOT NULL DEFAULT 1 CHECK (payload_version IN (1,2)),
  ADD COLUMN document_name_snapshot VARCHAR(120) NOT NULL DEFAULT 'ใบรับรอง',
  ADD COLUMN document_type_snapshot VARCHAR(40) NOT NULL DEFAULT 'completion',
  ADD COLUMN expires_at TIMESTAMPTZ;
