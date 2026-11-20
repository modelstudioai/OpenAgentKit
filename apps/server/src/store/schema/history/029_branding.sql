-- 员工端品牌由管理端维护；单行表保证读取稳定，首次启动种入默认产品名。
CREATE TABLE IF NOT EXISTS kit_branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  product_name TEXT NOT NULL,
  logo_url TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
INSERT OR IGNORE INTO kit_branding (id, product_name, updated_at) VALUES (1, 'OpenAgentPack Kit', '2026-11-13T00:00:00.000Z');
