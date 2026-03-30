import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Spin, Descriptions, Timeline, Typography, Alert, Tabs, Steps, Badge, Divider } from 'antd';
import { LeftOutlined, BugOutlined, WarningOutlined, CloseCircleOutlined, ExclamationCircleOutlined, SyncOutlined, ThunderboltOutlined, ExperimentOutlined, SettingOutlined, DatabaseOutlined, CloudServerOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api, ExceptionRecord, AssociatedLog } from '../api/client';

const { Text } = Typography;

const SQL_STAGES = [
  { stage: 'CONNECTION', name: '连接', order: 1, icon: <CloudServerOutlined />, color: '#1890ff', description: 'Driver 接收查询，建立会话连接' },
  { stage: 'COMPILATION', name: '编译', order: 2, icon: <ExperimentOutlined />, color: '#722ed1', description: '语法解析、语义分析、类型检查' },
  { stage: 'LOGICAL_PLAN', name: '逻辑计划', order: 3, icon: <SyncOutlined />, color: '#13c2c2', description: '生成逻辑操作符树' },
  { stage: 'OPTIMIZATION', name: '优化', order: 4, icon: <ThunderboltOutlined />, color: '#faad14', description: '列裁剪、谓词下推、join 优化' },
  { stage: 'PHYSICAL_PLAN', name: '物理计划', order: 5, icon: <SettingOutlined />, color: '#fa8c16', description: '生成 map/reduce 任务' },
  { stage: 'EXECUTION', name: '执行', order: 6, icon: <ExperimentOutlined />, color: '#f5222d', description: '执行 DAG 中的 stages' },
  { stage: 'DATA_SCAN', name: '数据扫描', order: 7, icon: <DatabaseOutlined />, color: '#eb2f96', description: '从 HDFS 读取数据' },
  { stage: 'RESULT', name: '结果返回', order: 8, icon: <CheckCircleOutlined />, color: '#52c41a', description: '返回查询结果' },
];

