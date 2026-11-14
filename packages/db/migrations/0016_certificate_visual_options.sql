-- Certificate visual customization: per-course pattern, background image and text alignment.
-- These are snapshotted onto each issued certificate so later course edits never change
-- an already-issued document. The anti-forgery watermark + visual digest stay on every pattern.
ALTER TABLE courses
  ADD COLUMN credential_background_url TEXT CHECK (credential_background_url IS NULL OR credential_background_url ~ '^https://'),
  ADD COLUMN credential_text_align VARCHAR(10) NOT NULL DEFAULT 'center' CHECK (credential_text_align IN ('center','left'));

ALTER TABLE certificates
  ADD COLUMN template_snapshot VARCHAR(40) NOT NULL DEFAULT 'standard',
  ADD COLUMN background_url_snapshot TEXT,
  ADD COLUMN text_align_snapshot VARCHAR(10) NOT NULL DEFAULT 'center';
