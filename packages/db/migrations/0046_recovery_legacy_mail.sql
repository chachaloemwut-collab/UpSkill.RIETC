-- Preserve outstanding links whose original recipient is independently recorded.
UPDATE password_reset_tokens AS t SET recipient_email = o.recipient_email
FROM email_outbox AS o WHERE o.deduplication_key = 'reset-password:' || t.id::text
AND o.user_id = t.user_id AND o.template_key = 'reset-password' AND t.reset_method = 'email_link'
AND t.recipient_email IS NULL AND t.used_at IS NULL AND t.expires_at > now();
