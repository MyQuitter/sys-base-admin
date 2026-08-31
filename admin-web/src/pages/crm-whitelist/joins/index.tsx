import { Alert, Input, Space } from 'antd';
import { formatUnits } from 'viem';
import { useEffect, useState } from 'react';
import { getCrmWlJoins, getCrmWlRealtime, syncCrmWlJoins, type CrmWlJoinItem } from '@/api/crm-whitelist';
import { AddressText } from '@/components/AddressText';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';
import { toast } from '@/utils/toast';

const AMOUNT_DECIMALS = 18;

function fmtAmount(v?: string, decimals = AMOUNT_DECIMALS) {
  if (!v) return '0';
  try {
    const [intPart, frac = ''] = formatUnits(BigInt(v), decimals).split('.');
    const grouped = BigInt(intPart).toLocaleString('zh-CN');
    const trimmed = frac.replace(/0+$/, '').slice(0, 4);
    return trimmed ? `${grouped}.${trimmed}` : grouped;
  } catch {
    return v;
  }
}

/**
 * 入金记录：ParticipationAdded 事件索引列表 + 同步。
 */
export default function CrmWlJoinsPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<CrmWlJoinItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [liveHint, setLiveHint] = useState('首次扫块后由 Webhook / WSS / 短轮询持续入库');

  const loadData = async (p = page, ps = pageSize, address = keyword) => {
    setLoading(true);
    try {
      const res = await getCrmWlJoins({ page: p, pageSize: ps, address: address || undefined });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    void getCrmWlRealtime()
      .then((s) => {
        const mode =
          s.liveMode === 'websocket' ? 'WebSocket 实时' : s.liveMode === 'polling' ? '短轮询补漏' : '待启动';
        const hook = s.webhookEnabled
          ? 'Alchemy Webhook 已启用'
          : 'Webhook 未配 CRM_WL_WEBHOOK_SECRET（填 Alchemy 签名密钥）';
        setLiveHint(`${mode} · ${hook}。Webhook 只写库，本页不自动刷新。`);
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={liveHint} />
      <PageTable
      title="入金记录"
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
          <AuthButton
            permission="crm-wl:join-list"
            loading={syncing}
            onClick={async () => {
              if (syncing) return;
              setSyncing(true);
              const hide = toast.loading('同步入金记录...', 0);
              try {
                const res = await syncCrmWlJoins();
                toast.success(
                  res.caughtUp
                    ? `同步完成，新增 ${res.processed} 笔，游标 ${res.syncedTo}`
                    : `已部分同步至 ${res.syncedTo}，新增 ${res.processed} 笔，请再点同步`,
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
        { title: '入金ID', dataIndex: 'participationId', width: 90 },
        { title: '地址', dataIndex: 'address', render: (v: string) => <AddressText address={v} /> },
        {
          title: 'BNB',
          dataIndex: 'bnbAmount',
          width: 120,
          render: (v: string) => fmtAmount(v),
        },
        {
          title: '入金折 U',
          dataIndex: 'participationUsd',
          width: 140,
          render: (v: string) => fmtAmount(v),
        },
        {
          title: '额度 U',
          dataIndex: 'quotaUsd',
          width: 140,
          render: (v: string) => fmtAmount(v),
        },
        { title: '区块', dataIndex: 'blockNumber', width: 120 },
        {
          title: '交易哈希',
          dataIndex: 'txHash',
          width: 180,
          render: (v?: string) => <AddressText address={v} successMessage="已复制交易哈希" />,
        },
        {
          title: '时间',
          dataIndex: 'eventAt',
          width: 170,
          render: (v?: string) => (v ? formatDateTime(v) : '-'),
        },
      ]}
    />
    </>
  );
}
