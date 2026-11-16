-- Certificate payloads v3 (per-course presentation, 54021fd) and v4 (program certificates,
-- 650205f) are written by the app, but the original check from 0004 only allowed 1 and 2 —
-- every issuance since then violated the constraint. Widen it to the real range.
ALTER TABLE certificates DROP CONSTRAINT certificates_payload_version_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_payload_version_check CHECK (payload_version IN (1, 2, 3, 4));
