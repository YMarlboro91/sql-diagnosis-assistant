import { QtraceEntry, QtraceStage, JmapEntry, JmapObject, JstackEntry, JstackThread, JstackDeadlock, JstatEntry, GcUtilization, LinuxMetrics, CpuMetrics, MemoryMetrics, DiskMetrics, NetworkMetrics } from '../skills/SkillPackage.js';

/**
 * Qtrace 日志解析器
 * 解析 qtrace-*.json 格式的查询追踪日志
 */
export class QtraceParser {

  parse(content: string): QtraceEntry | null {
    try {
      const data = JSON.parse(content);

      const entry: QtraceEntry = {
        queryId: data.queryId || data.query_id || '',
        sessionId: data.sessionId || data.session_id || '',
        startTime: new Date(data.startTime || data.start_time || Date.now()),
        endTime: data.endTime ? new Date(data.endTime) : undefined,
        totalDuration: data.totalDuration || data.total_duration,
        error: data.error,
        stages: this.parseStages(data.stages || data.stage)
      };

      return entry;
    } catch (e) {
      console.error('Failed to parse qtrace:', e);
      return null;
    }
  }

  private parseStages(stages: any[]): QtraceStage[] {
    if (!Array.isArray(stages)) return [];

    return stages.map(s => ({
      stageName: s.stageName || s.name || s.stage_name || 'unknown',
      startTime: new Date(s.startTime || s.start_time || 0),
      endTime: s.endTime ? new Date(s.endTime) : undefined,
      duration: s.duration || (s.endTime && s.startTime ? new Date(s.endTime).getTime() - new Date(s.startTime).getTime() : undefined),
      details: s.details || s.info || {}
    }));
  }
}

/**
 * Jmap 日志解析器
 * 解析 jmap -histo 输出
 */
export class JmapParser {

  parse(content: string): JmapEntry {
    const entry: JmapEntry = {
      timestamp: new Date(),
      pid: 0,
      objects: []
    };

    const lines = content.split('\n');
    let inHistogram = false;

    for (const line of lines) {
      // 解析头部信息
      if (line.startsWith('pid:')) {
        const match = line.match(/pid:\s*(\d+)/);
        if (match) entry.pid = parseInt(match[1]);
      }

      if (line.includes('timestamp:')) {
        const match = line.match(/timestamp:\s*(.+)/);
        if (match) entry.timestamp = new Date(match[1].trim());
      }

      // 解析堆信息
      if (line.startsWith('Heap Usage:') || line.startsWith('heap')) {
        inHistogram = true;
        continue;
      }

      // 解析直方图数据
      // 格式: num #instances size class name
      const histogramMatch = line.match(/^\s*\d+\s+(\d+)\s+(\d+)\s+([\w.$]+)\s*$/);
      if (histogramMatch) {
        const instances = parseInt(histogramMatch[1]);
        const bytes = parseInt(histogramMatch[2]);
        const className = histogramMatch[3];

        entry.objects!.push({
          className,
          instances,
          bytes
        });
      }

      // 解析GC历史
      if (line.includes('GC') || line.includes('gc')) {
        const gcMatch = line.match(/(Full GC|GC|Young GC|Old GC)(\d+):\s*\[([^\]]+)\]/);
        if (gcMatch) {
          if (!entry.gcHistory) entry.gcHistory = [];
          entry.gcHistory.push({
            gcType: gcMatch[1],
            timestamp: new Date()
          });
        }
      }
    }

    // 限制对象数量避免内存过大
    if (entry.objects && entry.objects.length > 500) {
      entry.objects = entry.objects
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 500);
    }

    return entry;
  }
}

/**
 * Jstack 日志解析器
 * 解析 jstack 输出
 */
export class JstackParser {

