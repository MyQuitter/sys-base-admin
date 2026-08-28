import { Form, Input, Modal, Select, Space, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createEventSubscription,
  deleteEventSubscription,
  getContracts,
  getEnabledChains,
  getEventSubscriptions,
  scanEventSubscription,
  updateEventSubscription,
  type ContractItem,
  type EventSubscriptionItem,
} from '@/api/blockchain';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';
import { formatEventSignature, parseAbiEvents } from '@/utils/abi';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

const AUTO_REFRESH_MS = 15000;

/**
 * 合约事件订阅：启用后后台不定时自动轮询 eth_getLogs 增量抓取。
 */
export default function BlockchainEventSubscriptionPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EventSubscriptionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [chainOptions, setChainOptions] = useState<{ label: string; value: number }[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventSubscriptionItem | null>(null);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const contractId = Form.useWatch('contractId', form);

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === contractId),
    [contracts, contractId],
  );

  const eventOptions = useMemo(() => {
    if (!selectedContract?.abi) return [];
    return parseAbiEvents(selectedContract.abi).map((event) => ({
      label: formatEventSignature(event),
      value: event.name,
    }));
  }, [selectedContract]);

  const loadChains = async () => {
    const chains = await getEnabledChains();
    setChainOptions(chains.map((c) => ({ label: c.name, value: c.chainId })));
  };

  const loadContracts = async () => {
    const res = await getContracts({ page: 1, pageSize: 100, status: 1 });
    setContracts(res.items.filter((c) => c.abi?.trim()));
  };

  const loadData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getEventSubscriptions({ page: p, pageSize: ps });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadChains();
    loadContracts();
    loadData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadData();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadData]);

  const chainName = (chainId: number) =>
    chainOptions.find((c) => c.value === chainId)?.label ?? String(chainId);

  const contractOptions = contracts.map((c) => ({
    label: `${c.name} (${c.address.slice(0, 8)}…)`,
    value: c.id,
  }));

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };

  const openEdit = (record: EventSubscriptionItem) => {
    setEditing(record);
    form.setFieldsValue({
      status: record.status,
      fromBlock: record.fromBlock,
      remark: record.remark,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateEventSubscription(editing.id, values);
      toast.success('订阅已更新');
    } else {
      await createEventSubscription(values);
      toast.success('订阅已创建，将自动开始同步');
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    await deleteEventSubscription(id);
    toast.success('已删除');
    loadData();
  };

  const handleScan = async (id: number) => {
    setScanningId(id);
    try {
      const res = await scanEventSubscription(id);
      toast.success(`补扫完成：新增 ${res.newLogs} 条，区块 ${res.scannedBlocks}`);
      loadData();
    } finally {
      setScanningId(null);
    }
  };

  return (
    <>
      <PageTable<EventSubscriptionItem>
        title="事件订阅"
        toolbarExtra={<Tag color="processing">纯 RPC 监听，无需浏览器 API</Tag>}
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
        createPermission="event-sub:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '合约', dataIndex: 'contractName', width: 140, render: (v?: string) => v ?? '-' },
          { title: '链', dataIndex: 'chainId', width: 110, render: (v: number) => chainName(v) },
          { title: '事件', dataIndex: 'eventName', width: 120 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v: number) =>
              v === 1 ? <Tag color="success">自动同步</Tag> : <Tag>已禁用</Tag>,
          },
          { title: '起始块', dataIndex: 'fromBlock', width: 100, render: (v?: string) => v ?? '-' },
          { title: '已扫至', dataIndex: 'lastScannedBlock', width: 100, render: (v?: string) => v ?? '-' },
          {
            title: '上次扫描',
            dataIndex: 'lastScannedAt',
            width: 160,
            render: (v?: string) => (v ? formatDateTime(v) : '-'),
          },
          {
            title: '下次扫描',
            dataIndex: 'nextScanAt',
            width: 160,
            render: (v?: string, record?: EventSubscriptionItem) =>
              record?.status === 1 && v ? formatDateTime(v) : '-',
          },
          {
            title: '操作',
            width: 200,
            render: (_, record) => (
              <Space size={0}>
                <AuthButton
                  type="link"
                  permission="event-sub:create"
                  loading={scanningId === record.id}
                  onClick={() => handleScan(record.id)}
                >
                  立即扫描
                </AuthButton>
                <AuthButton type="link" permission="event-sub:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton type="link" danger permission="event-sub:delete" onClick={() => handleDelete(record.id)}>
                  删除
                </AuthButton>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑事件订阅' : '新建事件订阅'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        width={480}
      >
        <Form form={form} layout="vertical">
          {!editing ? (
            <>
              <Form.Item name="contractId" label="合约" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={contractOptions}
                  placeholder="选择已配置 ABI 的合约"
                  onChange={() => form.setFieldValue('eventName', undefined)}
                />
              </Form.Item>
              <Form.Item
                name="eventName"
                label="事件名"
                rules={[{ required: true, message: '请选择事件' }]}
                extra="从所选合约 ABI 的 event 列表中选择"
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  disabled={!contractId}
                  options={eventOptions}
                  placeholder={
                    !contractId
                      ? '请先选择合约'
                      : eventOptions.length
                        ? '选择要订阅的事件'
                        : '该合约 ABI 中无 event'
                  }
                  notFoundContent="ABI 中无 event"
                />
              </Form.Item>
              <Form.Item name="fromBlock" label="起始区块" extra="不填则从当前最新块开始">
                <Input placeholder="可选，如 18000000" />
              </Form.Item>
            </>
          ) : (
            <Form.Item name="fromBlock" label="起始区块" extra="修改后将重置扫描游标并立即重新同步">
              <Input />
            </Form.Item>
          )}
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
