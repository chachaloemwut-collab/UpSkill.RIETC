-- 0039_certificate_signature.sql — additive; works with the app version that is running now
--
-- Per-course signature block on certificates, controlled by admins:
--   courses.credential_signature_key   content-addressed image in the certificate storage
--                                      ("signatures/<sha256>.png|jpg"), NULL = no signature uploaded
--   courses.credential_show_signer     admin switch; the signer's name/title/signature are printed only
--                                      when this is on AND a signature image exists
--   certificates.signature_key_snapshot  decided at issue time (NULL = no signer block), so a later
--                                      upload or switch change never alters an issued certificate
-- Old app versions never read these columns and insert certificates without the snapshot (NULL).

ALTER TABLE courses
  ADD COLUMN credential_signature_key VARCHAR(80)
    CHECK (credential_signature_key ~ '^[0-9a-f]{64}\.(png|jpg)$'),
  ADD COLUMN credential_show_signer BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE certificates
  ADD COLUMN signature_key_snapshot VARCHAR(80)
    CHECK (signature_key_snapshot ~ '^[0-9a-f]{64}\.(png|jpg)$');
