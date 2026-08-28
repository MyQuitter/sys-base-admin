import { Button, Form, Input, Select, Space, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  exportEventLogs,
  getEnabledChains,
  getEventLogs,
  type EventLogItem,
} from '@/api/blockchain';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';

import { toast } from '@/utils/toast';
/**
 * 合约事件日志：订阅自动抓取结果查询与导出。
 */
export default function BlockchainEventLogPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EventLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{
    chainId?: number;
    eventName?: string;
    txHash?: string;
  }>({});
  const [chainOptions, setChainOptions] = useState<{ label: string; value: number }[]>([]);
  const [searchForm] = Form.useForm();

  const loadChains = async () => {
    const chains = await getEnabledChains();
    setChainOptions(chains.map((c) => ({ label: c.name, value: c.chainId })));
  };

  const loadData = useCallback(async (
    p = page,
    ps = pageSize,
    f = filters,
  ) => {
    setLoading(true);
    try {
      const res = await getEventLogs({ page: p, pageSize: ps, ...f });
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
    }, 20000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    const cleaned = {
      chainId: values.chainId,
      eventName: values.eventName?.trim() || undefined,
      txHash: values.txHash?.trim() || undefined,
    };
    setFilters(cleaned);
    setPage(1);
    loadData(1, pageSize, cleaned);
  };

  const handleExport = async () => {
    try {
      await exportEventLogs(filters);
      toast.success('导出成功');
    } catch {
      // exportEventLogs 已提示
    }
  };

  const chainName = (chainId: number) =>
    chainOptions.find((c) => c.value === chainId)?.label ?? String(chainId);

  const formatArgs = (args?: Record<string, unknown>) => {
    if (!args || Object.keys(args).length === 0) return '-';
    const text = JSON.stringify(args);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  };

  return (
    <>
      <Form form={searchForm} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="chainId" label="链">
          <Select allowClear placeholder="全部" style={{ width: 160 }} options={chainOptions} />
        </Form.Item>
        <Form.Item name="eventName" label="事件">
          <Input allowClear placeholder="如 Transfer" style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="txHash" label="交易哈希">
          <Input allowClear placeholder="0x..." style={{ width: 200 }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <AuthButton permission="event-sub:list" onClick={handleExport}>
              导出
            </AuthButton>
          </Space>
        </Form.Item>
      </Form>

      <PageTable<EventLogItem>
        title="事件日志"
        toolbarExtra={<Tag color="processing">每 20 秒自动刷新</Tag>}
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
          { title: '链', dataIndex: 'chainId', width: 100, render: (v: number) => chainName(v) },
          { title: '事件', dataIndex: 'eventName', width: 110 },
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
          { title: '区块', dataIndex: 'blockNumber', width: 100 },
          { title: 'LogIndex', dataIndex: 'logIndex', width: 90 },
          {
            title: '参数',
            dataIndex: 'args',
            ellipsis: true,
            render: (v?: Record<string, unknown>) => formatArgs(v),
          },
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (v: string) => formatDateTime(v),
          },
        ]}
      />
    </>
  );
}
