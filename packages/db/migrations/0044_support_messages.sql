CREATE TABLE support_messages (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 member_id uuid NOT NULL REFERENCES users(id),
 author_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL,
 body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (author_id, request_id)
);
CREATE INDEX support_messages_thread ON support_messages(member_id, id DESC);
GRANT SELECT, INSERT, DELETE ON support_messages TO upskill_app;
