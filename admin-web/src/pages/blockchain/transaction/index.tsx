import { Button, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  createTransaction,
  exportTransactions,
  getEnabledChains,
  getTransactions,
  syncTransaction,
  type TransactionItem,
} from '@/api/blockchain';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';

const statusColor: Record<string, string> = {
  pending: 'processing',
  success: 'success',
  failed: 'error',
};

const statusLabel: Record<string, string> = {
  pending: '待确认',
  success: '成功',
  failed: '失败',
};

const AUTO_REFRESH_MS = 15000;

/**
 * 链上交易记录：登记后后台不定时自动同步链上状态。
 */
export default function BlockchainTransactionPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TransactionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{ chainId?: number; status?: string }>({});
  const [chainOptions, setChainOptions] = useState<{ label: string; value: number }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [searchForm] = Form.useForm();
  const [createForm] = Form.useForm();

  const loadChains = async () => {
    const chains = await getEnabledChains();
    setChainOptions(chains.map((c) => ({ label: c.name, value: c.chainId })));
  };

  const loadData = useCallback(async (p = page, ps = pageSize, f = filters) => {
    setLoading(true);
    try {
      const res = await getTransactions({ page: p, pageSize: ps, ...f });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    loadChains();
    loadData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadData();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    const cleaned = {
      chainId: values.chainId,
      status: values.status,
    };
    setFilters(cleaned);
    setPage(1);
    loadData(1, pageSize, cleaned);
  };

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    await createTransaction(values);
    message.success('交易已登记，将自动同步链上状态');
    setModalOpen(false);
    createForm.resetFields();
    loadData();
  };

  const handleSync = async (id: number) => {
    setSyncingId(id);
    try {
      await syncTransaction(id);
      message.success('补同步完成');
      loadData();
    } finally {
      setSyncingId(null);
    }
  };

  const handleExport = async () => {
    try {
      await exportTransactions(filters);
      message.success('导出成功');
    } catch {
      // exportTransactions 已提示
    }
  };

  const chainName = (chainId: number) =>
    chainOptions.find((c) => c.value === chainId)?.label ?? String(chainId);

  return (
    <>
      <Form form={searchForm} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="chainId" label="链">
          <Select allowClear placeholder="全部" style={{ width: 160 }} options={chainOptions} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            allowClear
            placeholder="全部"
            style={{ width: 120 }}
            options={[
              { label: '待确认', value: 'pending' },
              { label: '成功', value: 'success' },
              { label: '失败', value: 'failed' },
            ]}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <AuthButton permission="tx:list" onClick={handleExport}>
              导出
            </AuthButton>
            <AuthButton permission="tx:create" type="primary" onClick={() => setModalOpen(true)}>
              登记交易
            </AuthButton>
          </Space>
        </Form.Item>
      </Form>

      <PageTable<TransactionItem>
        title="交易记录"
        toolbarExtra={<Tag color="processing">待确认交易由后台自动不定时同步</Tag>}
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
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '链', dataIndex: 'chainId', width: 110, render: (v: number) => chainName(v) },
          {
            title: '交易哈希',
            dataIndex: 'txHash',
            ellipsis: true,
            render: (v: string, record) =>
              record.explorerUrl ? (
                <a href={record.explorerUrl} target="_blank" rel="noreferrer">
                  {v}
                </a>
              ) : (
                v
              ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v: string) => <Tag color={statusColor[v] ?? 'default'}>{statusLabel[v] ?? v}</Tag>,
          },
          { title: '区块', dataIndex: 'blockNumber', width: 100, render: (v?: string) => v ?? '-' },
          { title: '业务单号', dataIndex: 'bizRef', width: 120, render: (v?: string) => v ?? '-' },
          {
            title: '上次同步',
            dataIndex: 'lastSyncedAt',
            width: 160,
            render: (v?: string) => (v ? formatDateTime(v) : '-'),
          },
          {
            title: '下次同步',
            dataIndex: 'nextSyncAt',
            width: 160,
            render: (v?: string, record?: TransactionItem) =>
              record?.status === 'pending' && v ? formatDateTime(v) : '-',
          },
          {
            title: '登记时间',
            dataIndex: 'createdAt',
            width: 160,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '操作',
            width: 100,
            render: (_, record) =>
              record.status === 'pending' ? (
                <AuthButton
                  type="link"
                  permission="tx:create"
                  loading={syncingId === record.id}
                  onClick={() => handleSync(record.id)}
                >
                  立即同步
                </AuthButton>
              ) : (
                '-'
              ),
          },
        ]}
      />

      <Modal title="登记交易哈希" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} destroyOnHidden>
        <Form form={createForm} layout="vertical">
          <Form.Item name="chainId" label="链" rules={[{ required: true }]}>
            <Select options={chainOptions} placeholder="选择链" />
          </Form.Item>
          <Form.Item
            name="txHash"
            label="交易哈希"
            rules={[
              { required: true },
              { pattern: /^0x[a-fA-F0-9]{64}$/, message: '哈希格式无效' },
            ]}
          >
            <Input placeholder="0x..." />
          </Form.Item>
          <Form.Item name="bizRef" label="业务单号">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
