import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ExceptionRecord, AssociatedLog, ExceptionStats, SQLStage, ExceptionType, Severity } from '../parser/LogEntry.js';

// 规则记录
export interface RuleRecord {
  id?: number;
  name: string;
  exceptionType: ExceptionType;
  sqlStage: SQLStage;
  severity: Severity;
  patterns: string[];  // JSON array of regex patterns
  title: string;
  suggestion: string;
  enabled: boolean;
  priority: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// 诊断记录
export interface DiagnosisRecord {
  id?: number;
  exceptionId: number;
  skillPackage: string;
  diagnosisType: string;
  severity: Severity;
  title: string;
  description?: string;
  details?: Record<string, any>;
  suggestion?: string;
  createdAt?: Date;
}

// 诊断日志记录
export interface DiagnosisLogRecord {
  id?: number;
  diagnosisId: number;
  logType: string;
  content: string;
  createdAt?: Date;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
  private _db: Database.Database;

  constructor(dbPath: string = './data/diagnosis.db') {
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  // 暴露数据库实例给 FileWatcher
  get db(): Database.Database {
    return this._db;
  }

  private initSchema() {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this._db.exec(schema);
  }

  /**
   * 保存异常记录
   */
  saveException(exception: ExceptionRecord): number {
    const stmt = this._db.prepare(`
      INSERT INTO exceptions (
        query_id, session_handle, sql_text, exception_type, sql_stage,
        error_message, severity, suggestion, created_at, source_file, source_node
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      exception.queryId ?? null,
      exception.sessionHandle ?? null,
      exception.sqlText ?? null,
      exception.exceptionType,
      exception.sqlStage || 'UNKNOWN',
      exception.errorMessage,
      exception.severity,
      exception.suggestion,
      exception.createdAt.toISOString(),
      exception.sourceFile ?? null,
      exception.sourceNode ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * 批量保存关联日志
   */
  saveAssociatedLogs(logs: AssociatedLog[]): void {
    const stmt = this._db.prepare(`
      INSERT INTO associated_logs (
        exception_id, log_level, logger, message, thread, source, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this._db.transaction((logs: AssociatedLog[]) => {
      for (const log of logs) {
        stmt.run(
          log.exceptionId,
          log.level,
          log.logger,
          log.message,
          log.thread,
          log.source,
          log.timestamp.toISOString()
        );
      }
    });

    insertMany(logs);
  }

  /**
   * 获取异常列表
   */
  getExceptions(options: {
    type?: string;
    severity?: string;
    search?: string;
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): { data: ExceptionRecord[]; total: number } {
    const { type, severity, search, page = 1, limit = 20, startDate, endDate } = options;

    let whereClause = '1=1';
    const params: any[] = [];

    if (type) {
      whereClause += ' AND exception_type = ?';
      params.push(type);
    }
    if (severity) {
      whereClause += ' AND severity = ?';
      params.push(severity);
    }
    if (search) {
      whereClause += ' AND (query_id LIKE ? OR error_message LIKE ? OR sql_text LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate.toISOString());
    }
    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate.toISOString());
    }

    const countStmt = this._db.prepare(`SELECT COUNT(*) as count FROM exceptions WHERE ${whereClause}`);
    const total = (countStmt.get(...params) as { count: number }).count;

    const offset = (page - 1) * limit;
    const dataStmt = this._db.prepare(`
      SELECT * FROM exceptions
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset) as any[];

    const data = rows.map(row => ({
      id: row.id,
      queryId: row.query_id,
      sessionHandle: row.session_handle,
      sqlText: row.sql_text,
      exceptionType: row.exception_type,
      sqlStage: row.sql_stage || 'UNKNOWN',
      errorMessage: row.error_message,
      severity: row.severity,
      suggestion: row.suggestion,
      createdAt: new Date(row.created_at),
      sourceFile: row.source_file,
      sourceNode: row.source_node
    }));

    return { data, total };
  }

  /**
   * 获取异常详情
   */
  getExceptionById(id: number): ExceptionRecord | null {
    const stmt = this._db.prepare('SELECT * FROM exceptions WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      queryId: row.query_id,
      sessionHandle: row.session_handle,
      sqlText: row.sql_text,
      exceptionType: row.exception_type,
      sqlStage: row.sql_stage || 'UNKNOWN',
      errorMessage: row.error_message,
      severity: row.severity,
      suggestion: row.suggestion,
      createdAt: new Date(row.created_at),
      sourceFile: row.source_file,
      sourceNode: row.source_node
    };
  }

  /**
   * 获取异常关联日志
   */
  getAssociatedLogs(exceptionId: number): { serverLogs: AssociatedLog[]; executorLogs: AssociatedLog[] } {
    const stmt = this._db.prepare(`
      SELECT * FROM associated_logs
      WHERE exception_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(exceptionId) as any[];

    const serverLogs: AssociatedLog[] = [];
    const executorLogs: AssociatedLog[] = [];

    rows.forEach(row => {
      const log: AssociatedLog = {
        id: row.id,
        exceptionId: row.exception_id,
        timestamp: new Date(row.timestamp),
        level: row.log_level,
        logger: row.logger,
        message: row.message,
        thread: row.thread,
        source: row.source as 'server' | 'executor'
      };

      if (row.source === 'server') {
        serverLogs.push(log);
      } else {
        executorLogs.push(log);
      }
    });

    return { serverLogs, executorLogs };
  }

  /**
   * 获取异常统计
   */
  getExceptionStats(options: { startDate?: Date; endDate?: Date }): ExceptionStats[] {
    const { startDate, endDate } = options;

    let whereClause = '1=1';
    const params: any[] = [];

    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate.toISOString());
    }
    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate.toISOString());
    }

