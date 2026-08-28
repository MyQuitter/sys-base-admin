import { Button, Form, Input, InputNumber, Modal, Select, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import {
  checkChainHealth,
  createChain,
  deleteChain,
  getChain,
  getChains,
  updateChain,
  type ChainItem,
} from '@/api/blockchain';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

/**
 * 区块链链管理：RPC 配置、探活与钱包登录链开关。
 */
export default function BlockchainChainPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChainItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChainItem | null>(null);
  const [healthLoadingId, setHealthLoadingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const loadData = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getChains({ page: p, pageSize: ps });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, loginEnabled: 1, nativeSymbol: 'ETH', sort: 0 });
    setModalOpen(true);
  };

  const openEdit = async (record: ChainItem) => {
    setEditing(record);
    const detail = await getChain(record.id);
    form.setFieldsValue({
      ...detail,
      rpcUrlsText: detail.rpcUrls.join('\n'),
      wssUrlsText: detail.wssUrls?.join('\n') ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const rpcUrls = String(values.rpcUrlsText || '')
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const wssUrls = String(values.wssUrlsText || '')
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (!rpcUrls.length) {
      toast.error('请至少填写一个 RPC 地址');
      return;
    }
    const payload = {
      chainId: values.chainId,
      name: values.name,
      nativeSymbol: values.nativeSymbol,
      rpcUrls,
      wssUrls: wssUrls.length ? wssUrls : undefined,
      explorerUrl: values.explorerUrl,
      status: values.status,
      loginEnabled: values.loginEnabled,
      sort: values.sort,
    };
    if (editing) {
      const { chainId: _c, ...rest } = payload;
      await updateChain(editing.id, rest);
      toast.success('链配置已更新');
    } else {
      await createChain(payload);
      toast.success('链配置已创建');
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    await deleteChain(id);
    toast.success('已删除');
    loadData();
  };

  const handleHealth = async (id: number) => {
    setHealthLoadingId(id);
    try {
      const res = await checkChainHealth(id);
      if (res.ok) {
        toast.success(`探活成功：区块 ${res.blockNumber}，延迟 ${res.latencyMs}ms`);
      } else {
        toast.error(res.error ?? '探活失败');
      }
    } finally {
      setHealthLoadingId(null);
    }
  };

  return (
    <>
      <PageTable<ChainItem>
        title="链管理"
        loading={loading}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
          loadData(p, ps);
        }}
        onCreate={openCreate}
        createPermission="chain:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: 'Chain ID', dataIndex: 'chainId', width: 100 },
          { title: '名称', dataIndex: 'name', width: 140 },
          { title: '原生币', dataIndex: 'nativeSymbol', width: 80 },
          {
            title: 'RPC',
            dataIndex: 'rpcUrls',
            ellipsis: true,
            render: (urls: string[]) => urls?.join(', ') ?? '-',
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: number) => <Tag color={v === 1 ? 'green' : 'default'}>{v === 1 ? '启用' : '禁用'}</Tag>,
          },
          {
            title: '钱包登录',
            dataIndex: 'loginEnabled',
            width: 90,
            render: (v: number) => (v === 1 ? '是' : '否'),
          },
          { title: '排序', dataIndex: 'sort', width: 60 },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 170,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <Space size="small">
                <AuthButton type="link" permission="chain:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <Button
                  type="link"
                  loading={healthLoadingId === record.id}
                  onClick={() => handleHealth(record.id)}
                >
                  探活
                </Button>
                <AuthButton type="link" danger permission="chain:delete" onClick={() => handleDelete(record.id)}>
                  删除
                </AuthButton>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑链配置' : '新建链配置'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical">
          {!editing ? (
            <Form.Item name="chainId" label="Chain ID" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
          <Form.Item name="name" label="链名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nativeSymbol" label="原生币符号" rules={[{ required: true }]}>
            <Input placeholder="ETH / BNB / MATIC" />
          </Form.Item>
          <Form.Item name="rpcUrlsText" label="RPC 地址（每行一个）" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="https://..." />
          </Form.Item>
          <Form.Item
            name="wssUrlsText"
            label="WebSocket RPC（可选，每行一个）"
            extra="配置后事件订阅可秒级推送，HTTP 轮询仍作补漏"
          >
            <Input.TextArea rows={2} placeholder="wss://..." />
          </Form.Item>
          <Form.Item name="explorerUrl" label="区块浏览器">
            <Input placeholder="https://etherscan.io" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="loginEnabled" label="允许钱包登录" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
