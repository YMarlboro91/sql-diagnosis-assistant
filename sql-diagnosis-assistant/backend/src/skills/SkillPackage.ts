import { ExceptionRecord, SQLLogEntry, Severity } from '../parser/LogEntry.js';

// 诊断结果
export interface DiagnosisResult {
  skillPackage: string;        // 'log', 'jmap', 'jstack', 'jstat', 'qtrace', 'linux'
  diagnosisType: string;        // 'cpu', 'memory', 'gc', 'thread', 'io', etc.
  severity: Severity;
  title: string;
  description?: string;
  details?: Record<string, any>;
  suggestion?: string;
}

// 诊断上下文
export interface DiagnosisContext {
  exception: ExceptionRecord;
  queryId: string;
  sessionHandle: string;
  logs: SQLLogEntry[];           // server/executor logs
  qtrace?: QtraceEntry;          // query trace data
  jmap?: JmapEntry;              // heap dump summary
  jstack?: JstackEntry;          // thread dump
  jstat?: JstatEntry;            // GC statistics
  linuxMetrics?: LinuxMetrics;    // CPU, memory, disk, network
}

// 基础技能包接口
export interface SkillPackage {
  name: string;                    // 'log', 'jmap', 'jstack', etc.
  displayName: string;             // '日志诊断', 'JVM内存诊断'
  supportedLogTypes: string[];     // log file extensions or patterns

  // 分析日志并返回诊断结果
  analyze(context: DiagnosisContext): DiagnosisResult[];

  // 优先级（越高越先执行）
  priority: number;

  // 是否支持该上下文
  canAnalyze(context: DiagnosisContext): boolean;
}

// Qtrace 条目
export interface QtraceEntry {
  queryId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  stages: QtraceStage[];
  totalDuration?: number;
  error?: string;
}

export interface QtraceStage {
  stageName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  details?: Record<string, any>;
}

// Jmap 条目
export interface JmapEntry {
  timestamp: Date;
  pid: number;
  heapUsed?: number;
  heapCommitted?: number;
  heapMax?: number;
  objects?: JmapObject[];
  gcHistory?: GcEvent[];
}

export interface JmapObject {
  className: string;
  instances: number;
  bytes: number;
}

export interface GcEvent {
  gcType: string;
  timestamp: Date;
  duration?: number;
  before?: number;
  after?: number;
}

// Jstack 条目
export interface JstackEntry {
  timestamp: Date;
  pid: number;
  threads: JstackThread[];
  deadlocks?: JstackDeadlock[];
}

export interface JstackThread {
  threadId: number;
  threadName: string;
  state: string;
  cpuTime?: number;
  blockedTime?: number;
  waitedTime?: number;
  stackTrace?: string;
  locks?: { className: string; identityHashCode: string }[];
}

export interface JstackDeadlock {
  threads: number[];
  cycles: string[][];
}

// Jstat 条目
export interface JstatEntry {
  timestamp: Date;
  pid: number;
  gcUtilization?: GcUtilization[];
  classStats?: ClassStats;
}

export interface GcUtilization {
  gcType: string;
  capacityBefore: number;
  capacityAfter: number;
  utilizationPercent: number;
  collectionCount?: number;
  collectionTime?: number;
}

export interface ClassStats {
  loadedClassCount: number;
 卸载ClassCount: number;
  classSpaceUsed: number;
  classSpaceCommitted: number;
}

// Linux 指标
export interface LinuxMetrics {
  timestamp: Date;
  cpu?: CpuMetrics;
  memory?: MemoryMetrics;
  disk?: DiskMetrics;
  network?: NetworkMetrics;
}

export interface CpuMetrics {
  user: number;       // 用户态百分比
  system: number;     // 系统态百分比
  idle: number;        // 空闲百分比
  iowait?: number;     // IO等待百分比
  steal?: number;      // 虚拟化抢占
  loadAvg?: number[];  // 1, 5, 15分钟负载
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  available?: number;
  buffers?: number;
  cached?: number;
  swapTotal?: number;
  swapUsed?: number;
}

export interface DiskMetrics {
  device: string;
  readBytes?: number;
  writeBytes?: number;
  readCount?: number;
  writeCount?: number;
  await?: number;
  util?: number;
}

export interface NetworkMetrics {
  interface: string;
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
}
