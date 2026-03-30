import { useState, useEffect } from 'react';
import { Table, Tag, Input, Select, Button, Card, Row, Col, Statistic, Spin, Badge } from 'antd';
import { useNavigate } from 'react-router-dom';
import { api, ExceptionRecord, ExceptionStats } from '../api/client';
import { SyncOutlined, BugOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Search } = Input;

// SQL 生命周期阶段 - 统一灰色风格，只有异常阶段才显示彩色
const SQL_STAGES = [
  { stage: 'SUBMISSION', name: '查询提交', order: 1, icon: '📤', errorColor: '#8c8c8c' },
  { stage: 'CONNECTION', name: '连接/认证', order: 2, icon: '🔗', errorColor: '#f5222d' },
  { stage: 'PARSE', name: '语法解析', order: 3, icon: '📝', errorColor: '#f5222d' },
  { stage: 'SEMANTIC_ANALYSIS', name: '语义分析', order: 4, icon: '🔍', errorColor: '#f5222d' },
  { stage: 'LOGICAL_PLAN', name: '逻辑计划', order: 5, icon: '🔀', errorColor: '#f5222d' },
  { stage: 'LOGICAL_OPT', name: '逻辑优化', order: 6, icon: '⚡', errorColor: '#f5222d' },
  { stage: 'PHYSICAL_PLAN', name: '物理计划', order: 7, icon: '🗺️', errorColor: '#f5222d' },
  { stage: 'PHYSICAL_OPT', name: '物理优化', order: 8, icon: '🔧', errorColor: '#f5222d' },
  { stage: 'EXECUTION', name: '执行', order: 9, icon: '⚙️', errorColor: '#f5222d' },
  { stage: 'DATA_ACCESS', name: '数据访问', order: 10, icon: '📊', errorColor: '#f5222d' },
  { stage: 'RESULT_FETCH', name: '结果返回', order: 11, icon: '✅', errorColor: '#52c41a' },
];

