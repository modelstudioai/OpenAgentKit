ALTER TABLE kit_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE kit_templates ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE kit_templates SET updated_at=created_at;
CREATE TABLE kit_template_versions (
  template_id TEXT NOT NULL REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0), config_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (template_id, version)
);
INSERT INTO kit_template_versions (template_id,version,config_json,created_at)
SELECT template_id,version,config_json,created_at FROM kit_templates;