    const stmt = this._db.prepare(`
      SELECT exception_type, COUNT(*) as count, severity
      FROM exceptions
      WHERE ${whereClause}
      GROUP BY exception_type, severity
      ORDER BY count DESC
    `);

    return stmt.all(...params) as ExceptionStats[];
  }

  /**
   * 检查是否已存在相同的异常
   */
  existsException(queryId: string, exceptionType: string, createdAt: Date): boolean {
    const stmt = this._db.prepare(`
      SELECT 1 FROM exceptions
      WHERE query_id = ? AND exception_type = ?
      AND created_at >= ? AND created_at < ?
    `);

    const dateStr = createdAt.toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');

    const exists = stmt.get(queryId, exceptionType, startOfDay.toISOString(), endOfDay.toISOString());
    return !!exists;
  }

  // ==================== 规则管理 ====================

  /**
   * 保存规则
   */
  saveRule(rule: RuleRecord): number {
    const stmt = this._db.prepare(`
      INSERT INTO rules (name, exception_type, sql_stage, severity, patterns, title, suggestion, enabled, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      rule.name,
      rule.exceptionType,
      rule.sqlStage,
      rule.severity,
      JSON.stringify(rule.patterns),
      rule.title,
      rule.suggestion,
      rule.enabled ? 1 : 0,
      rule.priority
    );

    return result.lastInsertRowid as number;
  }

  /**
   * 获取所有启用的规则（按优先级排序）
   */
  getEnabledRules(): RuleRecord[] {
    const stmt = this._db.prepare(`
      SELECT * FROM rules WHERE enabled = 1 ORDER BY priority DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToRule(row));
  }

