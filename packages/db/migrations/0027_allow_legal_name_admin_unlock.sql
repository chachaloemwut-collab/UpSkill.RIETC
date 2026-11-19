-- A02: allow admin to unlock the legal name (set legal_name_locked_at = NULL).
-- Previously the trigger also blocked changes to legal_name_locked_at itself,
-- making adminUnlockLegalName impossible without a raw SQL bypass.
-- Name field changes are still blocked while the name is locked.
CREATE OR REPLACE FUNCTION guard_legal_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.legal_name_locked_at IS NOT NULL AND (
       NEW.legal_full_name_th IS DISTINCT FROM OLD.legal_full_name_th OR
       NEW.legal_full_name_en IS DISTINCT FROM OLD.legal_full_name_en) THEN
    RAISE EXCEPTION 'legal name is locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
