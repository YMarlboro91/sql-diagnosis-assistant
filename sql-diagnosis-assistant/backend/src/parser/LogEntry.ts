// SQL 执行阶段 (Hive SQL 生命周期)
export type SQLStage =
  | 'SUBMISSION'            // 1. 查询提交 - Driver 接收用户提交的 SQL
  | 'CONNECTION'            // 2. 连接阶段 - 建立连接、认证、会话初始化
  | 'PARSE'                 // 3. 语法解析 - SQL 解析成 AST (Abstract Syntax Tree)
  | 'SEMANTIC_ANALYSIS'     // 4. 语义分析 - 类型检查、表/列解析、权限校验
  | 'LOGICAL_PLAN'          // 5. 逻辑计划 - 生成逻辑操作符树 (Operator Tree)
  | 'LOGICAL_OPT'           // 6. 逻辑优化 - 列裁剪、谓词下推、分区裁剪
  | 'PHYSICAL_PLAN'         // 7. 物理计划 - 生成 MapReduce/Tez/Spark 任务
  | 'PHYSICAL_OPT'          // 8. 物理优化 - Join 顺序、任务并行度、内存估算
  | 'EXECUTION'             // 9. 执行阶段 - Execution Engine 运行 DAG 中的 stages/tasks
  | 'DATA_ACCESS'           // 10. 数据访问 - 访问 HDFS/Metastore 获取数据
  | 'RESULT_FETCH'           // 11. 结果返回 - 结果集组装、返回客户端
  | 'UNKNOWN';              // 未知阶段

// 异常类型（按 Hive SQL 生命周期阶段分类）
export type ExceptionType =
  // SUBMISSION 阶段
  | 'SUBMISSION_ERROR'            // 查询提交错误
  | 'QUEUE_FULL'                 // 队列满

  // CONNECTION 阶段
  | 'CONNECTION_ERROR'           // 连接错误
  | 'AUTH_ERROR'                 // 认证错误
  | 'SESSION_ERROR'              // 会话错误

  // PARSE 阶段
  | 'SYNTAX_ERROR'               // 语法错误

  // SEMANTIC_ANALYSIS 阶段
  | 'SEMANTIC_ERROR'             // 语义错误（表不存在、字段不存在）
  | 'PERMISSION_DENIED'          // 权限不足
  | 'TYPE_ERROR'                 // 类型错误

  // LOGICAL_PLAN 阶段
  | 'LOGICAL_PLAN_ERROR'         // 逻辑计划生成错误

  // LOGICAL_OPT 阶段
  | 'LOGICAL_OPT_SKIP'           // 逻辑优化跳过
  | 'LOGICAL_OPT_ERROR'          // 逻辑优化错误

  // PHYSICAL_PLAN 阶段
  | 'PHYSICAL_PLAN_ERROR'        // 物理计划错误
  | 'RESOURCE_LIMIT'             // 资源限制

  // PHYSICAL_OPT 阶段
  | 'PHYSICAL_OPT_SKIP'          // 物理优化跳过
  | 'PHYSICAL_OPT_ERROR'         // 物理优化错误

  // EXECUTION 阶段
  | 'EXECUTION_ERROR'            // 执行错误
  | 'LOCK_TIMEOUT'               // 锁等待超时
  | 'DEADLOCK'                   // 死锁
  | 'MEMORY_EXCEEDED'            // 内存超限
  | 'TASK_TIMEOUT'               // 任务超时
  | 'MR_JOB_ERROR'               // MapReduce 任务错误

  // DATA_ACCESS 阶段
  | 'DATA_ACCESS_ERROR'          // 数据访问错误
  | 'IO_ERROR'                   // IO 错误
  | 'TYPE_MISMATCH'              // 类型不匹配

  // RESULT_FETCH 阶段
  | 'RESULT_ERROR'               // 结果返回错误

  // 优化阶段
  | 'OPTIMIZATION_SKIP'          // 优化跳过
  | 'OPTIMIZATION_WARN'          // 优化警告

  // UNKNOWN
  | 'UNKNOWN';                   // 未知

// 严重程度
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

// 解析后的日志条目
export interface ParsedLogEntry {
  timestamp: Date;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  logger: string;
  thread: string;
  message: string;
  raw: string;
}

// SQL 日志条目（包含 SQL 相关信息）
export interface SQLLogEntry extends ParsedLogEntry {
  queryId?: string;
  sessionHandle?: string;
  sqlText?: string;
  sourceNode?: string;
}

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
  { stage: 'SUBMISSION', stageName: 'SUBMISSION', stageNameCn: '查询提交', order: 1 },
  { stage: 'CONNECTION', stageName: 'CONNECTION', stageNameCn: '连接/认证', order: 2 },
  { stage: 'PARSE', stageName: 'PARSE', stageNameCn: '语法解析', order: 3 },
  { stage: 'SEMANTIC_ANALYSIS', stageName: 'SEMANTIC_ANALYSIS', stageNameCn: '语义分析', order: 4 },
  { stage: 'LOGICAL_PLAN', stageName: 'LOGICAL_PLAN', stageNameCn: '逻辑计划', order: 5 },
  { stage: 'LOGICAL_OPT', stageName: 'LOGICAL_OPT', stageNameCn: '逻辑优化', order: 6 },
  { stage: 'PHYSICAL_PLAN', stageName: 'PHYSICAL_PLAN', stageNameCn: '物理计划', order: 7 },
  { stage: 'PHYSICAL_OPT', stageName: 'PHYSICAL_OPT', stageNameCn: '物理优化', order: 8 },
  { stage: 'EXECUTION', stageName: 'EXECUTION', stageNameCn: '执行', order: 9 },
  { stage: 'DATA_ACCESS', stageName: 'DATA_ACCESS', stageNameCn: '数据访问', order: 10 },
  { stage: 'RESULT_FETCH', stageName: 'RESULT_FETCH', stageNameCn: '结果返回', order: 11 },
  { stage: 'UNKNOWN', stageName: 'UNKNOWN', stageNameCn: '未知', order: 99 },
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
