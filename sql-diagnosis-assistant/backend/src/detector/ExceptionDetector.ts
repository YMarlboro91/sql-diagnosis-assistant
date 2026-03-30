import { SQLLogEntry, ExceptionRecord, SQLStage } from '../parser/LogEntry.js';
import { matchExceptionType, DetectionRule, DETECTION_RULES } from './rules.js';

/**
 * 异常检测器
 * 从 SQL 日志中检测异常类型及对应的 SQL 生命周期阶段
 */
export class ExceptionDetector {

  /**
   * 检测单条日志是否包含异常
   */
  detectException(entry: SQLLogEntry): ExceptionRecord | null {
    // 只处理 ERROR 和 WARN 级别
    if (entry.level !== 'ERROR' && entry.level !== 'WARN') {
      return null;
    }

    // 尝试匹配异常规则
    const rule = matchExceptionType(entry.message);

    if (rule) {
      return {
        queryId: entry.queryId,
        sessionHandle: entry.sessionHandle,
        sqlText: entry.sqlText,
        exceptionType: rule.type,
        sqlStage: rule.stage,
        errorMessage: this.extractErrorMessage(entry.message),
        severity: rule.severity,
        suggestion: rule.suggestion,
        createdAt: entry.timestamp,
        sourceNode: entry.sourceNode
      };
    }

    // 没有匹配到规则，检查是否是 ERROR 级别的失败
    if (entry.level === 'ERROR') {
      return {
        queryId: entry.queryId,
        sessionHandle: entry.sessionHandle,
        sqlText: entry.sqlText,
        exceptionType: 'UNKNOWN',
        sqlStage: 'UNKNOWN',
        errorMessage: this.extractErrorMessage(entry.message),
        severity: 'MEDIUM',
        suggestion: '查看详细日志定位问题',
        createdAt: entry.timestamp,
        sourceNode: entry.sourceNode
      };
    }

    return null;
  }

  /**
   * 从错误消息中提取核心错误信息
   */
  private extractErrorMessage(message: string): string {
    // 移除堆栈信息，只保留第一行错误
    const firstLine = message.split('\n')[0];

    // 如果是 FAILED: 开头的错误
    const failedMatch = firstLine.match(/^FAILED:\s*(.+)/i);
    if (failedMatch) {
      return failedMatch[1];
    }

    // 截断过长的消息
    if (firstLine.length > 500) {
      return firstLine.substring(0, 500) + '...';
    }

    return firstLine;
  }

  /**
   * 获取异常类型对应的阶段
   */
  getStageForException(type: string): SQLStage {
    const rule = DETECTION_RULES.find(r => r.type === type);
    return rule?.stage || 'UNKNOWN';
  }
}
