import { Card, Col, Progress, Row, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getSystemStatus, type SystemStatus } from '@/api/monitor';

/** 字节转 MB 便于展示 */
function toMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1);
}

/** 秒数格式化为「天时分」 */
function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}天 ${h}时 ${m}分`;
}

/**
 * 系统监控页：CPU 负载、内存、依赖连通性，每 10 秒自动刷新。
 */
export default function SystemMonitorPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSystemStatus();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, []);

  const memPercent = status
    ? Math.round((status.memory.systemUsed / status.memory.systemTotal) * 100)
    : 0;

  return (
    <div>
      <Typography.Title level={4}>系统监控</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} title="服务状态">
            <Tag color={status?.status === 'ok' ? 'green' : 'orange'}>
              {status?.status === 'ok' ? '正常' : '降级'}
            </Tag>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} title="运行时长">
            <Statistic value={status ? formatUptime(status.uptime) : '-'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} title="MySQL">
            <Tag color={status?.mysql === 'up' ? 'green' : 'red'}>
              {status?.mysql === 'up' ? '连通' : '断开'}
            </Tag>
            <div style={{ marginTop: 8 }}>连接数：{status?.dbConnections ?? '-'}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} title="Redis">
            <Tag color={status?.redis === 'up' ? 'green' : 'red'}>
              {status?.redis === 'up' ? '连通' : '断开'}
            </Tag>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card loading={loading} title="系统内存">
            <Progress percent={memPercent} status={memPercent > 85 ? 'exception' : 'active'} />
            <div style={{ marginTop: 8 }}>
              已用 {status ? toMb(status.memory.systemUsed) : '-'} MB / 总计{' '}
              {status ? toMb(status.memory.systemTotal) : '-'} MB
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card loading={loading} title="进程内存 (Node)">
            <div>堆内存：{status ? toMb(status.memory.heapUsed) : '-'} MB</div>
            <div>堆总量：{status ? toMb(status.memory.heapTotal) : '-'} MB</div>
            <div>RSS：{status ? toMb(status.memory.rss) : '-'} MB</div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card loading={loading} title="运行环境">
            <Row gutter={16}>
              <Col span={8}>平台：{status?.platform ?? '-'}</Col>
              <Col span={8}>Node：{status?.nodeVersion ?? '-'}</Col>
              <Col span={8}>
                CPU 负载(1/5/15min)：{status?.cpuLoad.map((v) => v.toFixed(2)).join(' / ') ?? '-'}
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
