import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export interface ExceptionRecord {
  id: number;
  queryId?: string;
  sessionHandle?: string;
  sqlText?: string;
  exceptionType: string;
  sqlStage?: string;
  errorMessage: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestion: string;
  createdAt: string;
  sourceNode?: string;
}

export interface AssociatedLog {
  id: number;
  exceptionId: number;
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  thread: string;
  source: 'server' | 'executor';
}

export interface ExceptionStats {
  exception_type: string;
  count: number;
  severity: string;
}

export interface ListResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ExceptionDetailResponse {
  success: boolean;
  data: ExceptionRecord;
}

export interface LogsResponse {
  success: boolean;
  data: {
    serverLogs: AssociatedLog[];
    executorLogs: AssociatedLog[];
  };
}

export interface StatsResponse {
  success: boolean;
  data: ExceptionStats[];
}

export const api = {
  // 异常列表
  getExceptions(params: {
    type?: string;
    severity?: string;
    search?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) {
    return client.get<ListResponse<ExceptionRecord>>('/exceptions', { params });
  },

  // 异常详情
  getException(id: number) {
    return client.get<ExceptionDetailResponse>(`/exceptions/${id}`);
  },

  // 异常关联日志
  getExceptionLogs(id: number) {
    return client.get<LogsResponse>(`/exceptions/${id}/logs`);
  },

  // 异常统计
  getStats(params?: { startDate?: string; endDate?: string }) {
    return client.get<StatsResponse>('/exceptions/stats', { params });
  },

  // 健康检查
  health() {
    return client.get('/health');
  },
};
