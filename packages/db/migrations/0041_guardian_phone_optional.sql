-- 0041_guardian_phone_optional.sql — relaxes one check; no data is changed; works with the app version running now
-- Owner decision (2026-11-22): an applicant under 20 gives only the guardian's full name and confirms the guardian's
-- permission. The guardian's phone becomes optional, so drop the rule "guardian_name and guardian_phone are both
-- set or both empty". Still enforced: a phone, when present, is a valid Thai number (user_profiles_guardian_phone_check),
-- and a guardian name always comes with guardian_consented_at (the other unnamed check).
-- The constraint was created unnamed in 0010, so find it by its definition rather than by a generated name.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'user_profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%(guardian_name IS NULL) = (guardian_phone IS NULL)%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', c);
  END IF;
END $$;
