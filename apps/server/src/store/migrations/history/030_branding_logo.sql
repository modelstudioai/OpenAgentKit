-- 上传的 Logo 存二进制与 contentType，公开读取走 /api/branding/logo；与外部 URL 二选一。
CREATE TABLE IF NOT EXISTS kit_branding_logo (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
