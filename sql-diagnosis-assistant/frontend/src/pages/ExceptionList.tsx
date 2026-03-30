import { useState, useEffect } from 'react';
import { Table, Tag, Input, Select, Button, Card, Row, Col, Statistic, Spin, Badge } from 'antd';
import { useNavigate } from 'react-router-dom';
import { api, ExceptionRecord, ExceptionStats } from '../api/client';
import { SyncOutlined, BugOutlined, WarningOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Search } = Input;

// SQL 生命周期阶段
const SQL_STAGES = [
  { stage: 'CONNECTION', name: '连接', order: 1, icon: '🔗', color: '#1890ff' },
  { stage: 'COMPILATION', name: '编译', order: 2, icon: '📝', color: '#722ed1' },
  { stage: 'LOGICAL_PLAN', name: '逻辑计划', order: 3, icon: '🔀', color: '#13c2c2' },
  { stage: 'OPTIMIZATION', name: '优化', order: 4, icon: '⚡', color: '#faad14' },
  { stage: 'PHYSICAL_PLAN', name: '物理计划', order: 5, icon: '🗺️', color: '#fa8c16' },
  { stage: 'EXECUTION', name: '执行', order: 6, icon: '⚙️', color: '#f5222d' },
  { stage: 'DATA_SCAN', name: '数据扫描', order: 7, icon: '📊', color: '#eb2f96' },
  { stage: 'RESULT', name: '结果返回', order: 8, icon: '✅', color: '#52c41a' },
];

