-- 兼容已应用 005 的数据库；只迁移能由历史挂载索引确定唯一 subject 的文件。
WITH legacy_attachments AS (
  SELECT s.subject_id, s.created_at,
    CASE WHEN f.type = 'object' THEN json_extract(f.value, '$.file_id') END AS file_id,
    CASE WHEN f.type = 'object' THEN json_type(f.value, '$.file_id') END AS file_id_type
  FROM kit_sessions AS s, json_each(
    CASE WHEN json_valid(s.files_json)
      THEN CASE WHEN json_type(s.files_json) = 'array' THEN s.files_json ELSE '[]' END
      ELSE '[]' END
  ) AS f
)
INSERT OR IGNORE INTO kit_uploaded_files (file_id, subject_id, created_at)
SELECT file_id, MIN(subject_id), MIN(created_at)
FROM legacy_attachments
WHERE file_id_type = 'text' AND length(trim(file_id)) > 0
GROUP BY file_id
HAVING COUNT(DISTINCT subject_id) = 1;
