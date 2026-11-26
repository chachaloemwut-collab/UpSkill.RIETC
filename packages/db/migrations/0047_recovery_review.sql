CREATE TABLE recovery_staff (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 duty text NOT NULL CHECK (duty IN ('support','registrar','approver','auditor')),
 delegated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON recovery_staff TO upskill_app;
ALTER TABLE recovery_cases ADD COLUMN target_user_id uuid REFERENCES users(id),
 ADD COLUMN proof_method text CHECK (proof_method IN ('in_person','registrar','guardian')),
 ADD COLUMN reviewed_by uuid REFERENCES users(id),
 ADD COLUMN approved_by uuid REFERENCES users(id),
 ADD COLUMN issued_until timestamptz;
ALTER TABLE recovery_cases DROP CONSTRAINT recovery_cases_status_check;
ALTER TABLE recovery_cases ADD CONSTRAINT recovery_cases_status_check CHECK
 (status IN ('open','review','waiting','approval','approved','issued','recovered','resolved','declined','cancelled','expired'));
ALTER TABLE recovery_cases ADD CONSTRAINT recovery_independent_approval CHECK
 (approved_by IS NULL OR (reviewed_by IS NOT NULL AND reviewed_by <> approved_by));
ALTER TABLE password_reset_tokens ADD COLUMN recovery_case_id uuid REFERENCES recovery_cases(id);
CREATE UNIQUE INDEX one_open_case_grant ON password_reset_tokens(recovery_case_id)
 WHERE recovery_case_id IS NOT NULL AND used_at IS NULL;
