-- 启用逐日账前已采集的历史基线没有逐日归属；一次性按最后采集日入账，
-- 基线之后的增量仍由 observe 逐日追加，不与回填重复。
INSERT INTO kit_usage_limit_days (member_id, day, tokens, active_seconds)
SELECT member_id, substr(captured_at, 1, 10) AS day,
       CAST(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS INTEGER) AS tokens,
       SUM(COALESCE(active_seconds, 0)) AS active_seconds
FROM kit_usage_limit_sessions
WHERE captured_at IS NOT NULL AND admission_month IS NOT NULL
GROUP BY member_id, substr(captured_at, 1, 10)
ON CONFLICT(member_id, day) DO UPDATE SET tokens = excluded.tokens, active_seconds = excluded.active_seconds;
