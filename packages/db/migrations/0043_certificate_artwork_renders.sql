-- Rendering metadata is separate from the immutable signed certificate.
CREATE TABLE certificate_artwork_renders (
  certificate_id uuid PRIMARY KEY REFERENCES certificates(id),
  revision text NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON certificate_artwork_renders TO upskill_app;
GRANT SELECT ON certificate_artwork_renders TO upskill_readonly;
