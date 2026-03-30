import { SkillPackage, DiagnosisContext, DiagnosisResult, LinuxMetrics } from './SkillPackage.js';
import { Severity } from '../parser/LogEntry.js';

/**
 * Linux系统指标诊断技能包
 * 分析 CPU、内存、磁盘、网络指标 (sar, top, iostat)
 */
export class LinuxSkill implements SkillPackage {
  name = 'linux';
  displayName = '系统资源诊断';
  supportedLogTypes = ['sa*.dat', '*.metrics', 'cpu*.txt', 'mem*.txt', 'disk*.txt', 'net*.txt', 'iostat*.txt'];
  priority = 60;

  analyze(context: DiagnosisContext): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    const { linuxMetrics, exception } = context;

    if (!linuxMetrics) {
      return results;
    }

    // 诊断1: CPU使用率
    if (linuxMetrics.cpu) {
      const cpuDiagnoses = this.analyzeCpu(linuxMetrics.cpu);
      results.push(...cpuDiagnoses);
    }

    // 诊断2: 内存使用
    if (linuxMetrics.memory) {
      const memDiagnoses = this.analyzeMemory(linuxMetrics.memory);
      results.push(...memDiagnoses);
    }

    // 诊断3: 磁盘IO
    if (linuxMetrics.disk) {
      const diskDiagnoses = this.analyzeDisk(linuxMetrics.disk);
      results.push(...diskDiagnoses);
    }

    // 诊断4: 网络IO
    if (linuxMetrics.network) {
      const netDiagnoses = this.analyzeNetwork(linuxMetrics.network);
      results.push(...netDiagnoses);
    }

