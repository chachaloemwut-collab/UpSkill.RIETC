-- Certificate presentation v3: configurable achievement line, signer title, and an
-- anti-forgery "visual digest" (a short fingerprint printed on the paper so a verifier
-- can compare it against the online record, mirroring thai-digital-certificate-demo).

ALTER TABLE courses
  ADD COLUMN credential_achievement_th VARCHAR(255) NOT NULL DEFAULT 'ผ่านการอบรมและการประเมินตามเกณฑ์',
  ADD COLUMN credential_achievement_en VARCHAR(255);

ALTER TABLE certificates
  ADD COLUMN signer_title_snapshot VARCHAR(255),
  ADD COLUMN achievement_snapshot VARCHAR(255),
  ADD COLUMN visual_digest VARCHAR(16) NOT NULL DEFAULT '';
