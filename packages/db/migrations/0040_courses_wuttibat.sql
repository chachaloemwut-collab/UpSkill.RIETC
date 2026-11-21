-- 0040_courses_wuttibat.sql — course configuration only (data); works with the app version that is running now
-- Owner decision (2026-11-21): every document is a วุฒิบัตร with the standard online-training wording.
-- Issued certificates are NOT touched (signed, immutable); their PDFs are re-rendered by the worker with the
-- standard title and wording (apps/worker/src/jobs/rerender-certificates.ts).

UPDATE courses
SET credential_name_th = 'วุฒิบัตร',
    credential_achievement_th = 'ได้ผ่านการอบรมออนไลน์'
WHERE credential_name_th IS DISTINCT FROM 'วุฒิบัตร'
   OR credential_achievement_th IS DISTINCT FROM 'ได้ผ่านการอบรมออนไลน์';