    return results;
  }

  canAnalyze(context: DiagnosisContext): boolean {
    return context.linuxMetrics !== undefined;
  }

  private analyzeCpu(cpu: LinuxMetrics['cpu']): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    if (!cpu) return results;

    // 计算总使用率
    const usedPercent = 100 - (cpu.idle || 0);
    const severity: Severity = usedPercent > 90 ? 'HIGH' : usedPercent > 70 ? 'MEDIUM' : 'LOW';

    results.push({
      skillPackage: this.name,
      diagnosisType: 'cpu_usage',
      severity,
      title: `CPU使用率 ${usedPercent.toFixed(1)}%`,
      description: `用户态: ${(cpu.user || 0).toFixed(1)}%, 系统态: ${(cpu.system || 0).toFixed(1)}%, 空闲: ${(cpu.idle || 0).toFixed(1)}%`,
      details: {
        user: cpu.user,
        system: cpu.system,
        idle: cpu.idle,
        iowait: cpu.iowait,
        steal: cpu.steal,
        loadAvg: cpu.loadAvg
      },
      suggestion: usedPercent > 90
        ? 'CPU使用率极高(>90%)，建议：1) 检查是否有进程CPU暴走 2) 增加CPU资源 3) 优化高CPU应用'
        : usedPercent > 70
        ? 'CPU使用率偏高，建议关注'
        : 'CPU使用率正常'
    });

    // IO等待诊断
    if (cpu.iowait && cpu.iowait > 30) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'cpu_iowait',
        severity: 'HIGH',
        title: `IO等待过高 (${(cpu.iowait || 0).toFixed(1)}%)`,
        description: 'CPU花费大量时间等待IO操作完成',
        details: { iowait: cpu.iowait },
        suggestion: 'IO等待过高通常意味着：1) 磁盘IO瓶颈 2) 网络IO瓶颈 3) 大量磁盘读写，建议结合iostat分析'
      });
    }

    // 负载诊断
    if (cpu.loadAvg) {
      const load1 = cpu.loadAvg[0] || 0;
      const loadSeverity: Severity = load1 > 8 ? 'HIGH' : load1 > 4 ? 'MEDIUM' : 'LOW';

      results.push({
        skillPackage: this.name,
        diagnosisType: 'load_average',
        severity: loadSeverity,
        title: `系统负载: ${load1.toFixed(2)} (1min)`,
        description: `负载均值: ${cpu.loadAvg.join('/')}`,
        details: { loadAvg: cpu.loadAvg },
        suggestion: load1 > 8
          ? '系统负载过高，建议检查运行中的进程'
          : '系统负载正常'
      });
    }

    return results;
  }

  private analyzeMemory(mem: LinuxMetrics['memory']): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    if (!mem) return results;

    const usedPercent = ((mem.used || 0) / (mem.total || 1)) * 100;
    const severity: Severity = usedPercent > 90 ? 'HIGH' : usedPercent > 70 ? 'MEDIUM' : 'LOW';

    results.push({
      skillPackage: this.name,
      diagnosisType: 'memory_usage',
      severity,
      title: `内存使用率 ${usedPercent.toFixed(1)}%`,
      description: `已用: ${this.formatBytes(mem.used)} / 总计: ${this.formatBytes(mem.total)}`,
      details: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        available: mem.available,
        buffers: mem.buffers,
        cached: mem.cached,
        swapTotal: mem.swapTotal,
        swapUsed: mem.swapUsed
      },
      suggestion: usedPercent > 90
        ? '内存使用率极高(>90%)，建议：1) 检查内存泄漏 2) 增加物理内存 3) 清理缓存'
        : usedPercent > 70
        ? '内存使用率偏高，建议关注'
        : '内存使用率正常'
    });

    // Swap使用诊断
    if (mem.swapTotal && mem.swapTotal > 0) {
      const swapPercent = ((mem.swapUsed || 0) / mem.swapTotal) * 100;
      if (swapPercent > 50) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'swap_usage',
          severity: 'HIGH',
          title: `Swap使用过多 (${swapPercent.toFixed(1)}%)`,
          description: '系统正在使用Swap，说明物理内存不足',
          details: { swapTotal: mem.swapTotal, swapUsed: mem.swapUsed },
          suggestion: 'Swap使用过多会导致性能严重下降，建议：1) 增加物理内存 2) 减少运行进程 3) 排查内存泄漏'
        });
      }
    }

    // 内存可用性（考虑buffers/cache）
    if (mem.available !== undefined) {
      const availPercent = (mem.available / (mem.total || 1)) * 100;
      if (availPercent < 10) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'memory_available_low',
          severity: 'HIGH',
          title: `可用内存过低 (${availPercent.toFixed(1)}%)`,
          description: '考虑buffers/cache后，可用内存仍然不足',
          details: { available: mem.available, total: mem.total },
          suggestion: '系统内存紧张，可能影响新进程启动，建议尽快处理'
        });
      }
    }

    return results;
  }

  private analyzeDisk(disk: LinuxMetrics['disk']): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    if (!disk) return results;

    // IO利用率
    if (disk.util !== undefined) {
      const severity: Severity = disk.util > 90 ? 'HIGH' : disk.util > 70 ? 'MEDIUM' : 'LOW';

      results.push({
        skillPackage: this.name,
        diagnosisType: 'disk_util',
        severity,
        title: `磁盘IO利用率 ${(disk.util || 0).toFixed(1)}%`,
        description: `设备: ${disk.device || 'unknown'}`,
        details: {
          device: disk.device,
          util: disk.util,
          await: disk.await,
          readBytes: disk.readBytes,
          writeBytes: disk.writeBytes
        },
        suggestion: disk.util > 90
          ? '磁盘IO利用率极高(>90%)，建议：1) 使用更快的存储 2) 分散IO到多盘 3) 优化IO模式'
          : disk.util > 70
          ? '磁盘IO利用率偏高，建议关注'
          : '磁盘IO利用率正常'
      });
    }

    // 等待时间
    if (disk.await !== undefined && disk.await > 50) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'disk_await',
        severity: 'MEDIUM',
        title: `IO等待时间过长 (${(disk.await || 0).toFixed(1)}ms)`,
        description: '平均每次IO的等待时间过长',
        details: { await: disk.await, readCount: disk.readCount, writeCount: disk.writeCount },
        suggestion: 'IO等待时间过长可能是：1) 磁盘性能不足 2) IO请求过于密集 3) 磁盘碎片化'
      });
    }

    return results;
  }

  private analyzeNetwork(net: LinuxMetrics['network']): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    if (!net) return results;

    // 错误诊断
    if ((net.rxErrors || 0) > 0 || (net.txErrors || 0) > 0) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'network_errors',
        severity: 'MEDIUM',
        title: '网络存在错误',
        description: `接收错误: ${net.rxErrors || 0}, 发送错误: ${net.txErrors || 0}`,
        details: {
          interface: net.interface,
          rxErrors: net.rxErrors,
          txErrors: net.txErrors,
          rxPackets: net.rxPackets,
          txPackets: net.txPackets
        },
        suggestion: '网络存在错误包，可能的原因：1) 网线/网卡问题 2) 网络拥塞 3) 硬件故障'
      });
    }

    // 流量统计
    if (net.rxBytes !== undefined && net.txBytes !== undefined) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'network_throughput',
        severity: 'LOW',
        title: '网络流量统计',
        description: `接收: ${this.formatBytes(net.rxBytes)}, 发送: ${this.formatBytes(net.txBytes)}`,
        details: {
          interface: net.interface,
          rxBytes: net.rxBytes,
          txBytes: net.txBytes
        },
        suggestion: '用于了解网络使用情况，如流量异常可进一步分析'
      });
    }

    return results;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }
}
