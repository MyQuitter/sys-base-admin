import {
  BankOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FundOutlined,
  ReloadOutlined,
  RocketOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TransactionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Modal, Progress, Row, Spin, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatUnits } from 'viem';
import { getCrmWlConfig, getCrmWlDashboard, type CrmWlDashboardStats } from '@/api/crm-whitelist';
import { AuthButton } from '@/components/AuthButton';
import { toast } from '@/utils/toast';
import { writeEnableTrading, writeRollObservations, verifyTokenOwner } from '@/utils/crm-whitelist-wallet';
import { PriceKlineCard } from './PriceKlineCard';
import './dashboard.css';

const AMOUNT_DECIMALS = 18;
const PIE_COLORS = ['#1677ff', '#0d9488', '#d97706', '#6366f1', '#0891b2', '#e11d48', '#65a30d', '#2563eb'];

function fmtUsd(v?: string, decimals = AMOUNT_DECIMALS) {
  if (!v) return '0';
  try {
    const x = BigInt(String(v).split('.')[0]);
    const fracDigits = 4n;
    const q = 10n ** (BigInt(decimals) - fracDigits);
    const rounded = (x + q / 2n) / q;
    const scale = 10n ** fracDigits;
    const intPart = rounded / scale;
    const fracPart = rounded % scale;
    const grouped = intPart.toLocaleString('zh-CN');
    const fracStr = fracPart.toString().padStart(Number(fracDigits), '0').replace(/0+$/, '');
    return fracStr ? `${grouped}.${fracStr}` : grouped;
  } catch {
    return v;
  }
}

function fmtInt(v?: string) {
  if (!v) return '0';
  try {
    return BigInt(v).toLocaleString('zh-CN');
  } catch {
    return v;
  }
}

function fmtTs(v?: string) {
  if (!v || v === '0') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return new Date(n * 1000).toLocaleString('zh-CN');
}

function dailyJoinPercent(stats: CrmWlDashboardStats) {
  if (stats.dailyJoinUnlimited) return 0;
  try {
    const cap = BigInt(stats.dailyJoinCapUsd || '0');
    if (cap <= 0n) return 0;
    const used = BigInt(stats.dailyJoinedUsdToday || '0');
    const pct = Number((used * 10000n) / cap) / 100;
    return Math.min(100, Math.max(0, pct));
  } catch {
    return 0;
  }
}

function usdToNumber(v?: string, decimals = AMOUNT_DECIMALS) {
  if (!v) return 0;
  try {
    return Number(formatUnits(BigInt(String(v).split('.')[0]), decimals));
  } catch {
    return 0;
  }
}

function fmtPrice(v?: string) {
  if (!v || v === '0') return '-';
  try {
    const n = Number(formatUnits(BigInt(v), AMOUNT_DECIMALS));
    if (!Number.isFinite(n)) return '-';
    if (n >= 1) return n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
    return n.toLocaleString('zh-CN', { maximumSignificantDigits: 6 });
  } catch {
    return '-';
  }
}

function MetricCard(props: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'blue' | 'teal' | 'green' | 'amber' | 'slate' | 'rose';
  foot?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  const { label, value, icon, tone = 'blue', foot, className, valueClassName } = props;
  return (
    <Card className={`crm-dash-metric ${className ?? ''}`} variant="borderless">
      <div className="crm-dash-metric-inner">
        <div className={`crm-dash-metric-icon ${tone}`}>{icon}</div>
        <div className="crm-dash-metric-body">
          <div className="crm-dash-metric-label">{label}</div>
          <div className={`crm-dash-metric-value ${valueClassName ?? ''}`}>{value}</div>
          {foot ? <div className="crm-dash-metric-foot">{foot}</div> : null}
        </div>
      </div>
    </Card>
  );
}

/**
 * CrmToken 数据面板：总业绩、会员人数、价格与分布图表。
 */
