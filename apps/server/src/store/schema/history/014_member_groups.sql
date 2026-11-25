CREATE TABLE kit_groups (
  group_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
  revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_groups_created ON kit_groups(created_at, group_id);
CREATE TABLE kit_group_members (
  group_id TEXT NOT NULL REFERENCES kit_groups(group_id),
  member_id TEXT NOT NULL REFERENCES kit_members(member_id),
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX idx_group_members_member ON kit_group_members(member_id, group_id);
