-- PDPA right to erasure: soft-delete. A deleted account keeps its audit trail and issued
-- certificates (needed for verification) but can no longer be identified or signed into.
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_users_deleted ON users (deleted_at) WHERE deleted_at IS NOT NULL;
