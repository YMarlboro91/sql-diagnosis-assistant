// SQL 执行阶段 (Hive SQL 生命周期)
export type SQLStage =
  | 'CONNECTION'           // 1. 连接阶段 - Driver 接收查询
  | 'COMPILATION'          // 2. 编译阶段 - Parser + Semantic Analyzer (语法解析、语义分析)
  | 'LOGICAL_PLAN'         // 3. 逻辑计划 - Logical Plan Generator (生成操作符树)
  | 'OPTIMIZATION'         // 4. 优化阶段 - Optimizer (列裁剪、谓词下推等)
  | 'PHYSICAL_PLAN'        // 5. 物理计划 - Query Plan Generator (生成 map/reduce 任务)
  | 'EXECUTION'            // 6. 执行阶段 - Execution Engine (执行 DAG 中的 stages)
  | 'DATA_SCAN'            // 7. 数据扫描 - 从 HDFS 扫描数据
  | 'RESULT'               // 8. 结果返回 - 返回查询结果
  | 'UNKNOWN';             // 未知阶段

// 异常类型（按 Hive SQL 生命周期阶段分类）
export type ExceptionType =
  // CONNECTION 阶段
  | 'CONNECTION_ERROR'           // 连接错误
  | 'AUTH_ERROR'                 // 认证错误
  | 'SESSION_ERROR'              // 会话错误

  // COMPILATION 阶段
  | 'SYNTAX_ERROR'               // 语法错误
  | 'SEMANTIC_ERROR'             // 语义错误（表不存在、字段不存在）
  | 'PERMISSION_DENIED'          // 权限不足

  // LOGICAL_PLAN 阶段
  | 'LOGICAL_PLAN_ERROR'         // 逻辑计划生成错误

  // OPTIMIZATION 阶段
  | 'OPTIMIZATION_WARN'          // 优化警告
  | 'OPTIMIZATION_SKIP'          // 优化跳过
  | 'OPTIMIZATION_ERROR'         // 优化错误

  // PHYSICAL_PLAN 阶段
  | 'PHYSICAL_PLAN_ERROR'        // 物理计划错误
  | 'RESOURCE_LIMIT'             // 资源限制

  // EXECUTION 阶段
  | 'EXECUTION_ERROR'            // 执行错误
  | 'LOCK_TIMEOUT'               // 锁等待超时
  | 'DEADLOCK'                   // 死锁
  | 'MEMORY_EXCEEDED'            // 内存超限
  | 'TASK_TIMEOUT'               // 任务超时
  | 'MR_JOB_ERROR'               // MapReduce 任务错误

  // DATA_SCAN 阶段
  | 'DATA_SCAN_ERROR'            // 数据扫描错误
  | 'IO_ERROR'                   // IO 错误
  | 'TYPE_MISMATCH'              // 类型不匹配

  // RESULT 阶段
  | 'RESULT_ERROR'               // 结果返回错误

  // UNKNOWN
  | 'UNKNOWN';                   // 未知

// 严重程度
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

// 异常记录
export interface ExceptionRecord {
  id?: number;
  queryId?: string;
  sessionHandle?: string;
  sqlText?: string;
  exceptionType: ExceptionType;
  sqlStage: SQLStage;
  errorMessage: string;
  severity: Severity;
  suggestion: string;
  createdAt: Date;
  sourceFile?: string;
  sourceNode?: string;
}

// 关联日志
export interface AssociatedLog {
  id?: number;
  exceptionId: number;
  timestamp: Date;
  level: string;
  logger: string;
  message: string;
  thread: string;
  source: 'server' | 'executor';
}

// 异常统计
export interface ExceptionStats {
  exception_type: string;
  count: number;
  severity: Severity;
}

// 阶段信息
export interface StageInfo {
  stage: SQLStage;
  stageName: string;
  stageNameCn: string;
  order: number;  // 用于排序
}

// SQL 阶段配置
export const SQL_STAGES: StageInfo[] = [
  { stage: 'CONNECTION', stageName: 'CONNECTION', stageNameCn: '连接', order: 1 },
  { stage: 'COMPILATION', stageName: 'COMPILATION', stageNameCn: '编译', order: 2 },
  { stage: 'LOGICAL_PLAN', stageName: 'LOGICAL_PLAN', stageNameCn: '逻辑计划', order: 3 },
  { stage: 'OPTIMIZATION', stageName: 'OPTIMIZATION', stageNameCn: '优化', order: 4 },
  { stage: 'PHYSICAL_PLAN', stageName: 'PHYSICAL_PLAN', stageNameCn: '物理计划', order: 5 },
  { stage: 'EXECUTION', stageName: 'EXECUTION', stageNameCn: '执行', order: 6 },
  { stage: 'DATA_SCAN', stageName: 'DATA_SCAN', stageNameCn: '数据扫描', order: 7 },
  { stage: 'RESULT', stageName: 'RESULT', stageNameCn: '结果返回', order: 8 },
  { stage: 'UNKNOWN', stageName: 'UNKNOWN', stageNameCn: '未知', order: 9 },
];

// 获取阶段中文名
export function getStageNameCn(stage: SQLStage): string {
  const info = SQL_STAGES.find(s => s.stage === stage);
  return info?.stageNameCn || '未知';
}

// 获取阶段顺序
export function getStageOrder(stage: SQLStage): number {
  const info = SQL_STAGES.find(s => s.stage === stage);
  return info?.order || 99;
}
