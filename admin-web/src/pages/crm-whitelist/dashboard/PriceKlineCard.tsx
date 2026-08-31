import { Card, Empty, Segmented, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  getCrmWlPriceKline,
  type CrmWlKlineCandle,
  type CrmWlKlineInterval,
  type CrmWlPriceKline,
} from '@/api/crm-whitelist';

const INTERVALS: { label: string; value: CrmWlKlineInterval }[] = [
  { label: '15分', value: '15m' },
  { label: '1时', value: '1h' },
  { label: '4时', value: '4h' },
  { label: '1日', value: '1d' },
];

const UTC8_MS = 8 * 60 * 60 * 1000;

function fmtPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 1) return n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  return n.toLocaleString('zh-CN', { maximumSignificantDigits: 6 });
}

function fmtTick(ts: number, interval: CrmWlKlineInterval) {
  const d = new Date(ts * 1000 + UTC8_MS);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (interval === '1d') return `${m}-${day}`;
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

function fmtTime(ts: number) {
  const d = new Date(ts * 1000 + UTC8_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

interface CandleShapeProps {
  x?: number;
  width?: number;
  payload?: CrmWlKlineCandle;
  background?: { y: number; height: number };
}

function renderCandle(min: number, max: number) {
  return (props: CandleShapeProps) => {
    const { x = 0, width = 0, payload, background } = props;
    if (!payload || !background || max <= min || width <= 0) return null;
    const span = max - min;
    const toY = (v: number) => background.y + (1 - (v - min) / span) * background.height;
    const up = payload.close >= payload.open;
    const color = up ? '#16a34a' : '#e11d48';
    const xMid = x + width / 2;
    const bodyW = Math.max(width * 0.55, 2);
    const bodyX = xMid - bodyW / 2;
    const yHigh = toY(payload.high);
    const yLow = toY(payload.low);
    const yOpen = toY(payload.open);
    const yClose = toY(payload.close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(Math.abs(yClose - yOpen), 1);
    return (
      <g>
        <line x1={xMid} y1={yHigh} x2={xMid} y2={yLow} stroke={color} strokeWidth={1} />
        <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
      </g>
    );
  };
}

export function PriceKlineCard() {
  const [interval, setInterval] = useState<CrmWlKlineInterval>('1h');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CrmWlPriceKline | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getCrmWlPriceKline(interval)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [interval]);

  const candles = data?.candles ?? [];
  const { yMin, yMax } = useMemo(() => {
    if (!candles.length) return { yMin: 0, yMax: 1 };
    let min = candles[0].low;
    let max = candles[0].high;
    for (const c of candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    const pad = (max - min) * 0.08 || max * 0.04;
    return { yMin: Math.max(0, min - pad), yMax: max + pad };
  }, [candles]);

  const last = candles.at(-1);
  const first = candles[0];
  const change = last && first && first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const up = change >= 0;

  return (
    <Card
      title="CRAM 价格 K 线"
      className="crm-dash-panel"
      variant="borderless"
      extra={
        <Segmented
          size="small"
          value={interval}
          options={INTERVALS}
          onChange={(v) => setInterval(v as CrmWlKlineInterval)}
        />
      }
    >
      {data?.pairName ? (
        <Typography.Text type="secondary" className="crm-dash-kline-meta">
          {data.pairName}
          {last ? (
            <>
              {' · '}
              <span className={up ? 'is-up' : 'is-down'}>
                {fmtPrice(last.close)} USD ({up ? '+' : ''}
                {change.toFixed(2)}%)
              </span>
            </>
          ) : null}
          {' · '}
          UTC+8 · 薄饼现货
        </Typography.Text>
      ) : null}
      {candles.length ? (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={candles} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              tickFormatter={(v: number) => fmtTick(v, interval)}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v: number) => fmtPrice(v)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as CrmWlKlineCandle;
                const bull = row.close >= row.open;
                return (
                  <div className="crm-dash-chart-tip">
                    <div className="crm-dash-chart-tip-date">{fmtTime(row.time)} UTC+8</div>
                    <div>开 {fmtPrice(row.open)}</div>
                    <div>高 {fmtPrice(row.high)}</div>
                    <div>低 {fmtPrice(row.low)}</div>
                    <div className={bull ? 'is-up' : 'is-down'}>收 {fmtPrice(row.close)}</div>
                    <div>额 {row.volume.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} USD</div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="high"
              isAnimationActive={false}
              fill="transparent"
              maxBarSize={18}
              background={{ fill: 'transparent' }}
              shape={renderCandle(yMin, yMax)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <Empty
          description={loading ? 'K 线加载中…' : '暂无 K 线（池子未收录或暂无成交）'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Card>
  );
}