// 异常类型配置
const EXCEPTION_TYPE_CONFIG: Record<string, { label: string; color: string; stage: string; icon: any }> = {
  SYNTAX_ERROR: { label: '语法错误', color: '#f5222d', stage: 'COMPILATION', icon: <CloseCircleOutlined /> },
  SEMANTIC_ERROR: { label: '语义错误', color: '#f5222d', stage: 'COMPILATION', icon: <CloseCircleOutlined /> },
  PERMISSION_DENIED: { label: '权限不足', color: '#f5222d', stage: 'COMPILATION', icon: <CloseCircleOutlined /> },
  CONNECTION_ERROR: { label: '连接错误', color: '#f5222d', stage: 'CONNECTION', icon: <CloseCircleOutlined /> },
  AUTH_ERROR: { label: '认证失败', color: '#f5222d', stage: 'CONNECTION', icon: <CloseCircleOutlined /> },
  SESSION_ERROR: { label: '会话错误', color: '#fa8c16', stage: 'CONNECTION', icon: <ExclamationCircleOutlined /> },
  OPTIMIZATION_WARN: { label: '优化警告', color: '#faad14', stage: 'OPTIMIZATION', icon: <WarningOutlined /> },
  OPTIMIZATION_SKIP: { label: '优化跳过', color: '#1890ff', stage: 'OPTIMIZATION', icon: <SyncOutlined /> },
  OPTIMIZATION_ERROR: { label: '优化错误', color: '#fa8c16', stage: 'OPTIMIZATION', icon: <ExclamationCircleOutlined /> },
  PHYSICAL_PLAN_ERROR: { label: '物理计划错误', color: '#f5222d', stage: 'PHYSICAL_PLAN', icon: <CloseCircleOutlined /> },
  RESOURCE_LIMIT: { label: '资源限制', color: '#f5222d', stage: 'PHYSICAL_PLAN', icon: <CloseCircleOutlined /> },
  EXECUTION_ERROR: { label: '执行错误', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  LOCK_TIMEOUT: { label: '锁等待超时', color: '#fa8c16', stage: 'EXECUTION', icon: <ExclamationCircleOutlined /> },
  DEADLOCK: { label: '死锁', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  MEMORY_EXCEEDED: { label: '内存不足', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  TASK_TIMEOUT: { label: '任务超时', color: '#fa8c16', stage: 'EXECUTION', icon: <ExclamationCircleOutlined /> },
  MR_JOB_ERROR: { label: 'MR任务错误', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  DATA_SCAN_ERROR: { label: '数据扫描错误', color: '#f5222d', stage: 'DATA_SCAN', icon: <CloseCircleOutlined /> },
  IO_ERROR: { label: 'IO错误', color: '#f5222d', stage: 'DATA_SCAN', icon: <CloseCircleOutlined /> },
  TYPE_MISMATCH: { label: '类型不匹配', color: '#fa8c16', stage: 'DATA_SCAN', icon: <ExclamationCircleOutlined /> },
  LOGICAL_PLAN_ERROR: { label: '逻辑计划错误', color: '#f5222d', stage: 'LOGICAL_PLAN', icon: <CloseCircleOutlined /> },
  RESULT_ERROR: { label: '结果返回错误', color: '#fa8c16', stage: 'RESULT', icon: <ExclamationCircleOutlined /> },
  UNKNOWN: { label: '未知错误', color: '#8c8c8c', stage: 'UNKNOWN', icon: <BugOutlined /> },
};

function getStageName(stage: string): string {
  const found = SQL_STAGES.find(s => s.stage === stage);
  return found?.name || stage;
}

function getStageInfo(stage: string) {
  return SQL_STAGES.find(s => s.stage === stage);
}

export default function ExceptionList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [stats, setStats] = useState<ExceptionStats[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchExceptions();
  }, [page, limit, search, typeFilter]);

  const fetchStats = async () => {
    try {
      const res = await api.getStats();
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const fetchExceptions = async () => {
    setLoading(true);
    try {
      const res = await api.getExceptions({
        page,
        limit,
        search: search || undefined,
        type: typeFilter,
      });
      if (res.data.success) {
        setExceptions(res.data.data);
        setTotal(res.data.total);
      }
    } catch (e) {
      console.error('Failed to fetch exceptions:', e);
    } finally {
      setLoading(false);
    }
  };

  // 计算每个阶段的异常数量
  const getStageCount = (stage: string) => {
    return stats
      .filter(s => {
        const config = EXCEPTION_TYPE_CONFIG[s.exception_type];
        return config?.stage === stage;
      })
      .reduce((sum, s) => sum + s.count, 0);
  };

  // 获取高严重度异常数量
  const getHighSeverityCount = () => {
    return stats.filter(s => s.severity === 'HIGH').reduce((sum, s) => sum + s.count, 0);
  };

  const columns = [
    {
      title: 'Query ID',
      dataIndex: 'queryId',
      key: 'queryId',
      width: 180,
      render: (text: string, record: ExceptionRecord) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{text || record.sessionHandle || '-'}</span>
      ),
    },
    {
      title: '异常类型',
      dataIndex: 'exceptionType',
      key: 'exceptionType',
      width: 120,
      render: (type: string) => {
        const config = EXCEPTION_TYPE_CONFIG[type] || { label: type, color: '#8c8c8c', icon: <BugOutlined /> };
        return (
          <Tag icon={config.icon} color={config.color} style={{ borderRadius: 12 }}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '阶段',
      dataIndex: 'sqlStage',
      key: 'sqlStage',
      width: 100,
      render: (stage: string) => {
        const info = getStageInfo(stage);
        return (
          <span style={{ color: info?.color || '#8c8c8c', fontWeight: 500 }}>
            {info?.icon} {getStageName(stage)}
          </span>
        );
      },
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (severity: string) => {
        const colors: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'blue' };
        const labels: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };
        return <Badge color={colors[severity]} text={labels[severity]} />;
      },
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (msg: string) => (
        <span className="text-gray-600 text-sm" title={msg}>{msg}</span>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => (
        <span className="text-gray-500 text-xs">{new Date(date).toLocaleString('zh-CN')}</span>
      ),
    },
  ];

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* 标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">SQL 异常诊断中心</h1>
        <p className="text-gray-500 text-sm">实时监控 SQL 执行生命周期，快速定位异常问题</p>
      </div>

      {/* 概览统计 */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 border-0 shadow-lg">
            <Statistic
              title={<span className="text-blue-100">异常总数</span>}
              value={stats.reduce((sum, s) => sum + s.count, 0)}
              valueStyle={{ color: '#fff', fontSize: 32 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="bg-gradient-to-r from-red-500 to-red-600 border-0 shadow-lg">
            <Statistic
              title={<span className="text-red-100">高严重度</span>}
              value={getHighSeverityCount()}
              valueStyle={{ color: '#fff', fontSize: 32 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="bg-gradient-to-r from-orange-500 to-orange-600 border-0 shadow-lg">
            <Statistic
              title={<span className="text-orange-100">异常类型</span>}
              value={stats.length}
              valueStyle={{ color: '#fff', fontSize: 32 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="bg-gradient-to-r from-green-500 to-green-600 border-0 shadow-lg">
            <Statistic
              title={<span className="text-green-100">影响查询</span>}
              value={new Set(stats.flatMap(s => {
                const exs = exceptions.filter(e => e.exceptionType === s.exception_type);
                return exs.map(e => e.queryId).filter(Boolean);
              })).size || 0}
              valueStyle={{ color: '#fff', fontSize: 32 }}
            />
          </Card>
        </Col>
      </Row>

      {/* SQL 生命周期流程图 */}
      <Card className="mb-6 shadow-sm border-0" title={
        <span className="text-lg font-semibold">📊 SQL 执行生命周期</span>
      }>
        <div className="flex items-center justify-between overflow-x-auto py-4 px-2">
          {SQL_STAGES.map((stage, idx) => {
            const count = getStageCount(stage.stage);
            const hasError = count > 0;
            return (
              <div key={stage.stage} className="flex items-center">
                {/* 阶段节点 */}
                <div
                  className={`
                    relative flex flex-col items-center justify-center
                    w-24 h-24 rounded-2xl shadow-md
                    transition-all duration-300 hover:scale-105 cursor-pointer
                    ${hasError
                      ? 'bg-gradient-to-br from-white to-gray-50 border-2'
                      : 'bg-gray-100 opacity-60'
                    }
                  `}
                  style={{
                    borderColor: hasError ? stage.color : 'transparent',
                    boxShadow: hasError ? `0 4px 20px ${stage.color}40` : 'none'
                  }}
                >
                  {hasError && (
                    <Badge count={count} size="small" style={{ backgroundColor: stage.color }} />
                  )}
                  <span className="text-3xl mb-1">{stage.icon}</span>
                  <span className={`text-xs font-medium ${hasError ? 'text-gray-700' : 'text-gray-400'}`}>
                    {stage.name}
                  </span>
                  {hasError && (
                    <div
                      className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                  )}
                </div>
                {/* 连接线 */}
                {idx < SQL_STAGES.length - 1 && (
                  <div className={`
                    w-8 h-0.5 mx-1
                    ${hasError || getStageCount(SQL_STAGES[idx + 1].stage) > 0
                      ? 'bg-gradient-to-r from-gray-300 to-gray-400'
                      : 'bg-gray-200'
                    }
                  `} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 异常类型分布 */}
      <Card className="mb-6 shadow-sm border-0" title={
        <span className="text-lg font-semibold">🎯 异常类型分布</span>
      }>
        <div className="flex flex-wrap gap-3">
          {stats.slice(0, 12).map(stat => {
            const config = EXCEPTION_TYPE_CONFIG[stat.exception_type] || {
              label: stat.exception_type,
              color: '#8c8c8c',
              icon: <BugOutlined />
            };
            return (
              <div
                key={stat.exception_type}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer
                  hover:scale-105 transition-all duration-200 shadow-sm
                  ${typeFilter === stat.exception_type ? 'ring-2 ring-offset-2' : ''}
                `}
                style={{
                  backgroundColor: `${config.color}15`,
                  border: `1px solid ${config.color}40`
                }}
                onClick={() => {
                  setTypeFilter(typeFilter === stat.exception_type ? undefined : stat.exception_type);
                  setPage(1);
                }}
              >
                <span style={{ color: config.color }}>{config.icon}</span>
                <span className="text-sm font-medium" style={{ color: config.color }}>
                  {config.label}
                </span>
                <Badge
                  count={stat.count}
                  style={{
                    backgroundColor: stat.severity === 'HIGH' ? '#f5222d' : stat.severity === 'MEDIUM' ? '#fa8c16' : '#1890ff'
                  }}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {/* 筛选栏 */}
      <Card className="mb-4 shadow-sm border-0 bg-white">
        <div className="flex items-center gap-4">
          <Search
            placeholder="🔍 搜索 Query ID / 错误信息..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onSearch={(val: string) => { setSearch(val); setPage(1); }}
            allowClear
            className="w-80"
          />
          <Select
            placeholder="筛选类型"
            allowClear
            value={typeFilter}
            style={{ width: 150 }}
            onChange={val => { setTypeFilter(val); setPage(1); }}
            options={stats.map(s => ({
              label: EXCEPTION_TYPE_CONFIG[s.exception_type]?.label || s.exception_type,
              value: s.exception_type
            }))}
          />
          <Button onClick={fetchExceptions} icon={<SyncOutlined spin />}>
            刷新
          </Button>
          {typeFilter && (
            <Button type="link" onClick={() => setTypeFilter(undefined)}>
              清除筛选
            </Button>
          )}
        </div>
      </Card>

      {/* 异常列表 */}
      <Card className="shadow-sm border-0 bg-white" extra={
        <span className="text-gray-500 text-sm">共 {total} 条异常</span>
      }>
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={exceptions}
            rowKey="id"
            pagination={{
              current: page,
              pageSize: limit,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, l) => { setPage(p); setLimit(l); },
            }}
            onRow={(record) => ({
              onClick: () => navigate(`/exceptions/${record.id}`),
              className: 'cursor-pointer hover:bg-blue-50 transition-colors',
            })}
            rowClassName="transition-colors"
          />
        </Spin>
      </Card>
    </div>
  );
}
