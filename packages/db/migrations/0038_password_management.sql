-- 0038_password_management.sql — additive; works with the app version that is running now
-- (it never reads must_change_password and only inserts the two original reset methods)
--
-- must_change_password: set when an admin gives a user a temporary password. Login then
--   issues a short-lived 'forced_change' token instead of a session, so the user must pick
--   their own password before doing anything else. Cleared by resetPassword.
-- reset_method:
--   admin_link    — a reset link an admin created to hand over directly (no email involved)
--   forced_change — the token issued at login for a must_change_password account

ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_reset_method_check;
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_reset_method_check
  CHECK (reset_method IN ('email_link', 'google_reauth', 'admin_link', 'forced_change'));

-- Admin user page: recent reset activity per user
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created ON password_reset_tokens (user_id, created_at DESC);