const EXCEPTION_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SYNTAX_ERROR: { label: '语法错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  SEMANTIC_ERROR: { label: '语义错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  PERMISSION_DENIED: { label: '权限不足', color: '#f5222d', icon: <CloseCircleOutlined /> },
  CONNECTION_ERROR: { label: '连接错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  AUTH_ERROR: { label: '认证失败', color: '#f5222d', icon: <CloseCircleOutlined /> },
  SESSION_ERROR: { label: '会话错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  OPTIMIZATION_WARN: { label: '优化警告', color: '#faad14', icon: <WarningOutlined /> },
  OPTIMIZATION_SKIP: { label: '优化跳过', color: '#1890ff', icon: <SyncOutlined /> },
  OPTIMIZATION_ERROR: { label: '优化错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  PHYSICAL_PLAN_ERROR: { label: '物理计划错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  RESOURCE_LIMIT: { label: '资源限制', color: '#f5222d', icon: <CloseCircleOutlined /> },
  EXECUTION_ERROR: { label: '执行错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  LOCK_TIMEOUT: { label: '锁等待超时', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  DEADLOCK: { label: '死锁', color: '#f5222d', icon: <CloseCircleOutlined /> },
  MEMORY_EXCEEDED: { label: '内存不足', color: '#f5222d', icon: <CloseCircleOutlined /> },
  TASK_TIMEOUT: { label: '任务超时', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  MR_JOB_ERROR: { label: 'MR任务错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  DATA_SCAN_ERROR: { label: '数据扫描错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  IO_ERROR: { label: 'IO错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  TYPE_MISMATCH: { label: '类型不匹配', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  LOGICAL_PLAN_ERROR: { label: '逻辑计划错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  RESULT_ERROR: { label: '结果返回错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  UNKNOWN: { label: '未知错误', color: '#8c8c8c', icon: <BugOutlined /> },
};

function getStageInfo(stage: string) {
  return SQL_STAGES.find(s => s.stage === stage) || SQL_STAGES[SQL_STAGES.length - 1];
}

function getStageIndex(stage: string): number {
  const found = SQL_STAGES.find(s => s.stage === stage);
  return found?.order || 9;
}

export default function ExceptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exception, setException] = useState<ExceptionRecord | null>(null);
  const [serverLogs, setServerLogs] = useState<AssociatedLog[]>([]);
  const [executorLogs, setExecutorLogs] = useState<AssociatedLog[]>([]);

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [detailRes, logsRes] = await Promise.all([
        api.getException(parseInt(id!)),
        api.getExceptionLogs(parseInt(id!)),
      ]);

      if (detailRes.data.success) {
        setException(detailRes.data.data);
      }
      if (logsRes.data.success) {
        setServerLogs(logsRes.data.data.serverLogs);
        setExecutorLogs(logsRes.data.data.executorLogs);
      }
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  };

  const renderLogTimeline = (logs: AssociatedLog[]) => {
    if (logs.length === 0) {
      return <div className="text-gray-500 text-center py-8">暂无日志</div>;
    }

    const items = logs.map(log => ({
      color: log.level === 'ERROR' ? 'red' : log.level === 'WARN' ? 'orange' : 'blue',
      children: (
        <div className="flex items-start gap-2">
          <span className="text-gray-400 shrink-0">
            {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
            log.level === 'ERROR' ? 'bg-red-900 text-red-300' :
            log.level === 'WARN' ? 'bg-yellow-900 text-yellow-300' :
            'bg-blue-900 text-blue-300'
          }`}>
            {log.level}
          </span>
          <span className="text-gray-500 shrink-0 max-w-[150px] truncate">{log.logger}</span>
          <pre className="text-gray-300 whitespace-pre-wrap break-all flex-1">
            {log.message.length > 300 ? log.message.slice(0, 300) + '...' : log.message}
          </pre>
        </div>
      ),
    }));

    return <Timeline items={items} />;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!exception) {
    return (
      <Card className="m-6">
        <Alert type="error" message="未找到该异常记录" />
      </Card>
    );
  }

  const exceptionConfig = EXCEPTION_TYPE_CONFIG[exception.exceptionType] || { label: exception.exceptionType, color: '#8c8c8c', icon: <BugOutlined /> };
  const currentStage = getStageInfo(exception.sqlStage || 'UNKNOWN');
  const currentStageIndex = getStageIndex(exception.sqlStage || 'UNKNOWN');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4 mb-6">
        <Button icon={<LeftOutlined />} onClick={() => navigate('/exceptions')} className="shadow-sm">
          返回列表
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">异常详情</h1>
          <Text type="secondary" className="text-sm">ID: {id}</Text>
        </div>
        <Tag icon={exceptionConfig.icon} color={exceptionConfig.color} className="text-base px-4 py-1">
          {exceptionConfig.label}
        </Tag>
      </div>

      {/* SQL 生命周期流程图 */}
      <Card className="mb-6 shadow-sm border-0" title={<span className="text-lg font-semibold">📊 SQL 执行生命周期</span>}>
        <Steps
          current={currentStageIndex - 1}
          status="error"
          size="small"
          className="px-4"
          items={SQL_STAGES.map(s => ({
            title: (
              <span className={s.order === currentStageIndex ? 'font-bold' : ''}>
                {s.icon} {s.name}
              </span>
            ),
            description: s.order === currentStageIndex ? (
              <span className="text-red-500 text-xs">⚠️ {currentStage.description}</span>
            ) : null,
            status: s.order === currentStageIndex ? 'error' : s.order < currentStageIndex ? 'finish' : 'wait',
          }))}
        />
      </Card>

      {/* 异常信息卡 */}
      <Card className="mb-6 shadow-sm border-0" title={<span className="font-semibold">📋 异常信息</span>}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Query ID" span={2}>
            <Text code copyable className="bg-gray-100 px-2 py-1 rounded">
              {exception.queryId || exception.sessionHandle || '-'}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="所属阶段">
            <Tag icon={currentStage.icon} color={currentStage.color}>
              {currentStage.name}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="严重程度">
            <Badge
              color={exception.severity === 'HIGH' ? '#f5222d' : exception.severity === 'MEDIUM' ? '#fa8c16' : '#1890ff'}
              text={exception.severity === 'HIGH' ? '高' : exception.severity === 'MEDIUM' ? '中' : '低'}
            />
          </Descriptions.Item>
          <Descriptions.Item label="发生时间">
            {new Date(exception.createdAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="来源节点">
            {exception.sourceNode || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="SQL" span={2}>
            {exception.sqlText ? (
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-40">
                {exception.sqlText}
              </pre>
            ) : <Text type="secondary">-</Text>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 修复建议 */}
      <Card
        className="mb-6 shadow-sm border-0"
        title={<span className="font-semibold">💡 修复建议</span>}
        style={{ background: `linear-gradient(135deg, ${currentStage.color}10, ${currentStage.color}05)` }}
      >
        <Alert
          type="info"
          message={exception.suggestion}
          showIcon
          icon={<ExclamationCircleOutlined style={{ color: currentStage.color }} />}
          style={{ borderRadius: 12 }}
        />
        <Divider />
        <div className="text-xs text-gray-500">
          <p><strong>阶段说明：</strong>{currentStage.description}</p>
        </div>
      </Card>

      {/* 错误信息 */}
      <Card className="mb-6 shadow-sm border-0" title={<span className="font-semibold">🔴 错误信息</span>}>
        <Alert
          type="error"
          message={<pre className="whitespace-pre-wrap text-sm font-mono">{exception.errorMessage}</pre>}
          style={{ borderRadius: 12 }}
        />
      </Card>

      {/* 日志 */}
      <Card className="shadow-sm border-0 bg-white" title={<span className="font-semibold">📜 关联日志</span>}>
        <Tabs
          items={[
            {
              key: 'server',
              label: (
                <span className="flex items-center gap-2">
                  Server 日志
                  <Badge count={serverLogs.length} style={{ backgroundColor: '#1890ff' }} />
                </span>
              ),
              children: <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs max-h-96 overflow-auto">
                {renderLogTimeline(serverLogs)}
              </div>,
            },
            {
              key: 'executor',
              label: (
                <span className="flex items-center gap-2">
                  Executor 日志
                  <Badge count={executorLogs.length} style={{ backgroundColor: '#722ed1' }} />
                </span>
              ),
              children: <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs max-h-96 overflow-auto">
                {renderLogTimeline(executorLogs)}
              </div>,
            },
            {
              key: 'all',
              label: (
                <span className="flex items-center gap-2">
                  完整时间线
                  <Badge count={serverLogs.length + executorLogs.length} style={{ backgroundColor: '#13c2c2' }} />
                </span>
              ),
              children: <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs max-h-96 overflow-auto">
                {renderLogTimeline(
                  [...serverLogs, ...executorLogs].sort(
                    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  )
                )}
              </div>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