  /**
   * 获取所有规则
   */
  getAllRules(): RuleRecord[] {
    const stmt = this._db.prepare(`
      SELECT * FROM rules ORDER BY priority DESC, created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToRule(row));
  }

  /**
   * 获取规则详情
   */
  getRuleById(id: number): RuleRecord | null {
    const stmt = this._db.prepare('SELECT * FROM rules WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;
    return this.rowToRule(row);
  }

  /**
   * 更新规则
   */
  updateRule(id: number, rule: Partial<RuleRecord>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (rule.name !== undefined) { fields.push('name = ?'); values.push(rule.name); }
    if (rule.exceptionType !== undefined) { fields.push('exception_type = ?'); values.push(rule.exceptionType); }
    if (rule.sqlStage !== undefined) { fields.push('sql_stage = ?'); values.push(rule.sqlStage); }
    if (rule.severity !== undefined) { fields.push('severity = ?'); values.push(rule.severity); }
    if (rule.patterns !== undefined) { fields.push('patterns = ?'); values.push(JSON.stringify(rule.patterns)); }
    if (rule.title !== undefined) { fields.push('title = ?'); values.push(rule.title); }
    if (rule.suggestion !== undefined) { fields.push('suggestion = ?'); values.push(rule.suggestion); }
    if (rule.enabled !== undefined) { fields.push('enabled = ?'); values.push(rule.enabled ? 1 : 0); }
    if (rule.priority !== undefined) { fields.push('priority = ?'); values.push(rule.priority); }

    if (fields.length === 0) return false;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this._db.prepare(`UPDATE rules SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  }

  /**
   * 删除规则
   */
  deleteRule(id: number): boolean {
    const stmt = this._db.prepare('DELETE FROM rules WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 更新规则优先级
   */
  updateRulePriorities(priorities: { id: number; priority: number }[]): void {
    const stmt = this._db.prepare('UPDATE rules SET priority = ? WHERE id = ?');
    const updateMany = this._db.transaction((priorities: { id: number; priority: number }[]) => {
      for (const p of priorities) {
        stmt.run(p.priority, p.id);
      }
    });
    updateMany(priorities);
  }

  private rowToRule(row: any): RuleRecord {
    return {
      id: row.id,
      name: row.name,
      exceptionType: row.exception_type as ExceptionType,
      sqlStage: row.sql_stage as SQLStage,
      severity: row.severity as Severity,
      patterns: JSON.parse(row.patterns || '[]'),
      title: row.title,
      suggestion: row.suggestion,
      enabled: row.enabled === 1,
      priority: row.priority,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
    };
  }

  // ==================== 诊断管理 ====================

  /**
   * 保存诊断结果
   */
  saveDiagnosis(diagnosis: DiagnosisRecord): number {
    const stmt = this._db.prepare(`
      INSERT INTO diagnosis (exception_id, skill_package, diagnosis_type, severity, title, description, details, suggestion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      diagnosis.exceptionId,
      diagnosis.skillPackage,
      diagnosis.diagnosisType,
      diagnosis.severity,
      diagnosis.title,
      diagnosis.description || null,
      diagnosis.details ? JSON.stringify(diagnosis.details) : null,
      diagnosis.suggestion || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * 获取异常的诊断结果
   */
  getDiagnoses(exceptionId: number): DiagnosisRecord[] {
    const stmt = this._db.prepare(`
      SELECT * FROM diagnosis WHERE exception_id = ? ORDER BY severity, created_at DESC
    `);

    const rows = stmt.all(exceptionId) as any[];
    return rows.map(row => this.rowToDiagnosis(row));
  }

  /**
   * 获取所有诊断结果（按技能包筛选）
   */
  getAllDiagnoses(options: { skillPackage?: string; page?: number; limit?: number }): { data: DiagnosisRecord[]; total: number } {
    const { skillPackage, page = 1, limit = 20 } = options;

    let whereClause = '1=1';
    const params: any[] = [];

    if (skillPackage) {
      whereClause += ' AND skill_package = ?';
      params.push(skillPackage);
    }

    const countStmt = this._db.prepare(`SELECT COUNT(*) as count FROM diagnosis WHERE ${whereClause}`);
    const total = (countStmt.get(...params) as { count: number }).count;

    const offset = (page - 1) * limit;
    const dataStmt = this._db.prepare(`
      SELECT * FROM diagnosis WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset) as any[];

    return {
      data: rows.map(row => this.rowToDiagnosis(row)),
      total
    };
  }

  /**
   * 保存诊断关联日志
   */
  saveDiagnosisLog(log: DiagnosisLogRecord): number {
    const stmt = this._db.prepare(`
      INSERT INTO diagnosis_logs (diagnosis_id, log_type, content) VALUES (?, ?, ?)
    `);

    const result = stmt.run(log.diagnosisId, log.logType, log.content);
    return result.lastInsertRowid as number;
  }

  /**
   * 获取诊断关联日志
   */
  getDiagnosisLogs(diagnosisId: number): DiagnosisLogRecord[] {
    const stmt = this._db.prepare('SELECT * FROM diagnosis_logs WHERE diagnosis_id = ?');
    const rows = stmt.all(diagnosisId) as any[];
    return rows.map(row => ({
      id: row.id,
      diagnosisId: row.diagnosis_id,
      logType: row.log_type,
      content: row.content,
      createdAt: row.created_at ? new Date(row.created_at) : undefined
    }));
  }

  private rowToDiagnosis(row: any): DiagnosisRecord {
    return {
      id: row.id,
      exceptionId: row.exception_id,
      skillPackage: row.skill_package,
      diagnosisType: row.diagnosis_type,
      severity: row.severity as Severity,
      title: row.title,
      description: row.description || undefined,
      details: row.details ? JSON.parse(row.details) : undefined,
      suggestion: row.suggestion || undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined
    };
  }

  /**
   * 关闭数据库
   */
  close() {
    this._db.close();
  }
}
