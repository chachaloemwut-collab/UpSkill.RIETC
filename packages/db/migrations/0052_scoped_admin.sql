-- Restrict an existing admin only after an explicit decision by the protected owner.
-- Removing the last assignment must never restore organization-wide access.
ALTER TABLE users ADD COLUMN scoped_management boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD CONSTRAINT owner_keeps_management_access CHECK (NOT (is_system_owner AND scoped_management));
