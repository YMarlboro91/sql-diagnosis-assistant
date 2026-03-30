import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseManager } from '../db/sqlite.js';
import { LogAssociator } from '../associator/LogAssociator.js';

export async function setupRoutes(fastify: FastifyInstance, db: DatabaseManager) {
  const associator = new LogAssociator();

  // 异常列表
  fastify.get('/api/exceptions', async (request: FastifyRequest<{
    Querystring: {
      type?: string;
      severity?: string;
      search?: string;
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
    }
  }>, reply: FastifyReply) => {
    const { type, severity, search, page, limit, startDate, endDate } = request.query;

    const result = db.getExceptions({
      type,
      severity,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    return reply.send({
      success: true,
      data: result.data,
      total: result.total,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    });
  });

  // 异常详情
  fastify.get('/api/exceptions/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const exception = db.getExceptionById(id);

    if (!exception) {
      return reply.status(404).send({ success: false, error: 'Exception not found' });
    }

    return reply.send({ success: true, data: exception });
  });

  // 异常关联日志
  fastify.get('/api/exceptions/:id/logs', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const logs = db.getAssociatedLogs(id);

    return reply.send({
      success: true,
      data: logs
    });
  });

  // 异常统计
  fastify.get('/api/exceptions/stats', async (request: FastifyRequest<{
    Querystring: {
      startDate?: string;
      endDate?: string;
    }
  }>, reply: FastifyReply) => {
    const { startDate, endDate } = request.query;

    const stats = db.getExceptionStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    return reply.send({ success: true, data: stats });
  });

  // 手动触发扫描
  fastify.post('/api/scan', async (request: FastifyRequest, reply: FastifyReply) => {
    // 这个接口用于手动触发一次扫描，由外部调用
    return reply.send({ success: true, message: 'Scan triggered' });
  });

  // 健康检查
  fastify.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });
}