  parse(content: string): JstackEntry {
    const entry: JstackEntry = {
      timestamp: new Date(),
      pid: 0,
      threads: []
    };

    const lines = content.split('\n');
    let currentThread: JstackThread | null = null;
    let deadlocks: JstackDeadlock[] = [];

    // 检测死锁标题
    if (content.includes('Found') && content.includes('deadlock')) {
      const foundMatch = content.match(/Found (\d+) deadlock/);
      if (foundMatch) {
        const deadlockCount = parseInt(foundMatch[1]);
        for (let i = 0; i < deadlockCount; i++) {
          deadlocks.push({ threads: [], cycles: [] });
        }
      }
    }

    for (const line of lines) {
      // 解析PID
      if (line.startsWith('pid:')) {
        const match = line.match(/pid:\s*(\d+)/);
        if (match) entry.pid = parseInt(match[1]);
        continue;
      }

      // 解析线程
      const threadMatch = line.match(/'"([^"]+)"'.*tid=0x([0-9a-f]+).*nid=0x([0-9a-f]+).*state=([^\s]+)/);
      if (threadMatch) {
        // 保存之前的线程
        if (currentThread) {
          entry.threads.push(currentThread);
        }

        currentThread = {
          threadId: parseInt(threadMatch[2], 16),
          threadName: threadMatch[1],
          state: threadMatch[4],
          stackTrace: ''
        };
        continue;
      }

      // 堆栈跟踪
      if (currentThread && line.match(/^\s+at\s+/)) {
        currentThread.stackTrace += line.trim() + '\n';
      }

      // CPU时间
      if (currentThread && line.includes('cpu=')) {
        const cpuMatch = line.match(/cpu=([\d.]+)ms/);
        if (cpuMatch) currentThread.cpuTime = parseFloat(cpuMatch[1]);
      }

      // 阻塞时间
      if (currentThread && line.includes('blocked=')) {
        const blockedMatch = line.match(/blocked=(-?\d+)/);
        if (blockedMatch) currentThread.blockedTime = parseInt(blockedMatch[1]);
      }

      // 等待时间
      if (currentThread && line.includes('waited=')) {
        const waitedMatch = line.match(/waited=(-?\d+)/);
        if (waitedMatch) currentThread.waitedTime = parseInt(waitedMatch[1]);
      }

      // 锁信息
      if (currentThread && line.includes('locks')) {
        const lockMatch = line.match(/\(a\s+([\w.$]+)\)/);
        if (lockMatch) {
          currentThread.locks = currentThread.locks || [];
          currentThread.locks.push({
            className: lockMatch[1],
            identityHashCode: ''
          });
        }
      }
    }

    // 保存最后一个线程
    if (currentThread) {
      entry.threads.push(currentThread);
    }

    // 保存死锁
    if (deadlocks.length > 0) {
      entry.deadlocks = deadlocks;
    }

    return entry;
  }
}

/**
 * Jstat 日志解析器
 * 解析 jstat -gcutil 输出
 */
export class JstatParser {

  parse(content: string): JstatEntry {
    const entry: JstatEntry = {
      timestamp: new Date(),
      pid: 0,
      gcUtilization: []
    };

    const lines = content.split('\n');

    for (const line of lines) {
      // 解析PID
      if (line.startsWith('pid:')) {
        const match = line.match(/pid:\s*(\d+)/);
        if (match) entry.pid = parseInt(match[1]);
        continue;
      }

      // 跳过标题行和数据行
      if (line.includes('S0C') || line.includes('NGCMN')) continue;
      if (!line.trim()) continue;

      // 解析 gcutil 数据
      // 格式: S0 S1 E O M CCS YGC YGCT FGC FGCT CGC CGCT GCT
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 12) {
        const gcUtil: GcUtilization = {
          gcType: 'Overall',
          capacityBefore: 0,
          capacityAfter: 0,
          utilizationPercent: 0
        };

        // 尝试解析各区域
        const regions = ['S0', 'S1', 'E', 'O', 'M', 'CCS'];
        const utilizations = parts.slice(0, 6).map(v => parseFloat(v) || 0);

        // 找出使用率最高的区域
        let maxUtil = 0;
        let maxIdx = 0;
        utilizations.forEach((v, i) => {
          if (v > maxUtil) {
            maxUtil = v;
            maxIdx = i;
          }
        });

        gcUtil.gcType = regions[maxIdx] || 'O';
        gcUtil.utilizationPercent = maxUtil;

        // 解析GC次数和时间
        const gcCounts = parts.slice(6).map(v => parseFloat(v) || 0);
        gcUtil.collectionCount = gcCounts[2] + gcCounts[3]; // YGC + FGC
        gcUtil.collectionTime = gcCounts[4] * 1000 + gcCounts[5] * 1000; // YGCT + FGCT 转换为ms

        entry.gcUtilization!.push(gcUtil);
      }
    }

    return entry;
  }
}

