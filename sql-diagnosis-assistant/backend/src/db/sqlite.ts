import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ExceptionRecord, AssociatedLog, ExceptionStats } from '../parser/LogEntry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string = './data/diagnosis.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schema);
  }

  /**
   * 保存异常记录
   */
  saveException(exception: ExceptionRecord): number {
    const stmt = this.db.prepare(`
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
    const stmt = this.db.prepare(`
      INSERT INTO associated_logs (
        exception_id, log_level, logger, message, thread, source, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((logs: AssociatedLog[]) => {
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

    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM exceptions WHERE ${whereClause}`);
    const total = (countStmt.get(...params) as { count: number }).count;

    const offset = (page - 1) * limit;
    const dataStmt = this.db.prepare(`
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
    const stmt = this.db.prepare('SELECT * FROM exceptions WHERE id = ?');
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
    const stmt = this.db.prepare(`
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

    const stmt = this.db.prepare(`
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
    const stmt = this.db.prepare(`
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

  /**
   * 关闭数据库
   */
  close() {
    this.db.close();
  }
}
