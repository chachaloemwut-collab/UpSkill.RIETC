-- I-17: Announcement targeting — scheduled broadcast time + cohort_id already present
-- scheduled_broadcast_at: when to auto-send the email (null = no schedule / send manually)
ALTER TABLE announcements ADD COLUMN scheduled_broadcast_at TIMESTAMPTZ;

-- Index for the worker that picks up due scheduled broadcasts
CREATE INDEX idx_announcements_scheduled_broadcast
  ON announcements (scheduled_broadcast_at)
  WHERE broadcast_at IS NULL AND visibility = 'published' AND scheduled_broadcast_at IS NOT NULL;
