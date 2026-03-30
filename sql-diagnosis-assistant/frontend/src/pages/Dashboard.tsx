import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Spin } from 'antd';
import { api, ExceptionStats } from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState<ExceptionStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.getStats();
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const total = stats.reduce((sum, s) => sum + s.count, 0);
  const highSeverity = stats.filter(s => s.severity === 'HIGH').reduce((sum, s) => sum + s.count, 0);

  return (
    <Spin spinning={loading}>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="异常总数" value={total} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="高严重度异常"
              value={highSeverity}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="异常类型数"
              value={stats.length}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} className="mt-4">
        {stats.map(stat => (
          <Col span={6} key={stat.exception_type}>
            <Card size="small">
              <Statistic
                title={stat.exception_type}
                value={stat.count}
                valueStyle={{
                  color: stat.severity === 'HIGH' ? '#cf1322' :
                         stat.severity === 'MEDIUM' ? '#fa8c16' : '#3f8600'
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Spin>
  );
}
