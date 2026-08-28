import { Button, Form, Input, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import {
  exportOperationLogs,
  getOperationLogs,
  type OperationLogItem,
} from '@/api/log';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';

import { toast } from '@/utils/toast';
const actionLabels: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  query: '查询',
};

/**
 * 操作日志页：分页筛选与 CSV 导出。
 */
export default function OperationLogPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OperationLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{ username?: string; module?: string }>({});
  const [form] = Form.useForm();

  const loadData = async (p = page, ps = pageSize, f = filters) => {
    setLoading(true);
    try {
      const res = await getOperationLogs({ page: p, pageSize: ps, ...f });
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
      module: values.module?.trim() || undefined,
    };
    setFilters(cleaned);
    setPage(1);
    loadData(1, pageSize, cleaned);
  };

  const handleExport = async () => {
    try {
      await exportOperationLogs(filters);
      toast.success('导出成功');
    } catch {
      // downloadCsv 已提示错误
    }
  };

  return (
    <>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="username" label="用户名">
          <Input allowClear placeholder="用户名" />
        </Form.Item>
        <Form.Item name="module" label="模块">
          <Input allowClear placeholder="模块名" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <AuthButton permission="log:operation" onClick={handleExport}>
              导出
            </AuthButton>
          </Space>
        </Form.Item>
      </Form>

      <PageTable<OperationLogItem>
        title="操作日志"
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
          { title: '用户名', dataIndex: 'username', width: 100 },
          { title: '模块', dataIndex: 'module', width: 100 },
          {
            title: '操作',
            dataIndex: 'action',
            width: 80,
            render: (v: string) => actionLabels[v] ?? v,
          },
          { title: '方法', dataIndex: 'method', width: 80 },
          { title: 'URL', dataIndex: 'url', ellipsis: true },
          { title: 'IP', dataIndex: 'ip', width: 120 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: number) => (
              <Tag color={v < 400 ? 'green' : 'red'}>{v}</Tag>
            ),
          },
          { title: '耗时(ms)', dataIndex: 'durationMs', width: 90 },
          { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => formatDateTime(v) },
        ]}
      />
    </>
  );
}
