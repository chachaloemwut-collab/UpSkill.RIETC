ALTER TABLE recovery_cases ADD COLUMN related_user_id uuid REFERENCES users(id),
 ADD COLUMN record_comparison jsonb;
ALTER TABLE recovery_cases ADD CHECK (related_user_id IS NULL OR related_user_id <> target_user_id);
-- During a rolling release older writers can still queue valid reset messages.
CREATE FUNCTION record_reset_recipient() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.template_key = 'reset-password' AND NEW.deduplication_key LIKE 'reset-password:%' THEN
  UPDATE password_reset_tokens SET recipient_email = NEW.recipient_email WHERE user_id=NEW.user_id
  AND id::text=substring(NEW.deduplication_key from 16) AND recipient_email IS NULL AND reset_method='email_link';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER capture_reset_recipient AFTER INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION record_reset_recipient();
