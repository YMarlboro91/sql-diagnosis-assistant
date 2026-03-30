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

-- 自定义检测规则表 (用户可配置)
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  sql_stage TEXT NOT NULL,
  severity TEXT NOT NULL,
  patterns TEXT NOT NULL,
  title TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- 诊断结果表 (技能包输出)
CREATE TABLE IF NOT EXISTS diagnosis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exception_id INTEGER REFERENCES exceptions(id) ON DELETE CASCADE,
  skill_package TEXT NOT NULL,
  diagnosis_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  details TEXT,
  suggestion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 关联诊断日志表 (用于存储 jmap/jstack/qtrace 等原始数据)
CREATE TABLE IF NOT EXISTS diagnosis_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  diagnosis_id INTEGER NOT NULL REFERENCES diagnosis(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_rules_type ON rules(exception_type);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_diagnosis_exception ON diagnosis(exception_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_skill ON diagnosis(skill_package);
CREATE INDEX IF NOT EXISTS idx_diagnosis_logs ON diagnosis_logs(diagnosis_id);
