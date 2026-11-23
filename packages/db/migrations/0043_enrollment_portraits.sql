-- A portrait is private and belongs to one actual enrollment. Older rows remain valid without one.
CREATE TABLE enrollment_portraits (
  enrollment_id uuid PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  image_bytes bytea NOT NULL CHECK (octet_length(image_bytes) BETWEEN 1 AND 1048576),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON enrollment_portraits TO upskill_app;
