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

// 规则相关类型
export interface RuleRecord {
  id?: number;
  name: string;
  exceptionType: string;
  sqlStage: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  patterns: string[];
  title: string;
  suggestion: string;
  enabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SQLStageOption {
  value: string;
  label: string;
  order: number;
}

export interface ExceptionTypeOption {
  value: string;
  label: string;
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

  // 规则管理
  getRules() {
    return client.get<{ success: boolean; data: RuleRecord[] }>('/rules');
  },

  getRule(id: number) {
    return client.get<{ success: boolean; data: RuleRecord }>(`/rules/${id}`);
  },

  createRule(rule: Partial<RuleRecord>) {
    return client.post<{ success: boolean; data: RuleRecord }>('/rules', rule);
  },

  updateRule(id: number, rule: Partial<RuleRecord>) {
    return client.put<{ success: boolean; data: RuleRecord }>(`/rules/${id}`, rule);
  },

  deleteRule(id: number) {
    return client.delete<{ success: boolean; message: string }>(`/rules/${id}`);
  },

  reorderRules(priorities: { id: number; priority: number }[]) {
    return client.post<{ success: boolean; message: string }>('/rules/reorder', { priorities });
  },

  getRulesStages() {
    return client.get<{ success: boolean; data: SQLStageOption[] }>('/rules/stages');
  },

  getRulesTypes() {
    return client.get<{ success: boolean; data: ExceptionTypeOption[] }>('/rules/types');
  },

  exportRules() {
    return client.get<{ success: boolean; data: RuleRecord[] }>('/rules/export');
  },

  importRules(rules: Partial<RuleRecord>[]) {
    return client.post<{ success: boolean; data: { imported: number; errors: string[] } }>('/rules/import', { rules });
  },
};