// 异常类型配置
const EXCEPTION_TYPE_CONFIG: Record<string, { label: string; color: string; stage: string; icon: any }> = {
  // SUBMISSION
  SUBMISSION_ERROR: { label: '提交错误', color: '#8c8c8c', stage: 'SUBMISSION', icon: <ExclamationCircleOutlined /> },
  QUEUE_FULL: { label: '队列满', color: '#fa8c16', stage: 'SUBMISSION', icon: <ExclamationCircleOutlined /> },
  // CONNECTION
  CONNECTION_ERROR: { label: '连接错误', color: '#f5222d', stage: 'CONNECTION', icon: <CloseCircleOutlined /> },
  AUTH_ERROR: { label: '认证失败', color: '#f5222d', stage: 'CONNECTION', icon: <CloseCircleOutlined /> },
  SESSION_ERROR: { label: '会话错误', color: '#fa8c16', stage: 'CONNECTION', icon: <ExclamationCircleOutlined /> },
  // PARSE
  SYNTAX_ERROR: { label: '语法错误', color: '#f5222d', stage: 'PARSE', icon: <CloseCircleOutlined /> },
  // SEMANTIC_ANALYSIS
  SEMANTIC_ERROR: { label: '语义错误', color: '#f5222d', stage: 'SEMANTIC_ANALYSIS', icon: <CloseCircleOutlined /> },
  PERMISSION_DENIED: { label: '权限不足', color: '#f5222d', stage: 'SEMANTIC_ANALYSIS', icon: <CloseCircleOutlined /> },
  TYPE_ERROR: { label: '类型错误', color: '#fa8c16', stage: 'SEMANTIC_ANALYSIS', icon: <ExclamationCircleOutlined /> },
  // LOGICAL_PLAN
  LOGICAL_PLAN_ERROR: { label: '逻辑计划错误', color: '#f5222d', stage: 'LOGICAL_PLAN', icon: <CloseCircleOutlined /> },
  // LOGICAL_OPT
  LOGICAL_OPT_SKIP: { label: '逻辑优化跳过', color: '#1890ff', stage: 'LOGICAL_OPT', icon: <SyncOutlined /> },
  LOGICAL_OPT_ERROR: { label: '逻辑优化错误', color: '#fa8c16', stage: 'LOGICAL_OPT', icon: <ExclamationCircleOutlined /> },
  // PHYSICAL_PLAN
  PHYSICAL_PLAN_ERROR: { label: '物理计划错误', color: '#f5222d', stage: 'PHYSICAL_PLAN', icon: <CloseCircleOutlined /> },
  RESOURCE_LIMIT: { label: '资源限制', color: '#f5222d', stage: 'PHYSICAL_PLAN', icon: <CloseCircleOutlined /> },
  // PHYSICAL_OPT
  PHYSICAL_OPT_SKIP: { label: '物理优化跳过', color: '#1890ff', stage: 'PHYSICAL_OPT', icon: <SyncOutlined /> },
  PHYSICAL_OPT_ERROR: { label: '物理优化错误', color: '#fa8c16', stage: 'PHYSICAL_OPT', icon: <ExclamationCircleOutlined /> },
  // EXECUTION
  EXECUTION_ERROR: { label: '执行错误', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  LOCK_TIMEOUT: { label: '锁等待超时', color: '#fa8c16', stage: 'EXECUTION', icon: <ExclamationCircleOutlined /> },
  DEADLOCK: { label: '死锁', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  MEMORY_EXCEEDED: { label: '内存不足', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  TASK_TIMEOUT: { label: '任务超时', color: '#fa8c16', stage: 'EXECUTION', icon: <ExclamationCircleOutlined /> },
  MR_JOB_ERROR: { label: 'MR任务错误', color: '#f5222d', stage: 'EXECUTION', icon: <CloseCircleOutlined /> },
  // DATA_ACCESS
  DATA_ACCESS_ERROR: { label: '数据访问错误', color: '#f5222d', stage: 'DATA_ACCESS', icon: <CloseCircleOutlined /> },
  IO_ERROR: { label: 'IO错误', color: '#f5222d', stage: 'DATA_ACCESS', icon: <CloseCircleOutlined /> },
  TYPE_MISMATCH: { label: '类型不匹配', color: '#fa8c16', stage: 'DATA_ACCESS', icon: <ExclamationCircleOutlined /> },
  // RESULT_FETCH
  RESULT_ERROR: { label: '结果返回错误', color: '#fa8c16', stage: 'RESULT_FETCH', icon: <ExclamationCircleOutlined /> },
  // 优化阶段
  OPTIMIZATION_SKIP: { label: '优化跳过', color: '#1890ff', stage: 'PHYSICAL_OPT', icon: <SyncOutlined /> },
  OPTIMIZATION_WARN: { label: '优化错误', color: '#f5222d', stage: 'PHYSICAL_OPT', icon: <CloseCircleOutlined /> },
  // UNKNOWN
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
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  // 点击阶段筛选
  const handleStageClick = (stage: string) => {
    if (selectedStage === stage) {
      setSelectedStage(null);
    } else {
      setSelectedStage(stage);
    }
    setPage(1);
  };

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

  // 计算每个阶段的异常数量 - 基于统计数据，按异常类型映射到阶段
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
      width: 160,
      render: (text: string, record: ExceptionRecord) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded inline-block">
          {text || record.sessionHandle || '-'}
        </span>
      ),
    },
    {
      title: '异常类型',
      dataIndex: 'exceptionType',
      key: 'exceptionType',
      width: 110,
      render: (type: string) => {
        const config = EXCEPTION_TYPE_CONFIG[type] || { label: type, color: '#8c8c8c', icon: <BugOutlined /> };
        return (
          <Tag icon={config.icon} color={config.color} style={{ borderRadius: 6, fontSize: 12 }}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '阶段',
      dataIndex: 'sqlStage',
      key: 'sqlStage',
      width: 95,
      render: (stage: string, record: ExceptionRecord) => {
        const info = getStageInfo(stage);
        // 基于异常严重度设置颜色，而非基于该阶段是否有异常
        const severityColors: Record<string, string> = { HIGH: '#f5222d', MEDIUM: '#fa8c16', LOW: '#1890ff' };
        const color = severityColors[record.severity] || '#d9d9d9';
        return (
          <span style={{ color, fontWeight: 500, fontSize: 12 }}>
            {info?.icon} {getStageName(stage)}
          </span>
        );
      },
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 70,
      render: (severity: string) => {
        const colors: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'blue' };
        const labels: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };
        return <Badge color={colors[severity]} text={<span style={{ fontSize: 12 }}>{labels[severity]}</span>} />;
      },
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (msg: string) => (
        <span className="text-gray-600 text-xs" title={msg}>{msg}</span>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
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
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} md={6}>
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md hover:shadow-lg transition-shadow">
            <Statistic
              title={<span className="text-blue-100 text-xs">异常总数</span>}
              value={stats.reduce((sum, s) => sum + s.count, 0)}
              valueStyle={{ color: '#fff', fontSize: 28, fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-md hover:shadow-lg transition-shadow">
            <Statistic
              title={<span className="text-red-100 text-xs">高严重度</span>}
              value={getHighSeverityCount()}
              valueStyle={{ color: '#fff', fontSize: 28, fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-md hover:shadow-lg transition-shadow">
            <Statistic
              title={<span className="text-orange-100 text-xs">异常类型</span>}
              value={stats.length}
              valueStyle={{ color: '#fff', fontSize: 28, fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="bg-gradient-to-br from-green-500 to-green-600 border-0 shadow-md hover:shadow-lg transition-shadow">
            <Statistic
              title={<span className="text-green-100 text-xs">影响查询</span>}
              value={new Set(stats.flatMap(s => {
                const exs = exceptions.filter(e => e.exceptionType === s.exception_type);
                return exs.map(e => e.queryId).filter(Boolean);
              })).size || 0}
              valueStyle={{ color: '#fff', fontSize: 28, fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      {/* SQL 生命周期流程图 */}
      <Card className="mb-6 shadow-sm border-0" title={
        <span className="text-lg font-semibold">📊 SQL 执行生命周期</span>
      }>
        <div className="flex items-center justify-between overflow-x-auto py-4 px-4">
          {SQL_STAGES.map((stage, idx) => {
            const count = getStageCount(stage.stage);
            const hasError = count > 0;
            const isSelected = selectedStage === stage.stage;
            // 统一灰色风格，只有异常阶段才显示彩色（红色）
            const nodeColor = isSelected ? '#1890ff' : (hasError ? stage.errorColor : '#d9d9d9');
            const nodeBg = isSelected ? '#1890ff10' : (hasError ? `${stage.errorColor}10` : '#f5f5f5');

            return (
              <div key={stage.stage} className="flex items-center">
                {/* 阶段节点 */}
                <div
                  className={`
                    relative flex flex-col items-center justify-center
                    w-20 h-20 rounded-xl shadow-sm border-2
                    transition-all duration-300 hover:scale-105 cursor-pointer
                  `}
                  onClick={() => handleStageClick(stage.stage)}
                  style={{
                    borderColor: nodeColor,
                    backgroundColor: nodeBg,
                    boxShadow: isSelected ? `0 0 0 2px #1890ff50` : (hasError ? `0 4px 12px ${stage.errorColor}30` : '0 1px 3px rgba(0,0,0,0.05)')
                  }}
                >
                  {hasError && (
                    <Badge count={count} size="small" style={{ backgroundColor: stage.errorColor }} className="absolute -top-1 -right-1" />
                  )}
                  {isSelected && (
                    <span className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
                  )}
                  <span className={`text-2xl mb-0.5 ${hasError ? '' : 'opacity-40'}`}>{stage.icon}</span>
                  <span className={`text-xs font-medium ${hasError ? 'text-gray-800' : 'text-gray-400'}`}>
                    {stage.name}
                  </span>
                </div>
                {/* 连接线 - 统一灰色 */}
                {idx < SQL_STAGES.length - 1 && (
                  <div
                    className="w-6 h-0.5 mx-0.5 rounded-full"
                    style={{ background: '#e5e7eb' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 异常类型分布 */}
      <Card className="mb-6 shadow-sm border-0 bg-white" title={
        <span className="text-base font-semibold text-gray-700">
          {selectedStage ? `🎯 ${getStageName(selectedStage)} - 异常类型分布` : '🎯 异常类型分布'}
          {selectedStage && (
            <Button type="link" size="small" onClick={() => setSelectedStage(null)} className="ml-2">
              清除筛选
            </Button>
          )}
        </span>
      }>
        <div className="flex flex-wrap gap-2">
          {(() => {
            // 如果选中了阶段，则筛选该阶段的异常类型
            const filteredStats = selectedStage
              ? stats.filter(s => {
                  const config = EXCEPTION_TYPE_CONFIG[s.exception_type];
                  return config?.stage === selectedStage;
                })
              : stats;
            return filteredStats.slice(0, 15).map(stat => {
              const config = EXCEPTION_TYPE_CONFIG[stat.exception_type] || {
                label: stat.exception_type,
                color: '#8c8c8c',
                icon: <BugOutlined />
              };
              const isSelected = typeFilter === stat.exception_type;
              return (
                <div
                  key={stat.exception_type}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer
                    transition-all duration-200
                    ${isSelected ? 'ring-2 ring-offset-1' : 'hover:shadow-sm'}
                  `}
                  style={{
                    backgroundColor: isSelected ? `${config.color}20` : `${config.color}08`,
                    border: `1px solid ${isSelected ? config.color : `${config.color}30`}`
                  }}
                  onClick={() => {
                    setTypeFilter(typeFilter === stat.exception_type ? undefined : stat.exception_type);
                    setPage(1);
                  }}
                >
                  <span style={{ color: config.color, fontSize: 12 }}>{config.icon}</span>
                  <span className="text-xs font-medium" style={{ color: config.color }}>
                    {config.label}
                  </span>
                  <Badge
                    count={stat.count}
                    size="small"
                    style={{
                      backgroundColor: stat.severity === 'HIGH' ? '#f5222d' : stat.severity === 'MEDIUM' ? '#fa8c16' : '#1890ff',
                      fontSize: 10
                    }}
                  />
                </div>
              );
            });
          })()}
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
          <Button onClick={fetchExceptions} icon={<SyncOutlined spin={loading} />} loading={loading}>
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
