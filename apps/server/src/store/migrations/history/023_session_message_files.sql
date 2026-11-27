-- 随消息运行时挂载的附件 ↔ 发送响应 event_ids 关联；provider 不回显，刷新后的气泡附件展示靠它。
ALTER TABLE kit_sessions ADD COLUMN message_files_json TEXT;
