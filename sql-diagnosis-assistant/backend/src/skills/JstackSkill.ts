import { SkillPackage, DiagnosisContext, DiagnosisResult, JstackEntry } from './SkillPackage.js';
import { Severity } from '../parser/LogEntry.js';

/**
 * JVM 线程诊断技能包
 * 分析 jstack 输出
 */
export class JstackSkill implements SkillPackage {
  name = 'jstack';
  displayName = 'JVM线程诊断';
  supportedLogTypes = ['jstack*.txt', 'jstack*.log', 'thread*.txt'];
  priority = 75;

  analyze(context: DiagnosisContext): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    const { jstack, exception } = context;

    if (!jstack) {
      return results;
    }

    // 诊断1: 死锁检测
    if (jstack.deadlocks && jstack.deadlocks.length > 0) {
      for (const deadlock of jstack.deadlocks) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'deadlock',
          severity: 'HIGH',
          title: '检测到死锁',
          description: `死锁涉及 ${deadlock.threads.length} 个线程`,
          details: {
            threads: deadlock.threads,
            cycles: deadlock.cycles
          },
          suggestion: '死锁需要立即处理，建议：1) 收集完整线程堆栈 2) 分析锁的获取顺序 3) 调整事务或锁的顺序'
        });
      }
    }

    // 诊断2: 线程状态分析
    const stateCounts: Record<string, number> = {};
    const waitingThreads: string[] = [];
    const blockedThreads: string[] = [];

    for (const thread of jstack.threads) {
      stateCounts[thread.state] = (stateCounts[thread.state] || 0) + 1;

      if (thread.state === 'WAITING' || thread.state === 'TIMED_WAITING') {
        waitingThreads.push(thread.threadName);
      }
      if (thread.state === 'BLOCKED') {
        blockedThreads.push(thread.threadName);
      }
    }

    // 检查BLOCKED线程过多
    if (blockedThreads.length > 10) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'thread_blocked',
        severity: 'HIGH',
        title: `阻塞线程过多 (${blockedThreads.length})`,
        description: `${blockedThreads.length} 个线程处于 BLOCKED 状态`,
        details: {
          blockedThreads: blockedThreads.slice(0, 10)
        },
        suggestion: '大量线程阻塞可能是：1) 某个线程持有锁时间过长 2) 死锁前期 3) 资源池耗尽'
      });
    }

    // 检查WAITING线程过多
    if (waitingThreads.length > 50) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'thread_waiting',
        severity: 'LOW',
        title: `等待线程过多 (${waitingThreads.length})`,
        description: `${waitingThreads.length} 个线程处于等待状态`,
        details: {
          waitingThreads: waitingThreads.slice(0, 20)
        },
        suggestion: '大量线程等待通常是正常现象（如连接池等待），但需结合上下文判断'
      });
    }

    // 诊断3: CPU高使用线程
    const highCpuThreads = jstack.threads
      .filter(t => t.cpuTime && t.cpuTime > 10000) // > 10秒CPU时间
      .sort((a, b) => (b.cpuTime || 0) - (a.cpuTime || 0))
      .slice(0, 5);

    if (highCpuThreads.length > 0) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'high_cpu_threads',
        severity: 'MEDIUM',
        title: '高CPU消耗线程',
        description: `发现 ${highCpuThreads.length} 个CPU使用较高的线程`,
        details: {
          threads: highCpuThreads.map(t => ({
            name: t.threadName,
            cpuTime: `${((t.cpuTime || 0) / 1000).toFixed(1)}s`
          }))
        },
        suggestion: '这些线程消耗了大量CPU，建议：1) 使用火焰图分析热点 2) 检查是否有无限循环 3) 优化算法复杂度'
      });
    }

    // 诊断4: 线程数量统计
    const threadCount = jstack.threads.length;
    const threadCountSeverity: Severity = threadCount > 1000 ? 'HIGH' : threadCount > 500 ? 'MEDIUM' : 'LOW';

    results.push({
      skillPackage: this.name,
      diagnosisType: 'thread_count',
      severity: threadCountSeverity,
      title: `线程数量: ${threadCount}`,
      description: 'JVM当前活跃线程统计',
      details: {
        total: threadCount,
        byState: stateCounts
      },
      suggestion: threadCount > 1000
        ? '线程数量过多(>1000)，可能存在线程泄漏或池配置不当'
        : threadCount > 500
        ? '线程数量偏多，建议关注'
        : '线程数量正常'
    });

    // 诊断5: 特定模式匹配
    // 检查是否有频繁的GC线程
    const gcThreads = jstack.threads.filter(t =>
      /GC|pool|concurrent/.test(t.threadName)
    );
    if (gcThreads.length > 0) {
      const longWaitedGc = gcThreads.filter(t => (t.waitedTime || 0) > 5000);
      if (longWaitedGc.length > 0) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'gc_pressure',
          severity: 'MEDIUM',
          title: 'GC线程等待过长',
          description: `${longWaitedGc.length} 个GC相关线程等待时间超过5秒`,
          details: {
            threads: longWaitedGc.map(t => ({
              name: t.threadName,
              waitedTime: `${((t.waitedTime || 0) / 1000).toFixed(1)}s`
            }))
          },
          suggestion: 'GC等待时间过长可能意味着：1) 堆内存不足 2) GC频繁 3) 机器负载高'
        });
      }
    }

    // 诊断6: 异常相关线程
    const exceptionThread = jstack.threads.find(t =>
      t.stackTrace && t.stackTrace.includes(exception.exceptionType)
    );
    if (exceptionThread) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'exception_thread',
        severity: 'HIGH',
        title: '找到异常相关线程',
        description: `线程 "${exceptionThread.threadName}" 的堆栈中包含异常类型 ${exception.exceptionType}`,
        details: {
          threadName: exceptionThread.threadName,
          state: exceptionThread.state,
          stackTrace: exceptionThread.stackTrace?.split('\n').slice(0, 10)
        },
        suggestion: '这是问题的直接相关线程，建议重点分析其堆栈跟踪'
      });
    }

    return results;
  }

  canAnalyze(context: DiagnosisContext): boolean {
    return context.jstack !== undefined;
  }
}
