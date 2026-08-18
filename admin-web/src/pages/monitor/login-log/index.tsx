import { Button, Form, Input, Select, Space, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { exportLoginLogs, getLoginLogs, type LoginLogItem } from '@/api/log';
import { formatDateTime } from '@/utils/format';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

/**
 * 登录日志页：成功/失败筛选与 CSV 导出。
 */
export default function LoginLogPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LoginLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{ username?: string; status?: number; userType?: string }>({});
  const [form] = Form.useForm();

  const loadData = async (p = page, ps = pageSize, f = filters) => {
    setLoading(true);
    try {
      const res = await getLoginLogs({ page: p, pageSize: ps, ...f });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSearch = () => {
    const values = form.getFieldsValue();
    const cleaned = {
      username: values.username?.trim() || undefined,
      status: values.status,
      userType: values.userType,
    };
    setFilters(cleaned);
    setPage(1);
    loadData(1, pageSize, cleaned);
  };

  const handleExport = async () => {
    try {
      await exportLoginLogs(filters);
      message.success('导出成功');
    } catch {
      // downloadCsv 已提示错误
    }
  };

  return (
    <>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="username" label="账号">
          <Input allowClear placeholder="用户名/手机/邮箱" />
        </Form.Item>
        <Form.Item name="userType" label="用户类型">
          <Select
            allowClear
            placeholder="全部"
            style={{ width: 120 }}
            options={[
              { label: '后台用户', value: 'admin' },
              { label: '会员用户', value: 'member' },
            ]}
          />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            allowClear
            placeholder="全部"
            style={{ width: 120 }}
            options={[
              { label: '成功', value: 1 },
              { label: '失败', value: 0 },
            ]}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <AuthButton permission="log:login" onClick={handleExport}>
              导出
            </AuthButton>
          </Space>
        </Form.Item>
      </Form>

      <PageTable<LoginLogItem>
        title="登录日志"
        loading={loading}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        pagination
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
          loadData(p, ps);
        }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          {
            title: '用户类型',
            dataIndex: 'userType',
            width: 90,
            render: (v?: string) => (v === 'member' ? '会员用户' : '后台用户'),
          },
          { title: '账号', dataIndex: 'username', width: 140 },
          { title: '用户ID', dataIndex: 'userId', width: 80 },
          { title: 'IP', dataIndex: 'ip', width: 140 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: number) => (
              <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '成功' : '失败'}</Tag>
            ),
          },
          {
            title: '登录方式',
            dataIndex: 'loginType',
            width: 90,
            render: (v?: string) => {
              const map: Record<string, { color: string; label: string }> = {
                password: { color: 'blue', label: '密码' },
                wallet: { color: 'purple', label: '钱包' },
                both: { color: 'geekblue', label: '双重' },
              };
              const item = map[v ?? 'password'] ?? map.password;
              return <Tag color={item.color}>{item.label}</Tag>;
            },
          },
          { title: '消息', dataIndex: 'message', ellipsis: true },
          { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => formatDateTime(v) },
        ]}
      />
    </>
  );
}
