import Fastify from 'fastify';
import cors from '@fastify/cors';
import { mkdirSync, existsSync } from 'fs';
import { DatabaseManager } from './db/sqlite.js';
import { setupRoutes } from './api/routes.js';
import { setupRulesRoutes } from './api/rules.js';
import { WatchConfig, FileWatcher } from './watcher/FileWatcher.js';
import { ExceptionDetector } from './detector/ExceptionDetector.js';
import { LogAssociator } from './associator/LogAssociator.js';
import { SQLLogEntry, AssociatedLog } from './parser/LogEntry.js';

// 配置
const CONFIG: WatchConfig = {
  scanIntervalMs: 30000, // 30秒扫描一次
  offsetFile: './data/scan_offsets.json',
  nodes: [
    {
      name: 'quark-server',
      type: 'server',
      logPath: '/home/yoking/sql-diagnosis-assistant/logexample',
      filePattern: 'quark-server.log',
      logType: 'sql'
    }
  ]
};

async function main() {
  // 确保数据目录存在
  if (!existsSync('./data')) {
    mkdirSync('./data', { recursive: true });
  }

  // 初始化数据库
  const db = new DatabaseManager('./data/diagnosis.db');
  console.log('Database initialized');

  // 初始化服务
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: true });

  // 设置路由
  await setupRoutes(fastify, db);
  await setupRulesRoutes(fastify, db);

  // 初始化文件监控
  const watcher = new FileWatcher(CONFIG, db.db);
  const detector = new ExceptionDetector();
  const associator = new LogAssociator();

  // 存储所有解析的日志（用于关联）
  const allLogs: SQLLogEntry[] = [];

  // 定期扫描任务
  async function scanTask() {
    try {
      console.log('Starting scan...');
      const entries = await watcher.scan();

      console.log(`Found ${entries.length} new log entries`);

      for (const entry of entries) {
        // 检测异常
        const exception = detector.detectException(entry);

        if (exception) {
          // 检查是否已存在
          if (db.existsException(exception.queryId || '', exception.exceptionType, exception.createdAt)) {
            console.log(`Exception already exists: ${exception.queryId} ${exception.exceptionType}`);
          } else {
            // 保存异常
            const exceptionId = db.saveException(exception);

            // 关联日志 - 使用当前已知的所有日志
            const { serverLogs, executorLogs } = associator.associate(
              entry.queryId || '',
              allLogs
            );

            // 保存关联日志
            const serverAssociated = associator.toAssociatedLogs(serverLogs, exceptionId, 'server');
            const executorAssociated = associator.toAssociatedLogs(executorLogs, exceptionId, 'executor');

            db.saveAssociatedLogs([...serverAssociated, ...executorAssociated]);

            console.log(`Detected exception: ${exception.exceptionType} for query ${entry.queryId}`);
          }
        }

        // 添加到全局日志列表
        allLogs.push(entry);

        // 限制内存中的日志数量
        if (allLogs.length > 100000) {
          allLogs.splice(0, 50000);
        }
      }
    } catch (e) {
      console.error('Scan error:', e);
    }
  }

  // 启动定期扫描
  const scanInterval = setInterval(scanTask, CONFIG.scanIntervalMs);

  // 初始扫描
  await scanTask();

  // 启动服务器
  try {
    await fastify.listen(3000, '0.0.0.0');
    console.log('Server listening on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async () => {
    console.log('Shutting down...');
    clearInterval(scanInterval);
    await fastify.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
