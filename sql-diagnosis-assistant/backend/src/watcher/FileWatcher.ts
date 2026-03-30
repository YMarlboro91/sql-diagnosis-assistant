import { glob } from 'glob';
import { readFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { ParsedLogEntry, SQLLogEntry } from '../parser/LogEntry.js';
import { LogParser, MultiLineLogAggregator } from '../parser/LogParser.js';
import Database from 'better-sqlite3';

export interface WatchConfig {
  nodes: {
    name: string;
    type: 'server' | 'executor';
    logPath: string;
    filePattern: string;
  }[];
  scanIntervalMs: number;
  offsetFile: string;
}

export class FileWatcher {
  private config: WatchConfig;
  private offsets: Map<string, number> = new Map();
  private aggregator = new MultiLineLogAggregator();
  private parser = new LogParser();
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
        const entries = await this.scanNode(node);
        allEntries.push(...entries);
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
