CREATE TABLE kit_member_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_member_sessions_member ON kit_member_sessions(member_id);
CREATE INDEX idx_member_sessions_expiry ON kit_member_sessions(expires_at);
CREATE TABLE kit_uploaded_files (
  file_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_uploaded_files_subject ON kit_uploaded_files(subject_id);
