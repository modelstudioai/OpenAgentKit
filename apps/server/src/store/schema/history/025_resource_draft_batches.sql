CREATE TABLE IF NOT EXISTS kit_resource_drafts (
  draft_id TEXT PRIMARY KEY, owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','publishing','published','failed')),
  phase TEXT NOT NULL CHECK (phase IN ('editable','executing','uncertain','succeeded')),
  resources_json TEXT NOT NULL DEFAULT '[]', cleanup_pending INTEGER NOT NULL DEFAULT 0,
  operation_id TEXT, expected_revision TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_drafts_active_owner ON kit_resource_drafts(owner)
  WHERE status != 'published' OR cleanup_pending = 1;
