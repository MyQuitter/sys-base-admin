import { Form, Input, Modal, Space } from 'antd';
import { useEffect, useState } from 'react';
import {
  getCrmWlConfig,
  getCrmWlTraders,
  lookupCrmWlTrader,
  importCrmWlTx,
  syncCrmWl,
  type CrmWlTraderItem,
} from '@/api/crm-whitelist';
import { AddressText } from '@/components/AddressText';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';
import { writeSetTraderWhitelist } from '@/utils/crm-whitelist-wallet';

import { toast } from '@/utils/toast';
/**
 * 交易白名单：事件索引有效列表 + MetaMask 加入/移除。
 */
export default function CrmWlTraderPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<CrmWlTraderItem[]>([]);
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
      const res = await getCrmWlTraders({ page: p, pageSize: ps, address: address || undefined });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const runWrite = async (address: string, allowed: boolean) => {
    const cfg = await getCrmWlConfig();
    if (!cfg.chainId || !cfg.tokenAddress) {
      toast.error('请先在「合约配置」中填写 Token 地址与 chainId');
      return;
    }
    const hide = toast.loading(allowed ? '提交加入白名单...' : '提交移除白名单...', 0);
    try {
      const hash = await writeSetTraderWhitelist({
        chainId: cfg.chainId,
        tokenAddress: cfg.tokenAddress,
        tokenAbiKey: cfg.tokenAbiKey || 'modular',
        account: address,
        allowed,
      });
      toast.success(`交易已提交：${hash.slice(0, 10)}...`);
      try {
        await importCrmWlTx('trader', hash);
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
        title="交易白名单"
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
            <AuthButton permission="crm-wl:trader-write" type="primary" onClick={() => setModalOpen(true)}>
              加入白名单
            </AuthButton>
            <AuthButton permission="crm-wl:trader-list" onClick={() => setLookupOpen(true)}>
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
            title: '状态',
            dataIndex: 'allowed',
            width: 90,
            render: () => '有效',
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
            width: 120,
            render: (_, record) => (
              <AuthButton
                size="small"
                danger
                permission="crm-wl:trader-write"
                onClick={() => void runWrite(record.address, false)}
              >
                移除
              </AuthButton>
            ),
          },
        ]}
      />

      <Modal
        title="加入交易白名单"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          setModalOpen(false);
          await runWrite(values.address.trim(), true);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="address" label="钱包地址" rules={[{ required: true, message: '请输入地址' }]}>
            <Input placeholder="0x..." />
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
            const res = await lookupCrmWlTrader(values.address.trim());
            toast.info(
              `索引=${res.indexedAllowed ? '有效' : '否'}；链上=${
                res.onChainAllowed == null ? '未知' : res.onChainAllowed ? '有效' : '否'
              }`,
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
