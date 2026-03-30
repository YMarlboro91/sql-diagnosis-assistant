import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Spin, Descriptions, Timeline, Typography, Alert, Tabs, Steps, Badge, Divider, Empty } from 'antd';
import {
  LeftOutlined, BugOutlined, WarningOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  SyncOutlined, ThunderboltOutlined, ExperimentOutlined, SettingOutlined, DatabaseOutlined,
  CloudServerOutlined, CheckCircleOutlined, FileTextOutlined, HddOutlined, AlertOutlined,
  BarChartOutlined, LinuxOutlined, ToolOutlined
} from '@ant-design/icons';
import { api, ExceptionRecord, AssociatedLog } from '../api/client';

const { Text, Paragraph } = Typography;

// SQL 生命周期阶段 (11阶段)
const SQL_STAGES = [
  { stage: 'SUBMISSION', name: '查询提交', order: 1, icon: <FileTextOutlined />, color: '#8c8c8c', description: 'Driver 接收用户提交的 SQL 查询' },
  { stage: 'CONNECTION', name: '连接/认证', order: 2, icon: <CloudServerOutlined />, color: '#1890ff', description: '建立连接、认证、会话初始化' },
  { stage: 'PARSE', name: '语法解析', order: 3, icon: <ExperimentOutlined />, color: '#722ed1', description: 'SQL 解析成 AST' },
  { stage: 'SEMANTIC_ANALYSIS', name: '语义分析', order: 4, icon: <ToolOutlined />, color: '#13c2c2', description: '类型检查、表/列解析、权限校验' },
  { stage: 'LOGICAL_PLAN', name: '逻辑计划', order: 5, icon: <SyncOutlined />, color: '#2db7f5', description: '生成逻辑操作符树' },
  { stage: 'LOGICAL_OPT', name: '逻辑优化', order: 6, icon: <ThunderboltOutlined />, color: '#faad14', description: '列裁剪、谓词下推、分区裁剪' },
  { stage: 'PHYSICAL_PLAN', name: '物理计划', order: 7, icon: <SettingOutlined />, color: '#fa8c16', description: '生成 MapReduce/Tez/Spark 任务' },
  { stage: 'PHYSICAL_OPT', name: '物理优化', order: 8, icon: <BarChartOutlined />, color: '#eb2f96', description: 'Join 顺序、任务并行度、内存估算' },
  { stage: 'EXECUTION', name: '执行', order: 9, icon: <ExperimentOutlined />, color: '#f5222d', description: 'Execution Engine 运行 DAG 中的 stages' },
  { stage: 'DATA_ACCESS', name: '数据访问', order: 10, icon: <DatabaseOutlined />, color: '#fa541c', description: '访问 HDFS/Metastore 获取数据' },
  { stage: 'RESULT_FETCH', name: '结果返回', order: 11, icon: <CheckCircleOutlined />, color: '#52c41a', description: '结果集组装、返回客户端' },
];

