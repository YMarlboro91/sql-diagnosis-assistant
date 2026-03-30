import { glob } from 'glob';
import { readFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { ParsedLogEntry, SQLLogEntry } from '../parser/LogEntry.js';
import { LogParser, MultiLineLogAggregator } from '../parser/LogParser.js';
import { QtraceParser, JmapParser, JstackParser, JstatParser, LinuxMetricsParser } from '../parser/SpecializedParsers.js';
import { QtraceEntry, JmapEntry, JstackEntry, JstatEntry, LinuxMetrics } from '../skills/SkillPackage.js';
import Database from 'better-sqlite3';

// 日志类型
export type LogType = 'sql' | 'qtrace' | 'jmap' | 'jstack' | 'jstat' | 'linux';

export interface WatchConfig {
  nodes: {
    name: string;
    type: 'server' | 'executor';
    logPath: string;
    filePattern: string;
    logType: LogType;  // 日志类型
  }[];
  scanIntervalMs: number;
  offsetFile: string;
}

// 存储解析后的专用日志条目
interface SpecializedEntry {
  queryId?: string;
  timestamp: Date;
  sourceNode: string;
  qtrace?: QtraceEntry;
  jmap?: JmapEntry;
  jstack?: JstackEntry;
  jstat?: JstatEntry;
  linux?: LinuxMetrics;
}

export class FileWatcher {
  private config: WatchConfig;
  private offsets: Map<string, number> = new Map();
  private aggregator = new MultiLineLogAggregator();
  private parser = new LogParser();

  // 专用日志解析器
  private qtraceParser = new QtraceParser();
  private jmapParser = new JmapParser();
  private jstackParser = new JstackParser();
  private jstatParser = new JstatParser();
  private linuxParser = new LinuxMetricsParser();

  // 存储解析后的专用日志（用于关联）
  private specializedEntries: SpecializedEntry[] = [];

  private db: Database.Database;

  constructor(config: WatchConfig, db: Database.Database) {
    this.config = config;
    this.db = db;
    this.loadOffsets();
  }

  private loadOffsets() {
    try {
      if (existsSync(this.config.offsetFile)) {
        const data = JSON.parse(readFileSync(this.config.offsetFile, 'utf-8'));
        this.offsets = new Map(Object.entries(data));
      }
    } catch (e) {
      console.warn('Failed to load offsets, starting fresh');
    }
  }

  private saveOffsets() {
    const data = Object.fromEntries(this.offsets);
    const dir = dirname(this.config.offsetFile);
    if (!existsSync(dir)) {
      import('fs').then(fs => fs.mkdirSync(dir, { recursive: true }));
    }
    import('fs').then(fs => fs.writeFileSync(this.config.offsetFile, JSON.stringify(data)));
  }

  /**
   * 扫描所有配置的日志目录
   */
  async scan(): Promise<SQLLogEntry[]> {
    const allEntries: SQLLogEntry[] = [];

    for (const node of this.config.nodes) {
      try {
        if (node.logType === 'sql') {
          const entries = await this.scanNode(node);
          allEntries.push(...entries);
        } else {
          // 扫描专用日志（qtrace, jmap, jstack, etc.）
          await this.scanSpecializedLog(node);
        }
      } catch (e) {
        console.error(`Error scanning node ${node.name}:`, e);
      }
    }

    // 保存扫描位置
    this.saveOffsets();

    return allEntries;
  }

  private async scanNode(node: WatchConfig['nodes'][0]): Promise<SQLLogEntry[]> {
    const pattern = join(node.logPath, node.filePattern);
    const files = await glob(pattern);

    const entries: SQLLogEntry[] = [];

    for (const file of files) {
      try {
        const fileEntries = await this.scanFile(file, node);
        entries.push(...fileEntries);
      } catch (e) {
        console.error(`Error scanning file ${file}:`, e);
      }
    }

    return entries;
  }

  private async scanFile(filePath: string, node: WatchConfig['nodes'][0]): Promise<SQLLogEntry[]> {
    const stat = statSync(filePath);
    const lastOffset = this.offsets.get(filePath) ?? 0;

    // 文件还没轮转，从上次位置继续读
    // 文件被轮转了（变小了），从头开始读
    if (stat.size < lastOffset) {
      this.offsets.set(filePath, 0);
    }

    const entries: SQLLogEntry[] = [];
    let content = '';

    if (stat.size > lastOffset) {
      // 读取新增内容
      const fd = await this.openFile(filePath);
      try {
        content = await this.readFromOffset(fd, lastOffset, stat.size - lastOffset);
      } finally {
        await this.closeFile(fd);
      }

      // 解析日志
      const newEntries = this.aggregator.aggregate(content);

      for (const entry of newEntries) {
        const sqlEntry = this.parser.extractSQLInfo(entry);
        sqlEntry.sourceNode = node.name;
        entries.push(sqlEntry);
      }

      // 更新偏移量
      this.offsets.set(filePath, stat.size);
    }

    return entries;
  }

  /**
   * 扫描专用日志文件
   */
  private async scanSpecializedLog(node: WatchConfig['nodes'][0]): Promise<void> {
    const pattern = join(node.logPath, node.filePattern);
    const files = await glob(pattern);

    for (const file of files) {
      try {
        const stat = statSync(file);
        const lastOffset = this.offsets.get(file) ?? 0;

        // 文件被轮转了，从头开始读
        if (stat.size < lastOffset) {
          this.offsets.set(file, 0);
        }

        if (stat.size > lastOffset) {
          // 读取新增内容
          const fd = await this.openFile(file);
          let content = '';
          try {
            content = await this.readFromOffset(fd, lastOffset, stat.size - lastOffset);
          } finally {
            await this.closeFile(fd);
          }

          // 解析专用日志
          const entry = this.parseSpecializedLog(content, node.logType, node.name);

          if (entry) {
            this.specializedEntries.push(entry);
          }

          // 更新偏移量
          this.offsets.set(file, stat.size);
        }
      } catch (e) {
        console.error(`Error scanning specialized log ${file}:`, e);
      }
    }

    // 限制内存中的专用日志数量
    if (this.specializedEntries.length > 10000) {
      this.specializedEntries = this.specializedEntries.slice(-5000);
    }
  }

  /**
   * 解析专用日志内容
   */
  private parseSpecializedLog(content: string, logType: LogType, sourceNode: string): SpecializedEntry | null {
    const entry: SpecializedEntry = {
      timestamp: new Date(),
      sourceNode
    };

    try {
      switch (logType) {
        case 'qtrace':
          entry.qtrace = this.qtraceParser.parse(content) || undefined;
          if (entry.qtrace) {
            entry.queryId = entry.qtrace.queryId;
            entry.timestamp = entry.qtrace.startTime;
          }
          break;

        case 'jmap':
          entry.jmap = this.jmapParser.parse(content);
          break;

        case 'jstack':
          entry.jstack = this.jstackParser.parse(content);
          break;

        case 'jstat':
          entry.jstat = this.jstatParser.parse(content);
          break;

        case 'linux':
          // Linux指标可能有多种类型，需要根据文件名判断
          if (content.includes('%user') || content.includes('CPU')) {
            entry.linux = this.linuxParser.parse(content, 'cpu');
          } else if (content.includes('Mem:') || content.includes('Swap:')) {
            entry.linux = this.linuxParser.parse(content, 'memory');
          } else if (content.includes('Device:') || content.includes('avgqu-sz')) {
            entry.linux = this.linuxParser.parse(content, 'disk');
          } else if (content.includes('IFACE') || content.includes('rxby') || content.includes('txby')) {
            entry.linux = this.linuxParser.parse(content, 'network');
          } else {
            // 默认尝试CPU解析
            entry.linux = this.linuxParser.parse(content, 'cpu');
          }
          break;

        default:
          return null;
      }

      return entry;
    } catch (e) {
      console.error(`Failed to parse ${logType} log:`, e);
      return null;
    }
  }

  /**
   * 根据 queryId 获取关联的专用日志
   */
  getSpecializedEntriesForQuery(queryId: string): {
    qtrace?: QtraceEntry;
    jmap?: JmapEntry;
    jstack?: JstackEntry;
    jstat?: JstatEntry;
    linux?: LinuxMetrics[];
  } {
    const result: {
      qtrace?: QtraceEntry;
      jmap?: JmapEntry;
      jstack?: JstackEntry;
      jstat?: JstatEntry;
      linux?: LinuxMetrics[];
    } = {
      linux: []
    };

    for (const entry of this.specializedEntries) {
      if (entry.queryId === queryId) {
        if (entry.qtrace) result.qtrace = entry.qtrace;
        if (entry.jmap) result.jmap = entry.jmap;
        if (entry.jstack) result.jstack = entry.jstack;
        if (entry.jstat) result.jstat = entry.jstat;
      }
      if (entry.linux) result.linux!.push(entry.linux);
    }

    return result;
  }

  /**
   * 获取最近的专用日志条目
   */
  getRecentSpecializedEntries(count: number = 100): SpecializedEntry[] {
    return this.specializedEntries.slice(-count);
  }

  private openFile(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      import('fs').then(fs => {
        fs.open(filePath, 'r', (err, fd) => {
          if (err) reject(err);
          else resolve(fd);
        });
      });
    });
  }

  private readFromOffset(fd: number, offset: number, length: number): Promise<string> {
    return new Promise((resolve, reject) => {
      import('fs').then(fs => {
        const buffer = Buffer.alloc(length);
        fs.read(fd, buffer, 0, length, offset, (err, bytesRead) => {
          if (err) reject(err);
          else resolve(buffer.toString('utf-8', 0, bytesRead));
        });
      });
    });
  }

  private closeFile(fd: number): Promise<void> {
    return new Promise((resolve, reject) => {
      import('fs').then(fs => {
        fs.close(fd, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * 获取配置
   */
  getConfig(): WatchConfig {
    return this.config;
  }
}
