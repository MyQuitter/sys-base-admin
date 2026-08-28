import { Alert, Form, Input, Modal, Popconfirm, Select, Space, Tag, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createContract,
  deleteContract,
  getContractListenOptions,
  getContracts,
  getEnabledChains,
  subscribeContractTransfer,
  syncContractTransactions,
  updateContract,
  type ContractItem,
  type ContractListenOptions,
} from '@/api/blockchain';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

const contractTypeOptions = [
  { label: 'ERC20', value: 'erc20' },
  { label: 'ERC721', value: 'erc721' },
  { label: '通用', value: 'generic' },
];

/**
 * 区块链合约登记页。
 */
export default function BlockchainContractPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ContractItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [chainOptions, setChainOptions] = useState<{ label: string; value: number }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContractItem | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [listenGuide, setListenGuide] = useState<ContractListenOptions | null>(null);
  const [form] = Form.useForm();

  const loadChains = async () => {
    const chains = await getEnabledChains();
    setChainOptions(chains.map((c) => ({ label: c.name, value: c.chainId })));
  };

  const loadData = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getContracts({ page: p, pageSize: ps });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChains();
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, contractType: 'generic' });
    setModalOpen(true);
  };

  const openEdit = (record: ContractItem) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateContract(editing.id, values);
      toast.success('合约已更新');
    } else {
      await createContract(values);
      toast.success('合约已登记');
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    await deleteContract(id);
    toast.success('已删除');
    loadData();
  };

  const handleSync = async (id: number, reset = false) => {
    setSyncingId(id);
    try {
      const res = await syncContractTransactions(id, reset ? { reset: true } : undefined);
      toast.success(
        `浏览器同步完成：新增 ${res.imported} 条，跳过 ${res.skipped} 条${res.lastBlock ? `，区块至 ${res.lastBlock}` : ''}`,
      );
      loadData();
    } finally {
      setSyncingId(null);
    }
  };

  const handleSubscribeTransfer = async (id: number) => {
    setSubscribingId(id);
    try {
      await subscribeContractTransfer(id);
      toast.success('已创建 Transfer 事件订阅，将通过 RPC 自动监听');
      navigate('/blockchain/event-subscription');
    } finally {
      setSubscribingId(null);
    }
  };

  const showListenGuide = async (record: ContractItem) => {
    const guide = await getContractListenOptions(record.id);
    setListenGuide(guide);
  };

  const chainName = (chainId: number) =>
    chainOptions.find((c) => c.value === chainId)?.label ?? String(chainId);

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="链上监听说明"
        description={
          <>
            推荐优先使用 <strong>RPC 事件订阅</strong>（纯节点，无需浏览器 API）监听 Transfer / 自定义事件；
            「浏览器同步」仅用于拉取全量历史交易，需配置 BC_EXPLORER_API_KEY。
          </>
        }
      />

      <PageTable<ContractItem>
        title="合约管理"
        toolbarExtra={<Tag color="processing">RPC 监听优先</Tag>}
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
        createPermission="contract:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '链', dataIndex: 'chainId', width: 120, render: (v: number) => chainName(v) },
          { title: '名称', dataIndex: 'name', width: 140 },
          { title: '地址', dataIndex: 'address', ellipsis: true },
          { title: '类型', dataIndex: 'contractType', width: 90 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: number) => (v === 1 ? '启用' : '禁用'),
          },
          {
            title: '浏览器同步',
            dataIndex: 'lastTxSyncedAt',
            width: 160,
            render: (v?: string, record?: ContractItem) =>
              v ? (
                <span title={record?.lastTxSyncBlock ? `区块 ${record.lastTxSyncBlock}` : undefined}>
                  {formatDateTime(v)}
                </span>
              ) : (
                '-'
              ),
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '操作',
            width: 320,
            render: (_, record) => (
              <Space size={0} wrap>
                <AuthButton
                  type="link"
                  permission="contract:update"
                  loading={subscribingId === record.id}
                  onClick={() => handleSubscribeTransfer(record.id)}
                >
                  RPC监听
                </AuthButton>
                <Tooltip title="需浏览器 API Key，拉取全量历史交易">
                  <AuthButton
                    type="link"
                    permission="contract:update"
                    loading={syncingId === record.id}
                    onClick={() => handleSync(record.id)}
                  >
                    浏览器同步
                  </AuthButton>
                </Tooltip>
                <AuthButton type="link" permission="contract:list" onClick={() => showListenGuide(record)}>
                  监听说明
                </AuthButton>
                <Popconfirm
                  title="全量重扫将忽略上次同步游标，可能产生大量重复跳过，确认继续？"
                  onConfirm={() => handleSync(record.id, true)}
                >
                  <AuthButton type="link" permission="contract:update" disabled={syncingId === record.id}>
                    全量
                  </AuthButton>
                </Popconfirm>
                <AuthButton type="link" permission="contract:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton type="link" danger permission="contract:delete" onClick={() => handleDelete(record.id)}>
                  删除
                </AuthButton>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑合约' : '登记合约'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical">
          {!editing ? (
            <>
              <Form.Item name="chainId" label="所属链" rules={[{ required: true }]}>
                <Select options={chainOptions} placeholder="选择链" />
              </Form.Item>
              <Form.Item
                name="address"
                label="合约地址"
                rules={[{ required: true }, { pattern: /^0x[a-fA-F0-9]{40}$/, message: '地址格式无效' }]}
              >
                <Input placeholder="0x..." />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="name" label="合约名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contractType" label="类型" rules={[{ required: true }]}>
            <Select options={contractTypeOptions} />
          </Form.Item>
          <Form.Item name="abi" label="ABI（JSON）">
            <Input.TextArea rows={4} placeholder="可选；自定义事件订阅需要 ABI" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="监听方式说明"
        open={Boolean(listenGuide)}
        footer={null}
        onCancel={() => setListenGuide(null)}
        width={560}
      >
        {listenGuide ? (
          <>
            <p>
              合约类型：<Tag>{listenGuide.contractType}</Tag>
              {listenGuide.hasWebSocket ? (
                <Tag color="success">已配置 WSS，支持秒级推送</Tag>
              ) : (
                <Tag>未配置 WSS，使用 HTTP 轮询</Tag>
              )}
            </p>
            <ul style={{ paddingLeft: 20 }}>
              {listenGuide.options.map((opt) => (
                <li key={opt.mode} style={{ marginBottom: 8 }}>
                  <strong>{opt.title}</strong>
                  {opt.recommended ? <Tag color="blue" style={{ marginLeft: 8 }}>推荐</Tag> : null}
                  <div style={{ color: '#666' }}>{opt.description}</div>
                </li>
              ))}
            </ul>
            <Alert
              type="warning"
              showIcon
              title="浏览器 API 仅适合全量历史"
              description={`仅浏览器 API 可做：${listenGuide.summary.explorerOnly.join('、')}`}
            />
          </>
        ) : null}
      </Modal>
    </>
  );
}
