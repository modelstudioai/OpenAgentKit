-- 旧条目的创建/更新时间不能证明上架时间，保留 NULL，等待下次实际上架时记录。
ALTER TABLE catalog_agents ADD COLUMN listed_at TEXT;
