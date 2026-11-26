-- Identity verified by the registrar and the learner's completion of the handover.
-- This does not assert that the learner owns their primary mailbox.
ALTER TABLE users ADD COLUMN registrar_recovered_at timestamptz;
CREATE INDEX recovery_cases_target ON recovery_cases(target_user_id) WHERE target_user_id IS NOT NULL;
