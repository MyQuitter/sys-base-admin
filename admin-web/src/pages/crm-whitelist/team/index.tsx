import { formatUnits } from 'viem';
import { Alert, Button, Descriptions, Input, Modal, Space, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  getCrmTeamMembers,
  getCrmTeamOverview,
  getCrmTeamTree,
  getCrmWlRealtime,
  syncCrmTeamMetrics,
  syncCrmTeamRelations,
  type CrmTeamMemberItem,
} from '@/api/crm-whitelist';
import { AddressText } from '@/components/AddressText';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';
const AMOUNT_DECIMALS = 18;

/** 仅前端展示：链上无推荐人时固定显示已有推荐人，不写库、不写链 */
const DISPLAY_INVITER_OVERRIDES: Record<string, string> = {
  '0x62F800eb3bA2fE1054C77f6EeF96A59EC93d557d': '0xd79540aC0151C207c6e451186ee32794F51a7Ead',
};

function displayInviter(memberAddress?: string, inviterAddress?: string | null) {
  if (inviterAddress) return inviterAddress;
  if (!memberAddress) return undefined;
  const hit = Object.entries(DISPLAY_INVITER_OVERRIDES).find(
    ([addr]) => addr.toLowerCase() === memberAddress.toLowerCase(),
  );
  return hit?.[1];
}

function fmtInt(v?: string) {
  if (!v) return '0';
  try {
    return BigInt(v).toLocaleString('zh-CN');
  } catch {
    return v;
  }
}

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

function fmtUsdBnb(usd?: string, bnb?: string) {
  return `${fmtAmount(usd)} U / ${fmtAmount(bnb)} BNB`;
}