/**
 * Linux 指标解析器
 * 解析 sar, top, iostat 等输出
 */
export class LinuxMetricsParser {

  parse(content: string, type: 'cpu' | 'memory' | 'disk' | 'network'): LinuxMetrics {
    const metrics: LinuxMetrics = {
      timestamp: new Date()
    };

    if (type === 'cpu') {
      metrics.cpu = this.parseCpu(content);
    } else if (type === 'memory') {
      metrics.memory = this.parseMemory(content);
    } else if (type === 'disk') {
      metrics.disk = this.parseDisk(content);
    } else if (type === 'network') {
      metrics.network = this.parseNetwork(content);
    }

    return metrics;
  }

  private parseCpu(content: string): CpuMetrics {
    const cpu: CpuMetrics = {
      user: 0,
      system: 0,
      idle: 100,
      iowait: 0,
      steal: 0
    };

    // 解析 %user, %system, %idle, %iowait, %steal
    const avgMatch = content.match(/Average:\s*.*?\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (avgMatch) {
      cpu.user = parseFloat(avgMatch[1]);
      cpu.system = parseFloat(avgMatch[2]);
      cpu.idle = parseFloat(avgMatch[3]);
      cpu.iowait = parseFloat(avgMatch[4]);
      cpu.steal = parseFloat(avgMatch[5]);
    } else {
      // 尝试直接解析
      const values = content.match(/([\d.]+)/g);
      if (values && values.length >= 5) {
        cpu.user = parseFloat(values[0]);
        cpu.system = parseFloat(values[1]);
        cpu.idle = parseFloat(values[2]);
        cpu.iowait = parseFloat(values[3]);
        cpu.steal = parseFloat(values[4]);
      }
    }

    // 解析 load average
    const loadMatch = content.match(/load average[:\s]+([^,\n]+),?\s*([^,\n]+),?\s*([^,\n]+)/i);
    if (loadMatch) {
      cpu.loadAvg = [
        parseFloat(loadMatch[1].trim()),
        parseFloat(loadMatch[2].trim()),
        parseFloat(loadMatch[3].trim())
      ];
    }

    return cpu;
  }

  private parseMemory(content: string): MemoryMetrics {
    const mem: MemoryMetrics = {
      total: 0,
      used: 0,
      free: 0,
      available: 0
    };

    // 解析 Mem: total used free available buffers cached
    const memMatch = content.match(/Mem:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (memMatch) {
      mem.total = parseInt(memMatch[1]) * 1024; // KB to bytes
      mem.used = parseInt(memMatch[2]) * 1024;
      mem.free = parseInt(memMatch[3]) * 1024;
      mem.available = parseInt(memMatch[4]) * 1024;
    }

    // 解析 Swap: total used free
    const swapMatch = content.match(/Swap:\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (swapMatch) {
      mem.swapTotal = parseInt(swapMatch[1]) * 1024;
      mem.swapUsed = parseInt(swapMatch[2]) * 1024;
    }

    return mem;
  }

  private parseDisk(content: string): DiskMetrics {
    const disk: DiskMetrics = {
      device: 'unknown'
    };

    // 解析 iostat 输出
    const avgquMatch = content.match(/Device:\s*\w+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (avgquMatch) {
      disk.await = parseFloat(avgquMatch[1]);
      disk.util = parseFloat(avgquMatch[4]);
    }

    // 解析 r/s w/s
    const ioMatch = content.match(/(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)/);
    if (ioMatch) {
      disk.readCount = parseInt(ioMatch[1]);
      disk.writeCount = parseInt(ioMatch[2]);
      disk.readBytes = parseInt(ioMatch[3]) * 512; // sectors to bytes
      disk.writeBytes = parseInt(ioMatch[4]) * 512;
    }

    return disk;
  }

  private parseNetwork(content: string): NetworkMetrics {
    const net: NetworkMetrics = {
      interface: 'unknown'
    };

    // 解析 IFACE rxpck/s txpck/s rxkb/s txkb/s
    const netMatch = content.match(/(\w+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (netMatch) {
      net.interface = netMatch[1];
      net.rxPackets = parseFloat(netMatch[2]);
      net.txPackets = parseFloat(netMatch[3]);
      net.rxBytes = parseFloat(netMatch[4]) * 1024; // KB to bytes
      net.txBytes = parseFloat(netMatch[5]) * 1024;
    }

    return net;
  }
}
