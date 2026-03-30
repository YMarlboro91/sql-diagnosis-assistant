import { SkillPackage, DiagnosisContext, DiagnosisResult } from './SkillPackage.js';
import { ExceptionRecord, Severity } from '../parser/LogEntry.js';
import { matchExceptionType, DETECTION_RULES } from '../detector/rules.js';

/**
 * 日志诊断技能包
 * 基于日志中的 exception/error 关键字进行诊断
 */
export class LogSkill implements SkillPackage {
  name = 'log';
  displayName = '日志诊断';
  supportedLogTypes = ['*.log', 'executor*.log', 'server*.log'];
  priority = 100;  // 高优先级，因为最通用

  analyze(context: DiagnosisContext): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    const { exception, logs } = context;

    // 诊断1: 基于异常类型给出诊断
    const exceptionDiagnosis = this.diagnoseException(exception);
    if (exceptionDiagnosis) {
      results.push(exceptionDiagnosis);
    }

    // 诊断2: 分析相关日志寻找更多线索
    const relatedLogs = logs.filter(log =>
      log.queryId === context.queryId ||
      log.message.includes(context.queryId)
    );

    // 分析ERROR级别日志的集中度
    const errorLogs = relatedLogs.filter(log => log.level === 'ERROR');
    if (errorLogs.length > 5) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'error_density',
        severity: 'MEDIUM',
        title: '错误日志密度过高',
        description: `在相关日志中发现 ${errorLogs.length} 条 ERROR 级别日志`,
        details: {
          errorCount: errorLogs.length,
          sampleMessages: errorLogs.slice(0, 3).map(l => l.message)
        },
        suggestion: '建议检查最近的代码变更或数据异常，可能是批量失败的前兆'
      });
    }

    // 诊断3: 检查是否有内存相关错误
    const memoryErrors = relatedLogs.filter(log =>
      /OutOfMemory|heap space|GC overhead|memory/i.test(log.message)
    );
    if (memoryErrors.length > 0) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'memory',
        severity: 'HIGH',
        title: '检测到内存相关错误',
        description: `发现 ${memoryErrors.length} 条内存相关错误日志`,
        details: {
          errorCount: memoryErrors.length,
          sampleMessages: memoryErrors.slice(0, 2).map(l => l.message)
        },
        suggestion: '建议：1) 检查JVM堆内存配置 2) 分析是否存在内存泄漏 3) 考虑增加堆内存大小 4) 使用 jmap 分析堆内存使用'
      });
    }

    // 诊断4: 检查锁和并发问题
    const lockErrors = relatedLogs.filter(log =>
      /Deadlock|Lock wait|lock|concurrent/i.test(log.message)
    );
    if (lockErrors.length > 0) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'concurrency',
        severity: 'HIGH',
        title: '检测到锁/并发相关错误',
        description: `发现 ${lockErrors.length} 条锁相关错误日志`,
        details: {
          errorCount: lockErrors.length,
          sampleMessages: lockErrors.slice(0, 2).map(l => l.message)
        },
        suggestion: '建议：1) 检查事务顺序 2) 减少锁粒度 3) 使用 jstack 分析线程状态 4) 考虑乐观锁替代悲观锁'
      });
    }

    // 诊断5: 检查超时问题
    const timeoutErrors = relatedLogs.filter(log =>
      /timeout|timed out|exceeded/i.test(log.message)
    );
    if (timeoutErrors.length > 0) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'timeout',
        severity: 'MEDIUM',
        title: '检测到超时错误',
        description: `发现 ${timeoutErrors.length} 条超时相关日志`,
        details: {
          errorCount: timeoutErrors.length
        },
        suggestion: '建议：1) 增加超时时间配置 2) 优化查询性能 3) 检查网络状况 4) 分析数据量是否过大'
      });
    }

    return results;
  }

  canAnalyze(context: DiagnosisContext): boolean {
    // 日志诊断总是可以执行
    return true;
  }

  private diagnoseException(exception: ExceptionRecord): DiagnosisResult | null {
    // 使用已有的规则匹配来增强诊断
    const rule = matchExceptionType(exception.errorMessage);

    if (rule) {
      return {
        skillPackage: this.name,
        diagnosisType: 'exception_match',
        severity: rule.severity,
        title: `匹配规则: ${rule.title}`,
        description: exception.errorMessage,
        details: {
          exceptionType: exception.exceptionType,
          sqlStage: exception.sqlStage,
          matchedRule: rule.title
        },
        suggestion: rule.suggestion
      };
    }

    // 默认诊断
    return {
      skillPackage: this.name,
      diagnosisType: 'unknown_exception',
      severity: exception.severity,
      title: this.getExceptionTitle(exception.exceptionType),
      description: exception.errorMessage,
      suggestion: '建议收集以下信息进行进一步诊断：1) jstack 线程堆栈 2) jmap 堆内存快照 3) jstat GC 统计 4) 相关日志上下文'
    };
  }

  private getExceptionTitle(exceptionType: string): string {
    const titles: Record<string, string> = {
      'SUBMISSION_ERROR': '查询提交错误',
      'QUEUE_FULL': '队列满',
      'CONNECTION_ERROR': '连接错误',
      'AUTH_ERROR': '认证失败',
      'SESSION_ERROR': '会话错误',
      'SYNTAX_ERROR': '语法错误',
      'SEMANTIC_ERROR': '语义错误',
      'PERMISSION_DENIED': '权限不足',
      'TYPE_ERROR': '类型错误',
      'LOGICAL_PLAN_ERROR': '逻辑计划错误',
      'LOGICAL_OPT_SKIP': '逻辑优化跳过',
      'LOGICAL_OPT_ERROR': '逻辑优化错误',
      'PHYSICAL_PLAN_ERROR': '物理计划错误',
      'RESOURCE_LIMIT': '资源限制',
      'PHYSICAL_OPT_SKIP': '物理优化跳过',
      'PHYSICAL_OPT_ERROR': '物理优化错误',
      'EXECUTION_ERROR': '执行错误',
      'LOCK_TIMEOUT': '锁等待超时',
      'DEADLOCK': '死锁',
      'MEMORY_EXCEEDED': '内存超限',
      'TASK_TIMEOUT': '任务超时',
      'MR_JOB_ERROR': 'MapReduce错误',
      'DATA_ACCESS_ERROR': '数据访问错误',
      'IO_ERROR': 'IO错误',
      'TYPE_MISMATCH': '类型不匹配',
      'RESULT_ERROR': '结果返回错误',
      'UNKNOWN': '未知错误'
    };
    return titles[exceptionType] || exceptionType;
  }
}
