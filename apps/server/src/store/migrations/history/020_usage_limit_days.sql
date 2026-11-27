-- 广场「每日用量」的逐日增量账；与成员月账同事务双写，归因到采集确认日。
CREATE TABLE kit_usage_limit_days (
  member_id TEXT NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY (member_id, day)
);
