-- 历史条目不覆盖 Agent 默认环境；只影响此后创建的体验会话。
ALTER TABLE catalog_agents ADD COLUMN remote_environment_id TEXT;