// 异常类型配置
const EXCEPTION_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  // SUBMISSION
  SUBMISSION_ERROR: { label: '提交错误', color: '#8c8c8c', icon: <ExclamationCircleOutlined /> },
  QUEUE_FULL: { label: '队列满', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // CONNECTION
  CONNECTION_ERROR: { label: '连接错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  AUTH_ERROR: { label: '认证失败', color: '#f5222d', icon: <CloseCircleOutlined /> },
  SESSION_ERROR: { label: '会话错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // PARSE
  SYNTAX_ERROR: { label: '语法错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  // SEMANTIC_ANALYSIS
  SEMANTIC_ERROR: { label: '语义错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  PERMISSION_DENIED: { label: '权限不足', color: '#f5222d', icon: <CloseCircleOutlined /> },
  TYPE_ERROR: { label: '类型错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // LOGICAL_PLAN
  LOGICAL_PLAN_ERROR: { label: '逻辑计划错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  // LOGICAL_OPT
  LOGICAL_OPT_SKIP: { label: '逻辑优化跳过', color: '#1890ff', icon: <SyncOutlined /> },
  LOGICAL_OPT_ERROR: { label: '逻辑优化错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // PHYSICAL_PLAN
  PHYSICAL_PLAN_ERROR: { label: '物理计划错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  RESOURCE_LIMIT: { label: '资源限制', color: '#f5222d', icon: <CloseCircleOutlined /> },
  // PHYSICAL_OPT
  PHYSICAL_OPT_SKIP: { label: '物理优化跳过', color: '#1890ff', icon: <SyncOutlined /> },
  PHYSICAL_OPT_ERROR: { label: '物理优化错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // EXECUTION
  EXECUTION_ERROR: { label: '执行错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  LOCK_TIMEOUT: { label: '锁等待超时', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  DEADLOCK: { label: '死锁', color: '#f5222d', icon: <CloseCircleOutlined /> },
  MEMORY_EXCEEDED: { label: '内存不足', color: '#f5222d', icon: <CloseCircleOutlined /> },
  TASK_TIMEOUT: { label: '任务超时', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  MR_JOB_ERROR: { label: 'MR任务错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  // DATA_ACCESS
  DATA_ACCESS_ERROR: { label: '数据访问错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  IO_ERROR: { label: 'IO错误', color: '#f5222d', icon: <CloseCircleOutlined /> },
  TYPE_MISMATCH: { label: '类型不匹配', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // RESULT_FETCH
  RESULT_ERROR: { label: '结果返回错误', color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  // UNKNOWN
  UNKNOWN: { label: '未知错误', color: '#8c8c8c', icon: <BugOutlined /> },
};

// 诊断类型配置
const DIAGNOSIS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  HIGH: { color: '#f5222d', icon: <CloseCircleOutlined /> },
  MEDIUM: { color: '#fa8c16', icon: <ExclamationCircleOutlined /> },
  LOW: { color: '#1890ff', icon: <WarningOutlined /> },
  INFO: { color: '#52c41a', icon: <CheckCircleOutlined /> },
};

// 技能包配置
const SKILL_PACKAGES = [
  { key: 'log', label: '日志诊断', icon: <FileTextOutlined />, color: '#1890ff' },
  { key: 'jmap', label: 'JVM堆内存', icon: <HddOutlined />, color: '#722ed1' },
  { key: 'jstack', label: 'JVM线程', icon: <AlertOutlined />, color: '#13c2c2' },
  { key: 'jstat', label: 'GC统计', icon: <BarChartOutlined />, color: '#faad14' },
  { key: 'linux', label: '系统资源', icon: <LinuxOutlined />, color: '#fa8c16' },
];

function getStageInfo(stage: string) {
  return SQL_STAGES.find(s => s.stage === stage) || SQL_STAGES[SQL_STAGES.length - 1];
}

function getStageIndex(stage: string): number {
  const found = SQL_STAGES.find(s => s.stage === stage);
  return found?.order || 99;
}

export default function ExceptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exception, setException] = useState<ExceptionRecord | null>(null);
  const [serverLogs, setServerLogs] = useState<AssociatedLog[]>([]);
  const [executorLogs, setExecutorLogs] = useState<AssociatedLog[]>([]);
  const [activeSkillTab, setActiveSkillTab] = useState('log');

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
      return <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    const items = logs.map(log => ({
      color: log.level === 'ERROR' ? 'red' : log.level === 'WARN' ? 'orange' : 'blue',
      children: (
        <div className="flex items-start gap-2 py-1">
          <span className="text-gray-400 shrink-0 text-xs">
            {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
            log.level === 'ERROR' ? 'bg-red-900 text-red-300' :
            log.level === 'WARN' ? 'bg-yellow-900 text-yellow-300' :
            'bg-blue-900 text-blue-300'
          }`}>
            {log.level}
          </span>
          <span className="text-gray-500 shrink-0 max-w-[120px] truncate text-xs">{log.logger}</span>
          <pre className="text-gray-300 whitespace-pre-wrap break-all flex-1 text-xs">
            {log.message.length > 200 ? log.message.slice(0, 200) + '...' : log.message}
          </pre>
        </div>
      ),
    }));

    return <Timeline items={items} className="mt-4" />;
  };

  // 模拟诊断结果（实际应该从API获取）
  const mockDiagnoses = exception ? [
    {
      skillPackage: 'log',
      diagnosisType: 'exception_match',
      severity: exception.severity as 'HIGH' | 'MEDIUM' | 'LOW',
      title: `匹配规则: ${EXCEPTION_TYPE_CONFIG[exception.exceptionType]?.label || exception.exceptionType}`,
      description: exception.errorMessage,
      suggestion: exception.suggestion,
    },
    {
      skillPackage: 'log',
      diagnosisType: 'error_density',
      severity: 'MEDIUM',
      title: '错误日志密度较高',
      description: `在相关日志中发现 ${serverLogs.filter(l => l.level === 'ERROR').length} 条 ERROR 级别日志`,
      suggestion: '建议检查最近的代码变更或数据异常',
    },
  ] : [];

  const renderDiagnosis = () => {
    if (mockDiagnoses.length === 0) {
      return <Empty description="暂无诊断结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    // 按技能包分组
    const bySkill = mockDiagnoses.reduce((acc, d) => {
      if (!acc[d.skillPackage]) acc[d.skillPackage] = [];
      acc[d.skillPackage].push(d);
      return acc;
    }, {} as Record<string, typeof mockDiagnoses>);

    // 按严重度排序
    const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
    const sortedDiagnoses = [...mockDiagnoses].sort(
      (a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99)
    );

    return (
      <div className="space-y-4">
        {/* 技能包选择器 */}
        <div className="flex gap-2 mb-4">
          {SKILL_PACKAGES.map(skill => (
            <Tag
              key={skill.key}
              icon={skill.icon}
              color={activeSkillTab === skill.key ? skill.color : undefined}
              onClick={() => setActiveSkillTab(skill.key)}
              className={`cursor-pointer px-3 py-1 ${
                activeSkillTab === skill.key ? 'ring-2 ring-offset-1' : 'opacity-60 hover:opacity-100'
              }`}
              style={{ borderColor: activeSkillTab === skill.key ? skill.color : undefined }}
            >
              {skill.label}
              {bySkill[skill.key] && (
                <Badge
                  count={bySkill[skill.key].length}
                  size="small"
                  style={{ backgroundColor: skill.color, marginLeft: 8 }}
                />
              )}
            </Tag>
          ))}
        </div>

        {/* 诊断结果列表 */}
        {sortedDiagnoses
          .filter(d => d.skillPackage === activeSkillTab)
          .map((diagnosis, idx) => {
            const config = DIAGNOSIS_CONFIG[diagnosis.severity] || DIAGNOSIS_CONFIG.INFO;
            return (
              <Card
                key={idx}
                size="small"
                className="border-l-4 shadow-sm"
                style={{ borderLeftColor: config.color }}
              >
                <div className="flex items-start gap-3">
                  <Tag icon={config.icon} color={config.color} className="shrink-0">
                    {diagnosis.severity === 'HIGH' ? '高' : diagnosis.severity === 'MEDIUM' ? '中' : diagnosis.severity === 'LOW' ? '低' : '信息'}
                  </Tag>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800 mb-1">{diagnosis.title}</div>
                    {diagnosis.description && (
                      <Paragraph type="secondary" className="text-xs mb-2" ellipsis={{ rows: 2 }}>
                        {diagnosis.description}
                      </Paragraph>
                    )}
                    {diagnosis.suggestion && (
                      <Alert
                        type="info"
                        message={<span className="text-xs">{diagnosis.suggestion}</span>}
                        className="bg-blue-50 border-blue-200"
                      />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

        {sortedDiagnoses.filter(d => d.skillPackage === activeSkillTab).length === 0 && (
          <Empty description={`${SKILL_PACKAGES.find(s => s.key === activeSkillTab)?.label} 暂无诊断结果`} />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
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
        <Button icon={<LeftOutlined />} onClick={() => navigate('/exceptions')} className="shadow-sm bg-white">
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
      <Card className="mb-6 shadow-sm border-0 bg-white" title={<span className="text-lg font-semibold">📊 SQL 执行生命周期</span>}>
        <Steps
          current={currentStageIndex - 1}
          status="error"
          size="small"
          className="px-4"
          items={SQL_STAGES.map(s => ({
            title: (
              <span className={`text-xs ${s.order === currentStageIndex ? 'font-bold text-red-600' : ''}`}>
                {s.icon} {s.name}
              </span>
            ),
            description: s.order === currentStageIndex ? (
              <span className="text-red-500 text-xs">⚠️ 当前阶段</span>
            ) : null,
            status: s.order === currentStageIndex ? 'error' : s.order < currentStageIndex ? 'finish' : 'wait',
          }))}
        />
      </Card>

      {/* 异常信息卡 */}
      <Card className="mb-6 shadow-sm border-0 bg-white" title={<span className="font-semibold">📋 异常信息</span>}>
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

      {/* 诊断结果 */}
      <Card className="mb-6 shadow-sm border-0 bg-white" title={<span className="font-semibold">🔍 智能诊断</span>}>
        {renderDiagnosis()}
      </Card>

      {/* 修复建议 */}
      <Card
        className="mb-6 shadow-sm border-0 bg-white"
        title={<span className="font-semibold">💡 修复建议</span>}
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
      <Card className="mb-6 shadow-sm border-0 bg-white" title={<span className="font-semibold">🔴 错误信息</span>}>
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
