-- 会话创建时挂载的附件（file_id/mount_path）。只是「挂载映射」索引，不含文件内容。
ALTER TABLE kit_sessions ADD COLUMN files_json TEXT;