export default function CrmWlDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [stats, setStats] = useState<CrmWlDashboardStats | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setStats(await getCrmWlDashboard());
    } catch (err: unknown) {
      toast.error((err as Error).message || '加载数据面板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleEnableTrading = async () => {
    if (!stats) return;
    if (stats.tradingEnabled) {
      toast.info('合约已开盘');
      return;
    }

    setOpening(true);
    const hideVerify = toast.loading('正在验证 Owner 钱包...', 0);
    let ownerAccount: `0x${string}`;
    let writeParams: { chainId: number; tokenAddress: string; tokenAbiKey: string };
    try {
      const cfg = await getCrmWlConfig();
      if (!cfg.chainId || !cfg.tokenAddress) {
        throw new Error('请先在「合约配置」中填写 Token 地址与 chainId');
      }
      writeParams = {
        chainId: cfg.chainId,
        tokenAddress: cfg.tokenAddress,
        tokenAbiKey: cfg.tokenAbiKey || 'modular',
      };
      ownerAccount = await verifyTokenOwner(writeParams);
      hideVerify();
    } catch (err: unknown) {
      hideVerify();
      setOpening(false);
      toast.error((err as Error).message || 'Owner 验证失败');
      return;
    }

    setOpening(false);
    const short = `${ownerAccount.slice(0, 6)}...${ownerAccount.slice(-4)}`;

    Modal.confirm({
      title: '确认开盘？',
      content: (
        <div>
          <p>
            Owner 已验证通过：<code>{short}</code>
          </p>
          <p>将调用 Token <code>enableTrading()</code>，开盘后不可逆。</p>
          <p style={{ marginBottom: 0 }}>
            前置条件：Router / 收款组已配置，且 TWAP <code>protectedPrices</code> 就绪。
            {!stats.priceReady
              ? ' 当前 TWAP 未就绪，将先尝试 rollObservations，再开盘。'
              : ''}
          </p>
        </div>
      ),
      okText: '确认开盘',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setOpening(true);
        const hide = toast.loading('开盘交易提交中...', 0);
        try {
          if (!stats.priceReady) {
            const rollHash = await writeRollObservations(writeParams);
            toast.success(`已滚动观察点：${rollHash.slice(0, 10)}...`);
          }

          const hash = await writeEnableTrading(writeParams);
          toast.success(`开盘交易已提交：${hash.slice(0, 10)}...`);
          await load();
        } catch (err: unknown) {
          toast.error((err as Error).message || '开盘失败');
          throw err;
        } finally {
          hide();
          setOpening(false);
        }
      },
    });
  };

  const depthData = useMemo(
    () =>
      (stats?.depthDistribution ?? []).map((d) => ({
        name: `深度 ${d.depth}`,
        count: d.count,
      })),
    [stats],
  );

  const levelData = useMemo(
    () =>
      (stats?.nodeLevelDistribution ?? []).map((d) => ({
        name: d.level > 0 ? `L${d.level}` : '无等级',
        count: d.count,
      })),
    [stats],
  );

  const dailyJoinData = useMemo(
    () =>
      (stats?.dailyJoins ?? []).map((d) => {
        const usdNum = usdToNumber(d.usd);
        return {
          date: d.date.slice(5),
          fullDate: d.date,
          usd: Number.isFinite(usdNum) ? usdNum : 0,
          usdLabel: fmtUsd(d.usd),
          bnbLabel: fmtUsd(d.bnb),
          count: d.count,
        };
      }),
    [stats],
  );

  return (
    <div className="crm-dash">
      <div className="crm-dash-hero">
        <div className="crm-dash-hero-top">
          <div className="crm-dash-hero-copy">
            <Typography.Title level={4} className="crm-dash-hero-title">
              CrmToken 数据面板
            </Typography.Title>
            <Typography.Text className="crm-dash-hero-desc">链上全局指标与本地索引分布</Typography.Text>
          </div>
          <div className="crm-dash-hero-actions">
            {stats && !stats.tradingEnabled ? (
              <AuthButton
                permission="crm-wl:config"
                type="primary"
                danger
                icon={<RocketOutlined />}
                loading={opening}
                onClick={() => void handleEnableTrading()}
              >
                开盘
              </AuthButton>
            ) : null}
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
          </div>
        </div>
        {stats && (
          <div className="crm-dash-status-row">
            <span className={`crm-dash-pill ${stats.tradingEnabled ? 'is-on' : 'is-warn'}`}>
              {stats.tradingEnabled ? '已开盘' : '未开盘'}
            </span>
            <span className={`crm-dash-pill ${stats.publicBuysEnabled ? 'is-on' : ''}`}>
              {stats.publicBuysEnabled ? '公开买盘已开' : '公开买盘关闭'}
            </span>
            <span className={`crm-dash-pill ${stats.rebaseDue ? 'is-warn' : 'is-on'}`}>
              Rebase {stats.rebaseDue ? '到期' : '未到期'}
            </span>
            <span className={`crm-dash-pill ${stats.priceReady ? 'is-on' : 'is-warn'}`}>
              TWAP {stats.priceReady ? '就绪' : '未就绪'}
            </span>
            <span className="crm-dash-pill is-on">UTC+8 {stats.utc8Date}</span>
          </div>
        )}
      </div>

      <Spin spinning={loading}>
        {!stats ? (
          <Empty description="暂无数据，请先完成合约配置与同步" />
        ) : (
          <>
            <section className="crm-dash-section">
              <div className="crm-dash-section-head">
                <h3 className="crm-dash-section-title">核心指标</h3>
                <span className="crm-dash-section-hint">价格来自 Pancake getAmountsOut 现货换算</span>
              </div>
              <Row gutter={[14, 14]}>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="总业绩 (USD)"
                    value={fmtUsd(stats.totalParticipationUsd)}
                    icon={<DollarOutlined />}
                    tone="blue"
                    foot="入金折 U，不含档位系数"
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="会员人数"
                    value={stats.memberCount}
                    icon={<TeamOutlined />}
                    tone="teal"
                    foot={`交易白名单 ${stats.traderCount} · 节点 ${stats.nodeCount}`}
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    className="crm-dash-price"
                    label="当前价格 (CRM/USD)"
                    value={stats.priceSource === 'pancake' ? fmtPrice(stats.crmUsdPrice) : '-'}
                    icon={<TransactionOutlined />}
                    tone="blue"
                    foot={
                      stats.priceSource === 'pancake' ? (
                        <>
                          <div className="crm-dash-price-tags">
                            <Tag color="processing">薄饼现货</Tag>
                            <Tag color={stats.priceReady ? 'success' : 'warning'}>
                              TWAP {stats.priceReady ? '就绪' : '未就绪'}
                            </Tag>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            BNB/USD {fmtPrice(stats.bnbUsdPrice)} · CRM/BNB {fmtPrice(stats.crmBnbPrice)}
                          </div>
                        </>
                      ) : (
                        'Router / 价源未就绪，暂无法换算'
                      )
                    }
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="入金笔数"
                    value={Number(stats.totalParticipations)}
                    icon={<UserOutlined />}
                    tone="green"
                    foot={`待补扣出局 ${fmtInt(stats.pendingExitCount)}`}
                  />
                </Col>
              </Row>
            </section>

            <section className="crm-dash-section">
              <div className="crm-dash-section-head">
                <h3 className="crm-dash-section-title">UTC+8 自然日</h3>
                <span className="crm-dash-section-hint">
                  {stats.utc8Date} · 日切 00:00（UTC+8），与合约每日入金上限口径一致
                </span>
              </div>
              <Row gutter={[14, 14]}>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="当日日期"
                    value={stats.utc8Date}
                    icon={<CalendarOutlined />}
                    tone="slate"
                    valueClassName="is-sm"
                    foot="00:00–24:00 UTC+8"
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="当日入金上限 (USD)"
                    value={stats.dailyJoinUnlimited ? '不限制' : fmtUsd(stats.dailyJoinCapUsd)}
                    icon={<ThunderboltOutlined />}
                    tone="amber"
                    foot={stats.dailyJoinUnlimited ? '合约 dailyJoinCapUsd = 0' : '全网当日累计折 U'}
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="当日已入金 (USD)"
                    value={fmtUsd(stats.dailyJoinedUsdToday)}
                    icon={<DollarOutlined />}
                    tone="blue"
                    foot="跨日后自动归零"
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="当日剩余 (USD)"
                    value={stats.dailyJoinUnlimited ? '不限制' : fmtUsd(stats.dailyJoinRemainingUsd)}
                    icon={<FundOutlined />}
                    tone="green"
                    foot={
                      stats.dailyJoinUnlimited ? (
                        '未设上限'
                      ) : (
                        <Progress
                          percent={dailyJoinPercent(stats)}
                          size="small"
                          showInfo
                          format={(p) => `已用 ${p ?? 0}%`}
                        />
                      )
                    }
                  />
                </Col>
              </Row>
            </section>

            <section className="crm-dash-section">
              <div className="crm-dash-section-head">
                <h3 className="crm-dash-section-title">供应 · 计提 · 储备</h3>
              </div>
              <Row gutter={[14, 14]}>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="总供应"
                    value={fmtUsd(stats.totalSupply)}
                    icon={<FundOutlined />}
                    tone="slate"
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="可回收余额 (CRAM)"
                    value={fmtUsd(stats.availableExcessCrm)}
                    icon={<ShoppingOutlined />}
                    tone="amber"
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="上次计提"
                    value={fmtTs(stats.lastRebaseTime)}
                    icon={<ClockCircleOutlined />}
                    tone="slate"
                    valueClassName="is-sm"
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <MetricCard
                    label="Business 持有 CRAM"
                    value={fmtUsd(stats.businessCrm)}
                    icon={<BankOutlined />}
                    tone="teal"
                  />
                </Col>
                <Col xs={24}>
                  <Card className="crm-dash-panel" variant="borderless">
                    <div className="crm-dash-reserve-grid">
                      <div className="crm-dash-reserve-item">
                        <div className="crm-dash-metric-label">静态储备</div>
                        <div className="crm-dash-metric-value">{fmtUsd(stats.staticRewardReserve)}</div>
                      </div>
                      <div className="crm-dash-reserve-item">
                        <div className="crm-dash-metric-label">节点储备</div>
                        <div className="crm-dash-metric-value">{fmtUsd(stats.nodeRewardReserve)}</div>
                      </div>
                      <div className="crm-dash-reserve-item">
                        <div className="crm-dash-metric-label">动态留存</div>
                        <div className="crm-dash-metric-value">{fmtUsd(stats.dynamicReserve)}</div>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </section>

            <section className="crm-dash-section">
              <div className="crm-dash-section-head">
                <h3 className="crm-dash-section-title">每日入金与分布</h3>
              </div>
              <Row gutter={[14, 14]}>
                <Col xs={24} lg={12}>
                  <Card
                    title="每日入金"
                    className="crm-dash-panel"
                    variant="borderless"
                    extra={
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        近 30 日 · UTC+8 · 折 U，不含档位系数
                      </Typography.Text>
                    }
                  >
                    {dailyJoinData.length ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={dailyJoinData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="crmDailyJoinFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1677ff" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#1677ff" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
                          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={{ fill: '#6b7280', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) =>
                              v >= 1000 ? `${Math.round(v).toLocaleString('zh-CN')}` : v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
                            }
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as (typeof dailyJoinData)[number];
                              return (
                                <div className="crm-dash-chart-tip">
                                  <div className="crm-dash-chart-tip-date">{row.fullDate}</div>
                                  <div>
                                    {row.usdLabel} U / {row.bnbLabel} BNB
                                  </div>
                                  <div>{row.count} 笔</div>
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="usd"
                            name="入金折 U"
                            stroke="#1677ff"
                            strokeWidth={2}
                            fill="url(#crmDailyJoinFill)"
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <Empty description="暂无入金记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <PriceKlineCard />
                </Col>
                <Col xs={24} lg={12}>
                  <Card title="层级深度分布" className="crm-dash-panel" variant="borderless">
                    {depthData.length ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={depthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
                          <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="count" name="人数" radius={[8, 8, 0, 0]} fill="#0d9488" maxBarSize={48} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <Empty description="暂无团队数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title="节点等级分布" className="crm-dash-panel" variant="borderless">
                    {levelData.length ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={levelData}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={88}
                            paddingAngle={2}
                            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          >
                            {levelData.map((_, i) => (
                              <Cell key={levelData[i].name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <Empty description="暂无等级数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card
                    title="索引业绩快照"
                    className="crm-dash-panel"
                    variant="borderless"
                    extra={
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        <ThunderboltOutlined /> 库内快照
                      </Typography.Text>
                    }
                  >
                    <div className="crm-dash-snapshot">
                      <div className="crm-dash-snapshot-item">
                        <div className="crm-dash-metric-label">个人业绩合计 (库)</div>
                        <div className="crm-dash-metric-value is-sm">{fmtUsd(stats.indexedOwnUsdSum)}</div>
                      </div>
                      <div className="crm-dash-snapshot-item">
                        <div className="crm-dash-metric-label">额度合计 (库)</div>
                        <div className="crm-dash-metric-value is-sm">{fmtUsd(stats.indexedQuotaUsdSum)}</div>
                      </div>
                      <div className="crm-dash-snapshot-item">
                        <div className="crm-dash-metric-label">链上总额度</div>
                        <div className="crm-dash-metric-value is-sm">{fmtUsd(stats.totalQuotaUsd)}</div>
                      </div>
                      <div className="crm-dash-snapshot-item">
                        <div className="crm-dash-metric-label">待补扣出局</div>
                        <div className="crm-dash-metric-value is-sm">{fmtInt(stats.pendingExitCount)}</div>
                      </div>
                    </div>
                    <Typography.Paragraph className="crm-dash-note">
                      总业绩为入金事件 ParticipationAdded 的折 U 合计（与链上笔数对齐时），不含 2.0×/2.2×/2.5× 档位。额度见右侧「链上总额度」。
                    </Typography.Paragraph>
                  </Card>
                </Col>
              </Row>
            </section>
          </>
        )}
      </Spin>
    </div>
  );
}