export default function CrmTeamPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<CrmTeamMemberItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addressKeyword, setAddressKeyword] = useState('');
  const [inviterKeyword, setInviterKeyword] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [liveHint, setLiveHint] = useState('首次扫块后由 Webhook / WSS / 短轮询持续入库');
  const [detail, setDetail] = useState<{
    member: CrmTeamMemberItem;
    inviter: CrmTeamMemberItem | null;
    children: CrmTeamMemberItem[];
    treeCount: number;
  } | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadData = async (
    p = page,
    ps = pageSize,
    address = addressKeyword,
    inviterAddress = inviterKeyword,
    refreshMetrics = false,
  ) => {
    setLoading(true);
    try {
      const res = await getCrmTeamMembers({
        page: p,
        pageSize: ps,
        address: address || undefined,
        inviterAddress: inviterAddress || undefined,
        refreshMetrics,
      });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  const scheduleSearch = (address: string, inviter: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      void loadData(1, pageSize, address, inviter);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // 首次进入默认拉链上业绩；翻页/筛选等后续仅读库
  useEffect(() => {
    void loadData(1, pageSize, '', '', false);
    void getCrmWlRealtime()
      .then((s) => {
        const mode =
          s.liveMode === 'websocket' ? 'WebSocket 实时' : s.liveMode === 'polling' ? '短轮询补漏' : '待启动';
        const hook = s.webhookEnabled
          ? 'Alchemy Webhook 已启用'
          : 'Webhook 未配 CRM_WL_WEBHOOK_SECRET（填 Alchemy 签名密钥）';
        setLiveHint(`${mode} · ${hook}。Webhook 只写库，本页不自动刷新；点「刷新业绩入库」可全量落库。`);
      })
      .catch(() => undefined);
  }, []);

  const openDetail = async (address: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const [overview, tree] = await Promise.all([getCrmTeamOverview(address), getCrmTeamTree(address)]);
      setDetail({
        ...overview,
        treeCount: tree.nodes.length,
      });
    } catch (err: unknown) {
      toast.error((err as Error).message || '加载详情失败');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={liveHint} />
      <PageTable
        title="链上团队数据"
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
              placeholder="按成员地址筛选"
              allowClear
              style={{ width: 220 }}
              onChange={(e) => {
                const v = e.target.value;
                setAddressKeyword(v);
                scheduleSearch(v, inviterKeyword);
              }}
              onSearch={(v) => {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                setAddressKeyword(v);
                setPage(1);
                void loadData(1, pageSize, v, inviterKeyword);
              }}
            />
            <Input.Search
              placeholder="按推荐人地址筛选"
              allowClear
              style={{ width: 220 }}
              onChange={(e) => {
                const v = e.target.value;
                setInviterKeyword(v);
                scheduleSearch(addressKeyword, v);
              }}
              onSearch={(v) => {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                setInviterKeyword(v);
                setPage(1);
                void loadData(1, pageSize, addressKeyword, v);
              }}
            />
            <AuthButton
              permission="crm-team:list"
              loading={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const res = await syncCrmTeamRelations();
                  toast.success(
                    res.caughtUp
                      ? `团队关系同步完成：${res.processed} 条（至 ${res.syncedTo}）`
                      : `团队关系已同步 ${res.processed} 条（至 ${res.syncedTo}），请继续点击追平`,
                  );
                  await loadData();
                } catch (err: unknown) {
                  toast.error((err as Error).message || '同步失败');
                } finally {
                  setSyncing(false);
                }
              }}
            >
              同步团队关系
            </AuthButton>
            <Button
              loading={loading || syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const res = await syncCrmTeamMetrics();
                  toast.success(
                    res.caughtUp
                      ? `业绩已入库：${res.total} 人（额度/节点 ${res.chainUpdated}）`
                      : `已写入 ${res.volumeUpdated} 人业绩，链上额度未跑完请再点一次`,
                  );
                  await loadData(page, pageSize, addressKeyword, inviterKeyword, false);
                } catch (err: unknown) {
                  toast.error((err as Error).message || '刷新业绩失败');
                } finally {
                  setSyncing(false);
                }
              }}
            >
              刷新业绩入库
            </Button>
          </Space>
        }
        columns={[
          { title: '成员地址', dataIndex: 'address', align: 'left', render: (v: string) => <AddressText address={v} /> },
          {
            title: '推荐人',
            dataIndex: 'inviterAddress',
            align: 'left',
            render: (v: string | undefined, row: CrmTeamMemberItem) => (
              <AddressText address={displayInviter(row.address, v)} />
            ),
          },
          { title: '层级深度', dataIndex: 'depth', width: 90, align: 'center' },
          { title: '个人业绩', dataIndex: 'ownUsd', align: 'left', render: (_: string, row: CrmTeamMemberItem) => fmtUsdBnb(row.ownUsd, row.ownBnb) },
          { title: '直推业绩', dataIndex: 'directUsd', align: 'left', render: (_: string, row: CrmTeamMemberItem) => fmtUsdBnb(row.directUsd, row.directBnb) },
          { title: '团队业绩', dataIndex: 'teamUsd', align: 'left', render: (_: string, row: CrmTeamMemberItem) => fmtUsdBnb(row.teamUsd, row.teamBnb) },
          { title: '额度', dataIndex: 'quotaUsd', align: 'left', render: (v: string) => fmtAmount(v) },
          {
            title: '节点等级',
            dataIndex: 'nodeLevel',
            width: 90,
            align: 'center',
            render: (v: number) => (v > 0 ? <Tag color="blue">L{v}</Tag> : '-'),
          },
          { title: '有效直推', dataIndex: 'directValidUsers', align: 'center', render: (v: string) => fmtInt(v) },
          {
            title: '操作',
            width: 100,
            align: 'center',
            render: (_, row) => (
              <Button type="link" onClick={() => void openDetail(row.address)}>
                查看详情
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="团队详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={900}
        centered
        destroyOnHidden
        confirmLoading={detailLoading}
        styles={{ body: { maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', paddingTop: 12 } }}
      >
        {detail && (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} styles={{ label: { width: 140 } }}>
              <Descriptions.Item label="成员地址"><AddressText address={detail.member.address} /></Descriptions.Item>
              <Descriptions.Item label="推荐人">
                <AddressText
                  address={displayInviter(
                    detail.member.address,
                    detail.inviter?.address ?? detail.member.inviterAddress,
                  )}
                />
              </Descriptions.Item>
              <Descriptions.Item label="个人业绩">{fmtUsdBnb(detail.member.ownUsd, detail.member.ownBnb)}</Descriptions.Item>
              <Descriptions.Item label="直推业绩">{fmtUsdBnb(detail.member.directUsd, detail.member.directBnb)}</Descriptions.Item>
              <Descriptions.Item label="团队业绩">{fmtUsdBnb(detail.member.teamUsd, detail.member.teamBnb)}</Descriptions.Item>
              <Descriptions.Item label="额度">{fmtAmount(detail.member.quotaUsd)}</Descriptions.Item>
              <Descriptions.Item label="节点等级">L{detail.member.nodeLevel || 0}</Descriptions.Item>
              <Descriptions.Item label="有效直推">{fmtInt(detail.member.directValidUsers)}</Descriptions.Item>
              <Descriptions.Item label="推荐奖励 CRAM">{fmtAmount(detail.member.referralCrm)}</Descriptions.Item>
              <Descriptions.Item label="订单数/在局">{fmtInt(detail.member.openOrders)}</Descriptions.Item>
              <Descriptions.Item label="投入 BNB">{fmtAmount(detail.member.contributedBnb)}</Descriptions.Item>
              <Descriptions.Item label="在线充值 U">{fmtAmount(detail.member.participationUsd)}</Descriptions.Item>
              <Descriptions.Item label="剩余额度 U">{fmtAmount(detail.member.remainingQuotaUsd)}</Descriptions.Item>
              <Descriptions.Item label="已领折 U">{fmtAmount(detail.member.claimedRewardUsd)}</Descriptions.Item>
              <Descriptions.Item label="待领 静态">{fmtAmount(detail.member.pendingStaticCrm)}</Descriptions.Item>
              <Descriptions.Item label="待领 节点">{fmtAmount(detail.member.pendingNodeCrm)}</Descriptions.Item>
              <Descriptions.Item label="钱包 CRAM">{fmtAmount(detail.member.claimableCrm)}</Descriptions.Item>
              <Descriptions.Item label="返佣累计 CRAM">{fmtAmount(detail.member.referralCrmEarned ?? detail.member.referralCrm)}</Descriptions.Item>
              <Descriptions.Item label="节点已到账 CRAM">{fmtAmount(detail.member.nodeClaimedCrm)}</Descriptions.Item>
              <Descriptions.Item label="价格就绪">
                {detail.member.priceReady ? <Tag color="green">就绪</Tag> : <Tag color="orange">未就绪</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="团队节点数">{detail.treeCount}</Descriptions.Item>
            </Descriptions>

            <PageTable
              title="直接下级"
              loading={detailLoading}
              data={detail.children}
              pagination={false}
              columns={[
                { title: '地址', dataIndex: 'address', align: 'left', render: (v: string) => <AddressText address={v} /> },
                { title: '个人业绩', dataIndex: 'ownUsd', align: 'left', render: (_: string, row: CrmTeamMemberItem) => fmtUsdBnb(row.ownUsd, row.ownBnb) },
                { title: '团队业绩', dataIndex: 'teamUsd', align: 'left', render: (_: string, row: CrmTeamMemberItem) => fmtUsdBnb(row.teamUsd, row.teamBnb) },
                { title: '等级', dataIndex: 'nodeLevel', align: 'center', render: (v: number) => `L${v || 0}` },
              ]}
            />
          </Space>
        )}
      </Modal>
    </>
  );
}
