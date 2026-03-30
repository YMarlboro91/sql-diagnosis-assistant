import { SQLLogEntry, AssociatedLog } from '../parser/LogEntry.js';

/**
 * 日志关联器
 * 根据 Query ID / SessionHandle 关联 server 和 executor 的日志
 */
export class LogAssociator {

  /**
   * 关联日志
   * @param queryId Query ID
   * @param allLogs 所有日志
   */
  associate(queryId: string, allLogs: SQLLogEntry[]): {
    serverLogs: SQLLogEntry[];
    executorLogs: SQLLogEntry[];
    timeline: SQLLogEntry[];
  } {
    // 筛选出包含该 queryId 的日志
    const matched = allLogs.filter(log =>
      (log.queryId === queryId) ||
      (log.sessionHandle && log.sessionHandle === queryId) ||
      log.message.includes(queryId)
    );

    // 按节点类型分组
    const serverLogs = matched.filter(log =>
      log.sourceNode?.includes('server') ||
      !log.sourceNode  // 默认归为 server
    );

    const executorLogs = matched.filter(log =>
      log.sourceNode?.includes('executor')
    );

    // 按时间排序生成时间线
    const timeline = [...matched].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    return { serverLogs, executorLogs, timeline };
  }

  /**
   * 将日志列表转换为关联日志格式
   */
  toAssociatedLogs(
    logs: SQLLogEntry[],
    exceptionId: number,
    source: 'server' | 'executor'
  ): AssociatedLog[] {
    return logs.map(log => ({
      exceptionId,
      timestamp: log.timestamp,
      level: log.level,
      logger: log.logger,
      message: log.message,
      thread: log.thread,
      source
    }));
  }

  /**
   * 按时间范围筛选日志
   */
  filterByTimeRange(
    logs: SQLLogEntry[],
    start: Date,
    end: Date
  ): SQLLogEntry[] {
    return logs.filter(log =>
      log.timestamp >= start && log.timestamp <= end
    );
  }

  /**
   * 查找相邻 Query ID 的日志（用于关联相关的 SQL）
   */
  findRelatedQueryIds(
    queryId: string,
    allLogs: SQLLogEntry[],
    windowMs: number = 60000 // 默认前后 1 分钟
  ): string[] {
    const targetLog = allLogs.find(log =>
      log.queryId === queryId ||
      log.message.includes(queryId)
    );

    if (!targetLog) return [];

    const startTime = new Date(targetLog.timestamp.getTime() - windowMs);
    const endTime = new Date(targetLog.timestamp.getTime() + windowMs);

    const related = allLogs
      .filter(log =>
        log.timestamp >= startTime &&
        log.timestamp <= endTime &&
        log.queryId &&
        log.queryId !== queryId
      )
      .map(log => log.queryId!);

    return [...new Set(related)];
  }
}
