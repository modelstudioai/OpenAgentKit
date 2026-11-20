ALTER TABLE kit_resource_drafts ADD COLUMN engine TEXT NOT NULL DEFAULT 'directory';
CREATE TABLE kit_resource_draft_documents (
  draft_id TEXT PRIMARY KEY REFERENCES kit_resource_drafts(draft_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1,
  yaml TEXT NOT NULL,
  assets_json TEXT NOT NULL DEFAULT '[]',
  sdk_state_json TEXT NOT NULL DEFAULT '{"resources":[]}',
  proof_json TEXT
);
