import { ExceptionType, Severity, SQLStage } from '../parser/LogEntry.js';

export interface DetectionRule {
  type: ExceptionType;
  stage: SQLStage;  // 对应的 SQL 生命周期阶段
  patterns: RegExp[];
  severity: Severity;
  title: string;
  suggestion: string;
}

export const DETECTION_RULES: DetectionRule[] = [
  // ==================== SUBMISSION 阶段 ====================
  {
    type: 'SUBMISSION_ERROR',
    stage: 'SUBMISSION',
    patterns: [
      /Query.*submission.*failed/i,
      /Submit.*query.*error/i,
      /Cannot submit.*query/i,
    ],
    severity: 'HIGH',
    title: '查询提交错误',
    suggestion: '查询提交失败，检查队列状态或服务是否正常。'
  },
  {
    type: 'QUEUE_FULL',
    stage: 'SUBMISSION',
    patterns: [
      /Queue.*full/i,
      /Queue capacity exceeded/i,
      /No available.*queue/i,
      /Maximum.*queries.*exceeded/i,
    ],
    severity: 'MEDIUM',
    title: '队列满',
    suggestion: '查询队列已满，等待或联系管理员增加队列容量。'
  },

  // ==================== CONNECTION 阶段 ====================
  {
    type: 'CONNECTION_ERROR',
    stage: 'CONNECTION',
    patterns: [
      /Could not get JDBC Connection/i,
      /Connection refused/i,
      /Connection.*timeout/i,
      /No suitable driver/i,
      /Unable to connect/i,
    ],
    severity: 'HIGH',
    title: '连接错误',
    suggestion: '检查数据库连接配置，连接池设置，以及数据库服务状态。'
  },
  {
    type: 'AUTH_ERROR',
    stage: 'CONNECTION',
    patterns: [
      /Authentication.*failed/i,
      /Invalid credentials/i,
      /Access denied/i,
      /password authentication failed/i,
    ],
    severity: 'HIGH',
    title: '认证失败',
    suggestion: '检查用户名密码是否正确，确认认证方式是否匹配。'
  },
  {
    type: 'SESSION_ERROR',
    stage: 'CONNECTION',
    patterns: [
      /Session.*closed/i,
      /Session.*timeout/i,
      /SessionHandle.*invalid/i,
    ],
    severity: 'MEDIUM',
    title: '会话错误',
    suggestion: '会话超时或被关闭，请重新建立会话。'
  },

  // ==================== PARSE 阶段 ====================
  {
    type: 'SYNTAX_ERROR',
    stage: 'PARSE',
    patterns: [
      /syntax error at position \d+/i,
      /syntax error near/i,
      /SQLError.*syntax error/i,
      /ParseException.*syntax/i,
      /FAILED: ParseException/i,
      /cannot recognize input/i,
    ],
    severity: 'HIGH',
    title: 'SQL 语法错误',
    suggestion: '检查 SQL 语法，确认关键字拼写正确，括号、引号是否匹配。'
  },

  // ==================== SEMANTIC_ANALYSIS 阶段 ====================
  {
    type: 'SEMANTIC_ERROR',
    stage: 'SEMANTIC_ANALYSIS',
    patterns: [
      /Table.*not found/i,
      /NoSuchTableException/i,
      /Table.*doesn't exist/i,
      /Table.*does not exist/i,
      /Column.*not found/i,
      /Unknown column/i,
      /Invalid column reference/i,
      /Unknown table/i,
      /Table or view not found/i,
      /SemanticException.*/i,
      /FAILED: SemanticException/i,
      /No fields defined/i,
    ],
    severity: 'HIGH',
    title: '语义错误（表/字段不存在）',
    suggestion: '检查表名、字段名拼写是否正确，确认是否在正确的数据库中。'
  },
  {
    type: 'PERMISSION_DENIED',
    stage: 'SEMANTIC_ANALYSIS',
    patterns: [
      /Permission denied/i,
      /AccessControlException/i,
      /Unauthorized.*access/i,
      /permission.*denied/i,
      /tables.*not allowed to.*query/i,
    ],
    severity: 'HIGH',
    title: '权限不足',
    suggestion: '检查当前用户是否有访问表/数据库的权限。'
  },
  {
    type: 'TYPE_ERROR',
    stage: 'SEMANTIC_ANALYSIS',
    patterns: [
      /type mismatch.*expected.*got/i,
      /cannot resolve.*type/i,
      /Invalid type.*for column/i,
    ],
    severity: 'MEDIUM',
    title: '类型错误',
    suggestion: '检查字段类型定义是否正确，必要时进行类型转换。'
  },

  // ==================== LOGICAL_PLAN 阶段 ====================
  {
    type: 'LOGICAL_PLAN_ERROR',
    stage: 'LOGICAL_PLAN',
    patterns: [
      /Logical Plan.*failed/i,
      /Operator.*error/i,
      /Invalid.*operator/i,
      /Plan generation failed/i,
      /Failed to generate logical plan/i,
    ],
    severity: 'HIGH',
    title: '逻辑计划生成错误',
    suggestion: '检查查询逻辑，确认操作符使用是否正确。'
  },

  // ==================== LOGICAL_OPT 阶段 ====================
  {
    type: 'LOGICAL_OPT_SKIP',
    stage: 'LOGICAL_OPT',
    patterns: [
      /Logical optimizer.*skip/i,
      /Skipping logical optimization/i,
      /Logical optimization.*disabled/i,
    ],
    severity: 'LOW',
    title: '逻辑优化跳过',
    suggestion: '逻辑优化被跳过，查询仍可正常执行。'
  },
  {
    type: 'LOGICAL_OPT_ERROR',
    stage: 'LOGICAL_OPT',
    patterns: [
      /Logical optimization.*failed/i,
      /Logical optimizer.*error/i,
    ],
    severity: 'MEDIUM',
    title: '逻辑优化错误',
    suggestion: '逻辑优化过程中发生错误，请检查查询语句。'
  },

  // ==================== PHYSICAL_PLAN 阶段 ====================
  {
    type: 'PHYSICAL_PLAN_ERROR',
    stage: 'PHYSICAL_PLAN',
    patterns: [
      /Physical Plan.*failed/i,
      /Failed to generate.*plan/i,
      /Query plan.*error/i,
      /Tez.*plan.*failed/i,
      /Spark.*plan.*failed/i,
      /MapReduce.*plan.*failed/i,
    ],
    severity: 'HIGH',
    title: '物理计划生成错误',
    suggestion: '无法生成执行计划，请检查查询复杂度或系统资源。'
  },
  {
    type: 'RESOURCE_LIMIT',
    stage: 'PHYSICAL_PLAN',
    patterns: [
      /Resource.*limit.*exceeded/i,
      /Total memory.*exceeds/i,
      /Exceeded.*memory limit/i,
      /Container.*exceeded.*resource/i,
    ],
    severity: 'HIGH',
    title: '资源限制',
    suggestion: '查询需要的资源超过限制，考虑优化查询或增加集群资源。'
  },

  // ==================== PHYSICAL_OPT 阶段 ====================
  {
    type: 'PHYSICAL_OPT_SKIP',
    stage: 'PHYSICAL_OPT',
    patterns: [
      /\[CalciteOptimizer\].*No actions have been enabled/i,
      /Calcite.*will be skipped/i,
      /Physical optimization skipped/i,
      /Can't apply.*options.*text\|rc tables/i,
      /Will reset all.*options.*non-opt version/i,
    ],
    severity: 'LOW',
    title: '物理优化跳过',
    suggestion: '由于表类型或其他原因，物理优化被跳过，查询仍可正常执行。'
  },
  {
    type: 'PHYSICAL_OPT_ERROR',
    stage: 'PHYSICAL_OPT',
    patterns: [
      /Physical optimization.*failed/i,
      /Cost-based optimization.*error/i,
      /Optimizer.*error/i,
      /Physical optimizer.*error/i,
    ],
    severity: 'MEDIUM',
    title: '物理优化错误',
    suggestion: '物理优化过程中发生错误，请检查查询语句。'
  },

  // ==================== EXECUTION 阶段 ====================
  {
    type: 'EXECUTION_ERROR',
    stage: 'EXECUTION',
    patterns: [
      /Execution.*failed/i,
      /Task.*failed/i,
      /FAILED: ExecutionException/i,
      /Error running.*task/i,
      /Job.*failed/i,
      /Attempt.*failed/i,
    ],
    severity: 'HIGH',
    title: '执行错误',
    suggestion: '任务执行失败，检查是否有数据问题或资源不足。'
  },
  {
    type: 'LOCK_TIMEOUT',
    stage: 'EXECUTION',
    patterns: [
      /Lock wait timeout/i,
      /Lock acquisition timeout/i,
      /Could not acquire.*lock/i,
      /Lock.*timeout/i,
    ],
    severity: 'MEDIUM',
    title: '锁等待超时',
    suggestion: '事务等待锁超时，检查是否有其他事务持有锁。'
  },
  {
    type: 'DEADLOCK',
    stage: 'EXECUTION',
    patterns: [
      /Deadlock/i,
      /Deadlock found/i,
      /Potential deadlock detected/i,
    ],
    severity: 'HIGH',
    title: '死锁',
    suggestion: '检测到死锁，尝试调整事务执行顺序或添加重试机制。'
  },
  {
    type: 'MEMORY_EXCEEDED',
    stage: 'EXECUTION',
    patterns: [
      /OutOfMemory/i,
      /Java heap space/i,
      /GC overhead limit exceeded/i,
      /内存不足/i,
      /heap space.*exceeded/i,
    ],
    severity: 'HIGH',
    title: '内存不足',
    suggestion: '查询内存使用超限，减少查询数据量或增加节点内存。'
  },
  {
    type: 'TASK_TIMEOUT',
    stage: 'EXECUTION',
    patterns: [
      /timeout.*exceeded/i,
      /Task.*timeout/i,
      /Query execution timeout/i,
      /Execution timeout/i,
    ],
    severity: 'MEDIUM',
    title: '任务超时',
    suggestion: '任务执行超时，考虑优化查询或增加超时时间。'
  },
  {
    type: 'MR_JOB_ERROR',
    stage: 'EXECUTION',
    patterns: [
      /MapReduce.*error/i,
      /MRJob.*failed/i,
      /org\.apache\.hadoop\.mapred\./i,
    ],
    severity: 'HIGH',
    title: 'MapReduce 执行错误',
    suggestion: 'MapReduce 任务执行失败，查看详细日志定位问题。'
  },

  // ==================== DATA_ACCESS 阶段 ====================
  {
    type: 'DATA_ACCESS_ERROR',
    stage: 'DATA_ACCESS',
    patterns: [
      /Data scan.*error/i,
      /Scan.*failed/i,
      /File not found/i,
      /Input path.*does not exist/i,
    ],
    severity: 'HIGH',
    title: '数据访问错误',
    suggestion: '无法访问数据文件，检查文件是否存在或路径是否正确。'
  },
  {
    type: 'IO_ERROR',
    stage: 'DATA_ACCESS',
    patterns: [
      /IOException/i,
      /Input.*error/i,
      /Read.*error/i,
      /Network.*IO.*error/i,
      /Connection.*reset/i,
    ],
    severity: 'HIGH',
    title: 'IO 错误',
    suggestion: '数据读写发生 IO 错误，检查网络和存储是否正常。'
  },
  {
    type: 'TYPE_MISMATCH',
    stage: 'DATA_ACCESS',
    patterns: [
      /type mismatch/i,
      /cannot cast/i,
      /cannot convert/i,
      /Invalid type conversion/i,
      /Type.*error/i,
    ],
    severity: 'MEDIUM',
    title: '类型不匹配',
    suggestion: '数据类型不匹配，检查字段类型，必要时进行类型转换。'
  },

  // ==================== RESULT_FETCH 阶段 ====================
  {
    type: 'RESULT_ERROR',
    stage: 'RESULT_FETCH',
    patterns: [
      /Result.*error/i,
      /Fetch.*failed/i,
      /Output.*error/i,
      /Write.*failed/i,
    ],
    severity: 'MEDIUM',
    title: '结果返回错误',
    suggestion: '返回查询结果时发生错误，请重试或检查客户端连接。'
  },
];

/**
 * 根据错误信息匹配异常类型
 */
export function matchExceptionType(errorMessage: string): DetectionRule | null {
  for (const rule of DETECTION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(errorMessage)) {
        return rule;
      }
    }
  }
  return null;
}
