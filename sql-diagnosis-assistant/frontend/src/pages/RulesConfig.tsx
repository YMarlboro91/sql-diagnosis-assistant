import { useState, useEffect } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Select, Radio, Switch, message, Popconfirm, Upload, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { api, RuleRecord } from '../api/client';

const { TextArea } = Input;

// SQL 阶段选项
const SQL_STAGES = [
  { value: 'SUBMISSION', label: '查询提交', order: 1 },
  { value: 'CONNECTION', label: '连接/认证', order: 2 },
  { value: 'PARSE', label: '语法解析', order: 3 },
  { value: 'SEMANTIC_ANALYSIS', label: '语义分析', order: 4 },
  { value: 'LOGICAL_PLAN', label: '逻辑计划', order: 5 },
  { value: 'LOGICAL_OPT', label: '逻辑优化', order: 6 },
  { value: 'PHYSICAL_PLAN', label: '物理计划', order: 7 },
  { value: 'PHYSICAL_OPT', label: '物理优化', order: 8 },
  { value: 'EXECUTION', label: '执行', order: 9 },
  { value: 'DATA_ACCESS', label: '数据访问', order: 10 },
  { value: 'RESULT_FETCH', label: '结果返回', order: 11 },
];

// 异常类型选项
const EXCEPTION_TYPES = [
  { value: 'SUBMISSION_ERROR', label: 'SUBMISSION_ERROR' },
  { value: 'QUEUE_FULL', label: 'QUEUE_FULL' },
  { value: 'CONNECTION_ERROR', label: 'CONNECTION_ERROR' },
  { value: 'AUTH_ERROR', label: 'AUTH_ERROR' },
  { value: 'SESSION_ERROR', label: 'SESSION_ERROR' },
  { value: 'SYNTAX_ERROR', label: 'SYNTAX_ERROR' },
  { value: 'SEMANTIC_ERROR', label: 'SEMANTIC_ERROR' },
  { value: 'PERMISSION_DENIED', label: 'PERMISSION_DENIED' },
  { value: 'TYPE_ERROR', label: 'TYPE_ERROR' },
  { value: 'LOGICAL_PLAN_ERROR', label: 'LOGICAL_PLAN_ERROR' },
  { value: 'LOGICAL_OPT_SKIP', label: 'LOGICAL_OPT_SKIP' },
  { value: 'LOGICAL_OPT_ERROR', label: 'LOGICAL_OPT_ERROR' },
  { value: 'PHYSICAL_PLAN_ERROR', label: 'PHYSICAL_PLAN_ERROR' },
  { value: 'RESOURCE_LIMIT', label: 'RESOURCE_LIMIT' },
  { value: 'PHYSICAL_OPT_SKIP', label: 'PHYSICAL_OPT_SKIP' },
  { value: 'PHYSICAL_OPT_ERROR', label: 'PHYSICAL_OPT_ERROR' },
  { value: 'EXECUTION_ERROR', label: 'EXECUTION_ERROR' },
  { value: 'LOCK_TIMEOUT', label: 'LOCK_TIMEOUT' },
  { value: 'DEADLOCK', label: 'DEADLOCK' },
  { value: 'MEMORY_EXCEEDED', label: 'MEMORY_EXCEEDED' },
  { value: 'TASK_TIMEOUT', label: 'TASK_TIMEOUT' },
  { value: 'MR_JOB_ERROR', label: 'MR_JOB_ERROR' },
  { value: 'DATA_ACCESS_ERROR', label: 'DATA_ACCESS_ERROR' },
  { value: 'IO_ERROR', label: 'IO_ERROR' },
  { value: 'TYPE_MISMATCH', label: 'TYPE_MISMATCH' },
  { value: 'RESULT_ERROR', label: 'RESULT_ERROR' },
  { value: 'UNKNOWN', label: 'UNKNOWN' },
];

// 严重程度配置
const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  HIGH: { color: '#f5222d', label: '高' },
  MEDIUM: { color: '#fa8c16', label: '中' },
  LOW: { color: '#1890ff', label: '低' },
};

