CREATE TABLE kit_template_listings (
  template_id TEXT PRIMARY KEY REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL UNIQUE REFERENCES catalog_agents(id) ON DELETE CASCADE
);
