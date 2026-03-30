-- 异常记录表
CREATE TABLE IF NOT EXISTS exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_id TEXT,
  session_handle TEXT,
  sql_text TEXT,
  exception_type TEXT NOT NULL,
  sql_stage TEXT NOT NULL DEFAULT 'UNKNOWN',
  error_message TEXT,
  severity TEXT NOT NULL,
  suggestion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_file TEXT,
  source_node TEXT,
  UNIQUE(query_id, exception_type, created_at)
);

-- 关联日志表
CREATE TABLE IF NOT EXISTS associated_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exception_id INTEGER NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
  log_level TEXT,
  logger TEXT,
  message TEXT,
  thread TEXT,
  source TEXT NOT NULL,
  timestamp DATETIME NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_exceptions_type ON exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_exceptions_stage ON exceptions(sql_stage);
CREATE INDEX IF NOT EXISTS idx_exceptions_created ON exceptions(created_at);
CREATE INDEX IF NOT EXISTS idx_exceptions_query ON exceptions(query_id);
CREATE INDEX IF NOT EXISTS idx_logs_exception ON associated_logs(exception_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON associated_logs(timestamp);
