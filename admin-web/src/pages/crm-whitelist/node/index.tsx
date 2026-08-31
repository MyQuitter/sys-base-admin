import { Form, Input, InputNumber, Modal, Space } from 'antd';
import { useEffect, useState } from 'react';
import {
  getCrmWlConfig,
  getCrmWlNodes,
  lookupCrmWlNode,
  importCrmWlTx,
  syncCrmWl,
  type CrmWlNodeItem,
} from '@/api/crm-whitelist';
import { AddressText } from '@/components/AddressText';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';
import { writeSetNodeWhitelist } from '@/utils/crm-whitelist-wallet';

import { toast } from '@/utils/toast';
/**
 * 节点白名单：事件索引有效列表 + MetaMask 设等级/清除。
 */
export default function CrmWlNodePage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<CrmWlNodeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [form] = Form.useForm();
  const [lookupForm] = Form.useForm();

  const loadData = async (p = page, ps = pageSize, address = keyword) => {
    setLoading(true);
    try {
      const res = await getCrmWlNodes({ page: p, pageSize: ps, address: address || undefined });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const runWrite = async (address: string, level: number) => {
    const cfg = await getCrmWlConfig();
    if (!cfg.chainId || !cfg.businessAddress) {
      toast.error('请先在「合约配置」中填写 Business 地址与 chainId');
      return;
    }
    const hide = toast.loading(level > 0 ? `设置 L${level}...` : '清除节点白名单...', 0);
    try {
      const hash = await writeSetNodeWhitelist({
        chainId: cfg.chainId,
        businessAddress: cfg.businessAddress,
        account: address,
        level,
        uncapped: false,
      });
      toast.success(`交易已提交：${hash.slice(0, 10)}...`);
      try {
        await importCrmWlTx('node', hash);
      } catch {
        /* 索引失败可稍后点同步 */
      }
      await loadData();
    } catch (err: unknown) {
      toast.error((err as Error).message || '操作失败');
    } finally {
      hide();
    }
  };

  return (
    <>
      <PageTable
        title="节点白名单"
        loading={loading}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
          void loadData(p, ps);
        }}
        toolbarExtra={
          <Space>
            <Input.Search
              placeholder="按地址筛选"
              allowClear
              style={{ width: 280 }}
              onSearch={(v) => {
                setKeyword(v);
                setPage(1);
                void loadData(1, pageSize, v);
              }}
            />
            <AuthButton permission="crm-wl:node-write" type="primary" onClick={() => setModalOpen(true)}>
              设置等级
            </AuthButton>
            <AuthButton permission="crm-wl:node-list" onClick={() => setLookupOpen(true)}>
              地址核对
            </AuthButton>
            <AuthButton
              permission="crm-wl:config"
              loading={syncing}
              onClick={async () => {
                if (syncing) return;
                setSyncing(true);
                const hide = toast.loading('同步中...', 0);
                try {
                  const res = await syncCrmWl();
                  const done = res.trader.caughtUp && res.node.caughtUp;
                  toast.success(
                    done
                      ? '同步完成'
                      : `已部分同步至交易 ${res.trader.syncedTo} / 节点 ${res.node.syncedTo}，请再点同步`,
                  );
                  await loadData();
                } catch (err: unknown) {
                  const msg = (err as Error).message || '同步失败';
                  if (msg.includes('同步进行中')) toast.info(msg);
                  else toast.error(msg);
                } finally {
                  hide();
                  setSyncing(false);
                }
              }}
            >
              同步
            </AuthButton>
          </Space>
        }
        columns={[
          { title: '地址', dataIndex: 'address', render: (v: string) => <AddressText address={v} /> },
          {
            title: '等级',
            dataIndex: 'level',
            width: 80,
            render: (v: number) => `L${v}`,
          },
          { title: '区块', dataIndex: 'blockNumber', width: 120 },
          {
            title: '交易哈希',
            dataIndex: 'txHash',
            width: 180,
            render: (v?: string) => <AddressText address={v} successMessage="已复制交易哈希" />,
          },
          {
            title: '更新时间',
            dataIndex: 'eventAt',
            width: 170,
            render: (v?: string) => (v ? formatDateTime(v) : '-'),
          },
          {
            title: '操作',
            width: 100,
            render: (_, record) => (
              <AuthButton
                size="small"
                danger
                permission="crm-wl:node-write"
                onClick={() => void runWrite(record.address, 0)}
              >
                清除
              </AuthButton>
            ),
          },
        ]}
      />

      <Modal
        title="设置节点白名单等级"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          setModalOpen(false);
          await runWrite(values.address.trim(), Number(values.level));
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ level: 1 }}>
          <Form.Item name="address" label="钱包地址" rules={[{ required: true }]}>
            <Input placeholder="0x..." />
          </Form.Item>
          <Form.Item
            name="level"
            label="等级 (1-8)"
            rules={[{ required: true }, { type: 'number', min: 1, max: 8 }]}
          >
            <InputNumber min={1} max={8} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="地址核对"
        open={lookupOpen}
        onCancel={() => setLookupOpen(false)}
        onOk={async () => {
          const values = await lookupForm.validateFields();
          try {
            const res = await lookupCrmWlNode(values.address.trim());
            toast.info(
              `索引等级=${res.indexedLevel}；链上等级=${res.onChainLevel == null ? '未知' : res.onChainLevel}`,
              5,
            );
          } catch (err: unknown) {
            toast.error((err as Error).message || '查询失败');
          }
        }}
        destroyOnHidden
      >
        <Form form={lookupForm} layout="vertical">
          <Form.Item name="address" label="钱包地址" rules={[{ required: true }]}>
            <Input placeholder="0x..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
