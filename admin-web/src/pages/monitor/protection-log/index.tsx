import { Button, Form, Input, Select, Space, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  exportProtectionLogs,
  getProtectionLogs,
  type ProtectionLogItem,
} from '@/api/log';
import { formatDateTime } from '@/utils/format';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

const ERROR_CODE_OPTIONS = [
  { label: 'AUTH_FAILED', value: 'AUTH_FAILED' },
  { label: 'LOGIN_LOCKED', value: 'LOGIN_LOCKED' },
  { label: 'WALLET_NOT_BOUND', value: 'WALLET_NOT_BOUND' },
  { label: 'WALLET_NOT_BOUND_FOR_USER', value: 'WALLET_NOT_BOUND_FOR_USER' },
  { label: 'WALLET_ADDRESS_MISMATCH', value: 'WALLET_ADDRESS_MISMATCH' },
  { label: 'WALLET_USER_DISABLED', value: 'WALLET_USER_DISABLED' },
  { label: 'LOGIN_TICKET_INVALID', value: 'LOGIN_TICKET_INVALID' },
  { label: 'WALLET_NONCE_INVALID', value: 'WALLET_NONCE_INVALID' },
  { label: 'WALLET_SIGNATURE_INVALID', value: 'WALLET_SIGNATURE_INVALID' },
  { label: 'WALLET_CHAIN_MISMATCH', value: 'WALLET_CHAIN_MISMATCH' },
  { label: 'WALLET_ADDRESS_INVALID', value: 'WALLET_ADDRESS_INVALID' },
  { label: 'LOGIN_MODE_WALLET_DISABLED', value: 'LOGIN_MODE_WALLET_DISABLED' },
  { label: 'LOGIN_MODE_PASSWORD_DISABLED', value: 'LOGIN_MODE_PASSWORD_DISABLED' },
];

const SEVERITY_COLOR: Record<string, string> = {
  info: 'default',
  warn: 'orange',
  high: 'red',
};

const SEVERITY_LABEL: Record<string, string> = {
  info: '信息',
  warn: '警告',
  high: '高危',
};

const CATEGORY_LABEL: Record<string, string> = {
  auth: '认证',
  wallet: '钱包',
};

/**
 * 防护日志页：认证/钱包安全事件筛选与 CSV 导出。
 */
export default function ProtectionLogPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProtectionLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{
    username?: string;
    category?: string;
    errorCode?: string;
    severity?: string;
  }>({});
  const [form] = Form.useForm();

  const loadData = async (p = page, ps = pageSize, f = filters) => {
    setLoading(true);
    try {
      const res = await getProtectionLogs({ page: p, pageSize: ps, ...f });
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
      category: values.category,
      errorCode: values.errorCode,
      severity: values.severity,
    };
    setFilters(cleaned);
    setPage(1);
    loadData(1, pageSize, cleaned);
  };

  const handleExport = async () => {
    try {
      await exportProtectionLogs(filters);
      message.success('导出成功');
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
        <Form.Item name="category" label="类别">
          <Select
            allowClear
            placeholder="全部"
            style={{ width: 100 }}
            options={[
              { label: '认证', value: 'auth' },
              { label: '钱包', value: 'wallet' },
            ]}
          />
        </Form.Item>
        <Form.Item name="errorCode" label="错误码">
          <Select allowClear placeholder="全部" style={{ width: 220 }} options={ERROR_CODE_OPTIONS} />
        </Form.Item>
        <Form.Item name="severity" label="级别">
          <Select
            allowClear
            placeholder="全部"
            style={{ width: 100 }}
            options={[
              { label: '信息', value: 'info' },
              { label: '警告', value: 'warn' },
              { label: '高危', value: 'high' },
            ]}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <AuthButton permission="log:protection" onClick={handleExport}>
              导出
            </AuthButton>
          </Space>
        </Form.Item>
      </Form>

      <PageTable<ProtectionLogItem>
        title="防护日志"
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
            title: '时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '类别',
            dataIndex: 'category',
            width: 70,
            render: (v: string) => CATEGORY_LABEL[v] ?? v,
          },
          { title: '事件', dataIndex: 'eventType', width: 180, ellipsis: true },
          { title: '错误码', dataIndex: 'errorCode', width: 180, ellipsis: true },
          { title: '用户名', dataIndex: 'username', width: 100 },
          { title: '钱包', dataIndex: 'walletAddress', width: 130 },
          { title: 'IP', dataIndex: 'ip', width: 130 },
          { title: '路径', dataIndex: 'path', width: 180, ellipsis: true },
          {
            title: '级别',
            dataIndex: 'severity',
            width: 80,
            render: (v: string) => (
              <Tag color={SEVERITY_COLOR[v] ?? 'default'}>{SEVERITY_LABEL[v] ?? v}</Tag>
            ),
          },
          { title: '消息', dataIndex: 'message', ellipsis: true },
        ]}
      />
    </>
  );
}
