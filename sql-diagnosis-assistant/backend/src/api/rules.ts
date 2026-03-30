import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseManager, RuleRecord } from '../db/sqlite.js';
import { SQL_STAGES, ExceptionType } from '../parser/LogEntry.js';

// 所有异常类型
const ALL_EXCEPTION_TYPES: ExceptionType[] = [
  'SUBMISSION_ERROR', 'QUEUE_FULL',
  'CONNECTION_ERROR', 'AUTH_ERROR', 'SESSION_ERROR',
  'SYNTAX_ERROR',
  'SEMANTIC_ERROR', 'PERMISSION_DENIED', 'TYPE_ERROR',
  'LOGICAL_PLAN_ERROR',
  'LOGICAL_OPT_SKIP', 'LOGICAL_OPT_ERROR',
  'PHYSICAL_PLAN_ERROR', 'RESOURCE_LIMIT',
  'PHYSICAL_OPT_SKIP', 'PHYSICAL_OPT_ERROR',
  'EXECUTION_ERROR', 'LOCK_TIMEOUT', 'DEADLOCK', 'MEMORY_EXCEEDED', 'TASK_TIMEOUT', 'MR_JOB_ERROR',
  'DATA_ACCESS_ERROR', 'IO_ERROR', 'TYPE_MISMATCH',
  'RESULT_ERROR',
  'OPTIMIZATION_SKIP', 'OPTIMIZATION_WARN',
  'UNKNOWN'
];

export async function setupRulesRoutes(fastify: FastifyInstance, db: DatabaseManager) {

  // 获取所有规则
  fastify.get('/api/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const rules = db.getAllRules();
    return reply.send({
      success: true,
      data: rules
    });
  });

  // 获取启用的规则
  fastify.get('/api/rules/enabled', async (request: FastifyRequest, reply: FastifyReply) => {
    const rules = db.getEnabledRules();
    return reply.send({
      success: true,
      data: rules
    });
  });

  // 获取规则详情
  fastify.get('/api/rules/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const rule = db.getRuleById(id);

    if (!rule) {
      return reply.status(404).send({ success: false, error: 'Rule not found' });
    }

    return reply.send({ success: true, data: rule });
  });

  // 创建规则
  fastify.post('/api/rules', async (request: FastifyRequest<{
    Body: {
      name: string;
      exceptionType: ExceptionType;
      sqlStage: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      patterns: string[];
      title: string;
      suggestion: string;
      enabled?: boolean;
      priority?: number;
    }
  }>, reply: FastifyReply) => {
    const { name, exceptionType, sqlStage, severity, patterns, title, suggestion, enabled = true, priority = 0 } = request.body;

    if (!name || !exceptionType || !sqlStage || !severity || !patterns || !title || !suggestion) {
      return reply.status(400).send({ success: false, error: 'Missing required fields' });
    }

    if (!Array.isArray(patterns) || patterns.length === 0) {
      return reply.status(400).send({ success: false, error: 'At least one pattern is required' });
    }

    // 验证正则表达式
    for (const pattern of patterns) {
      try {
        new RegExp(pattern);
      } catch (e) {
        return reply.status(400).send({ success: false, error: `Invalid regex pattern: ${pattern}` });
      }
    }

    const rule: RuleRecord = {
      name,
      exceptionType,
      sqlStage: sqlStage as any,
      severity,
      patterns,
      title,
      suggestion,
      enabled,
      priority
    };

    const id = db.saveRule(rule);
    const savedRule = db.getRuleById(id);

    return reply.send({ success: true, data: savedRule });
  });

  // 更新规则
  fastify.put('/api/rules/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: Partial<RuleRecord>
  }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const updates = request.body;

    // 验证正则表达式
    if (updates.patterns) {
      for (const pattern of updates.patterns) {
        try {
          new RegExp(pattern);
        } catch (e) {
          return reply.status(400).send({ success: false, error: `Invalid regex pattern: ${pattern}` });
        }
      }
    }

    const success = db.updateRule(id, updates);

    if (!success) {
      return reply.status(404).send({ success: false, error: 'Rule not found' });
    }

    const updatedRule = db.getRuleById(id);
    return reply.send({ success: true, data: updatedRule });
  });

  // 删除规则
  fastify.delete('/api/rules/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const success = db.deleteRule(id);

    if (!success) {
      return reply.status(404).send({ success: false, error: 'Rule not found' });
    }

    return reply.send({ success: true, message: 'Rule deleted' });
  });

  // 更新规则优先级
  fastify.post('/api/rules/reorder', async (request: FastifyRequest<{
    Body: { priorities: { id: number; priority: number }[] }
  }>, reply: FastifyReply) => {
    const { priorities } = request.body;

    if (!Array.isArray(priorities)) {
      return reply.status(400).send({ success: false, error: 'priorities must be an array' });
    }

    db.updateRulePriorities(priorities);
    return reply.send({ success: true, message: 'Priorities updated' });
  });

  // 获取所有 SQL 阶段
  fastify.get('/api/rules/stages', async (request: FastifyRequest, reply: FastifyReply) => {
    const stages = SQL_STAGES.map(s => ({
      value: s.stage,
      label: s.stageNameCn,
      order: s.order
    }));
    return reply.send({ success: true, data: stages });
  });

  // 获取所有异常类型
  fastify.get('/api/rules/types', async (request: FastifyRequest, reply: FastifyReply) => {
    const types = ALL_EXCEPTION_TYPES.map(t => ({
      value: t,
      label: t.replace(/_/g, ' ')
    }));
    return reply.send({ success: true, data: types });
  });

  // 批量导入规则
  fastify.post('/api/rules/import', async (request: FastifyRequest<{
    Body: { rules: Partial<RuleRecord>[] }
  }>, reply: FastifyReply) => {
    const { rules } = request.body;

    if (!Array.isArray(rules)) {
      return reply.status(400).send({ success: false, error: 'rules must be an array' });
    }

    const imported: number[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      try {
        // 验证正则
        if (r.patterns) {
          for (const pattern of r.patterns) {
            try {
              new RegExp(pattern);
            } catch (e) {
              errors.push(`Rule ${i}: Invalid regex pattern: ${pattern}`);
              continue;
            }
          }
        }

        if (r.name && r.exceptionType && r.sqlStage && r.severity && r.patterns && r.title && r.suggestion) {
          const id = db.saveRule({
            name: r.name,
            exceptionType: r.exceptionType,
            sqlStage: r.sqlStage,
            severity: r.severity,
            patterns: r.patterns,
            title: r.title,
            suggestion: r.suggestion,
            enabled: r.enabled ?? true,
            priority: r.priority ?? 0
          });
          imported.push(id);
        } else {
          errors.push(`Rule ${i}: Missing required fields`);
        }
      } catch (e) {
        errors.push(`Rule ${i}: ${(e as Error).message}`);
      }
    }

    return reply.send({
      success: true,
      data: { imported: imported.length, errors }
    });
  });

  // 导出规则
  fastify.get('/api/rules/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const rules = db.getAllRules();
    return reply.send({
      success: true,
      data: rules
    });
  });
}
