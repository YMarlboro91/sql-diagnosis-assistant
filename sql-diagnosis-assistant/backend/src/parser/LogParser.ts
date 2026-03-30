import { ParsedLogEntry, SQLLogEntry } from './LogEntry.js';

// Log4j 行解析正则
const LOG4J_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\s+(ERROR|WARN|INFO|DEBUG)\s+([\w.]+):\s*\[([^\]]+)\]\s*-\s*(.*)$/;

// Session/Query ID 提取 - 匹配 Session Thread,0,sql,1-1774428084043()
const SESSION_PATTERN = /Session Thread,\d+,sql,(?<queryId>\d+-\d+)/;

// 错误信息起始行模式 - FAILED: 开头
const FAILED_PATTERN = /^FAILED:\s*(.+)/i;

// 堆栈信息起始模式
const STACK_PATTERN = /^\s+at\s+[\w.$]+\([\w.java:]+\)$/;

export class LogParser {
  private buffer: string = '';

  /**
   * 解析日志内容（支持不完整的行）
   */
  parse(content: string): ParsedLogEntry[] {
    const entries: ParsedLogEntry[] = [];
    this.buffer += content;

    const lines = this.buffer.split(/\r?\n/);
    // 保留最后一行（可能是未完成的）
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        const entry = this.parseLine(line);
        if (entry) {
          entries.push(entry);
        }
      }
    }

    return entries;
  }

  /**
   * 解析单行日志
   */
  parseLine(line: string): ParsedLogEntry | null {
    const match = line.match(LOG4J_LINE_PATTERN);
    if (!match) {
      return null;
    }

    return {
      timestamp: new Date(match[1].replace(',', '.')),
      level: match[2] as ParsedLogEntry['level'],
      logger: match[3],
      thread: match[4],
      message: match[5],
      raw: line
    };
  }

  /**
   * 提取 SQL 相关信息
   */
  extractSQLInfo(entry: ParsedLogEntry): SQLLogEntry {
    const sqlEntry = entry as SQLLogEntry;

    // 从 thread 字段提取 Query ID (Session Thread 信息在 thread 字段中)
    const sessionMatch = entry.thread.match(SESSION_PATTERN);
    if (sessionMatch) {
      sqlEntry.queryId = sessionMatch.groups?.queryId;
    }

    return sqlEntry;
  }

  /**
   * 检查是否是错误堆栈的延续行
   */
  isStackLine(line: string): boolean {
    return STACK_PATTERN.test(line);
  }

  /**
   * 获取当前缓冲区中的残留内容
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * 多行日志聚合器 - 将异常信息的多行合并
 */
export class MultiLineLogAggregator {
  private currentEntry: ParsedLogEntry | null = null;
  private currentLines: string[] = [];
  private buffer: string = '';
  private parser = new LogParser();

  /**
   * 处理输入内容，返回聚合后的日志条目
   */
  aggregate(content: string): ParsedLogEntry[] {
    const entries: ParsedLogEntry[] = [];
    const lines = (this.buffer + content).split(/\r?\n/);
    this.buffer = '';

    for (const line of lines) {
      const parsed = this.parser.parseLine(line);

      if (parsed) {
        // 保存之前的聚合条目
        if (this.currentEntry && this.currentLines.length > 0) {
          this.currentEntry.message = this.currentLines.join('\n');
          entries.push(this.currentEntry);
        }
        // 开始新的条目
        this.currentEntry = parsed;
        this.currentLines = [parsed.message];
      } else if (this.currentEntry && (line.trim() || this.parser.isStackLine(line))) {
        // 多行堆栈继续
        this.currentLines.push(line);
      }
    }

    // 保留未完成的聚合
    if (this.currentEntry && this.currentLines.length > 0) {
      this.currentEntry.message = this.currentLines.join('\n');
    }

    return entries;
  }

  /**
   * 获取残留缓冲区
   */
  getBuffer(): string {
    return this.buffer + this.parser.getBuffer();
  }
}