export default function RulesConfig() {
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await api.getRules();
      if (res.data.success) {
        setRules(res.data.data);
      }
    } catch (e) {
      message.error('获取规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (rule: RuleRecord) => {
    setEditingRule(rule);
    form.setFieldsValue({
      ...rule,
      patterns: rule.patterns.join('\n'),
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await api.deleteRule(id);
      if (res.data.success) {
        message.success('删除成功');
        fetchRules();
      }
    } catch (e) {
      message.error('删除失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const patterns = values.patterns
        .split('\n')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      const ruleData = {
        name: values.name,
        exceptionType: values.exceptionType,
        sqlStage: values.sqlStage,
        severity: values.severity,
        patterns,
        title: values.title,
        suggestion: values.suggestion,
        enabled: values.enabled ?? true,
        priority: values.priority ?? 0,
      };

      if (editingRule?.id) {
        await api.updateRule(editingRule.id, ruleData);
        message.success('更新成功');
      } else {
        await api.createRule(ruleData);
        message.success('创建成功');
      }

      setModalVisible(false);
      fetchRules();
    } catch (e) {
      message.error('保存失败');
    }
  };

  const handleToggleEnabled = async (rule: RuleRecord) => {
    try {
      await api.updateRule(rule.id!, { enabled: !rule.enabled });
      message.success(rule.enabled ? '已禁用' : '已启用');
      fetchRules();
    } catch (e) {
      message.error('操作失败');
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.exportRules();
      if (res.data.success) {
        const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rules.json';
        a.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
      }
    } catch (e) {
      message.error('导出失败');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const content = await file.text();
      const importedRules = JSON.parse(content);
      const res = await api.importRules(importedRules);
      if (res.data.success) {
        message.success(`导入成功: ${res.data.data.imported} 条规则`);
        if (res.data.data.errors.length > 0) {
          message.warning(`部分失败: ${res.data.data.errors.join(', ')}`);
        }
        fetchRules();
      }
    } catch (e) {
      message.error('导入失败');
    }
    return false;
  };

  const columns = [
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a: RuleRecord, b: RuleRecord) => a.priority - b.priority,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: RuleRecord) => (
        <Switch
          checked={enabled}
          onChange={() => handleToggleEnabled(record)}
          checkedChildren="启"
          unCheckedChildren="禁"
        />
      ),
    },
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '异常类型',
      dataIndex: 'exceptionType',
      key: 'exceptionType',
      width: 180,
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: 'SQL阶段',
      dataIndex: 'sqlStage',
      key: 'sqlStage',
      width: 120,
      render: (stage: string) => {
        const found = SQL_STAGES.find(s => s.value === stage);
        return found?.label || stage;
      },
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (severity: string) => (
        <Tag color={SEVERITY_CONFIG[severity]?.color}>
          {SEVERITY_CONFIG[severity]?.label}
        </Tag>
      ),
    },
    {
      title: '匹配模式',
      dataIndex: 'patterns',
      key: 'patterns',
      ellipsis: true,
      render: (patterns: string[]) => (
        <span className="text-xs font-mono">
          {patterns?.slice(0, 2).join(' | ')}
          {patterns?.length > 2 && ` (+${patterns.length - 2})`}
        </span>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: RuleRecord) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确定删除此规则?"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* 标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">规则配置</h1>
        <p className="text-gray-500 text-sm">配置异常检测规则，通过正则表达式匹配日志内容</p>
      </div>

      {/* 操作栏 */}
      <div className="mb-4 flex justify-between items-center">
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建规则
          </Button>
        </Space>
        <Space>
          <Upload
            accept=".json"
            showUploadList={false}
            beforeUpload={handleImport}
          >
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出
          </Button>
        </Space>
      </div>

      {/* 规则列表 */}
      <div className="bg-white rounded-lg shadow-sm">
        <Table
          columns={columns}
          dataSource={rules}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条规则`,
          }}
        />
      </div>

      {/* 创建/编辑弹窗 */}
      <Modal
        title={editingRule ? '编辑规则' : '新建规则'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="name"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="例如: 表不存在错误" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="exceptionType"
              label="异常类型"
              rules={[{ required: true, message: '请选择异常类型' }]}
            >
              <Select
                placeholder="选择异常类型"
                options={EXCEPTION_TYPES.map(t => ({ value: t.value, label: t.label }))}
              />
            </Form.Item>

            <Form.Item
              name="sqlStage"
              label="SQL阶段"
              rules={[{ required: true, message: '请选择SQL阶段' }]}
            >
              <Select
                placeholder="选择SQL阶段"
                options={SQL_STAGES.map(s => ({ value: s.value, label: s.label }))}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="severity"
            label="严重程度"
            rules={[{ required: true, message: '请选择严重程度' }]}
          >
            <Radio.Group>
              <Radio.Button value="HIGH">
                <span className="text-red-600">高</span>
              </Radio.Button>
              <Radio.Button value="MEDIUM">
                <span className="text-orange-500">中</span>
              </Radio.Button>
              <Radio.Button value="LOW">
                <span className="text-blue-600">低</span>
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="patterns"
            label="匹配模式 (正则表达式)"
            rules={[{ required: true, message: '请输入至少一个匹配模式' }]}
            extra="每行一个正则表达式，只要匹配任一模式即触发此规则"
          >
            <TextArea
              rows={4}
              placeholder={'Table.*not found\nexecuteQuery.*failed'}
            />
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="例如: 表不存在" />
          </Form.Item>

          <Form.Item
            name="suggestion"
            label="诊断建议"
            rules={[{ required: true, message: '请输入诊断建议' }]}
          >
            <TextArea rows={3} placeholder="例如: 检查表名拼写是否正确，确认是否在正确的数据库中" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="enabled" label="启用状态" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>

            <Form.Item name="priority" label="优先级">
              <Input type="number" placeholder="0" min={0} max={100} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
