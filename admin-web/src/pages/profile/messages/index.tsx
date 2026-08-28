import { Button, Card, Drawer, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  getMessageDetail,
  getMyMessages,
  markAllMessagesRead,
  type MessageItem,
} from '@/api/message';
import { useMessageStore } from '@/stores/useMessageStore';
import { formatDateTime } from '@/utils/format';

/**
 * 我的消息：全部 / 未读列表与详情抽屉。
 */
export default function MyMessagesPage() {
  const refreshStore = useMessageStore((s) => s.refresh);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MessageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [detail, setDetail] = useState<MessageItem>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadData = async (p = page, ps = pageSize, currentTab = tab) => {
    setLoading(true);
    try {
      const res = await getMyMessages({
        page: p,
        pageSize: ps,
        isRead: currentTab === 'unread' ? 0 : undefined,
      });
      setData(res.items);
      setTotal(res.total);
      await refreshStore();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(1, pageSize, tab);
    setPage(1);
  }, [tab]);

  const openDetail = async (record: MessageItem) => {
    const detail = await getMessageDetail(record.id);
    setDetail(detail);
    setDrawerOpen(true);
    loadData(page, pageSize, tab);
  };

  return (
    <Card
      title="我的消息"
      extra={
        <Button
          onClick={async () => {
            await markAllMessagesRead();
            loadData(page, pageSize, tab);
          }}
        >
          全部标为已读
        </Button>
      }
    >
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as 'all' | 'unread')}
        items={[
          { key: 'all', label: '全部' },
          { key: 'unread', label: '未读' },
        ]}
      />
      <Table<MessageItem>
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
            loadData(p, ps, tab);
          },
        }}
        columns={[
          {
            title: '标题',
            dataIndex: 'title',
            render: (title: string, record) => (
              <Space>
                <Typography.Link onClick={() => openDetail(record)}>{title}</Typography.Link>
                {record.priority === 'important' && <Tag color="red">重要</Tag>}
              </Space>
            ),
          },
          {
            title: '状态',
            dataIndex: 'isRead',
            width: 90,
            render: (v: number) => (v === 1 ? <Tag>已读</Tag> : <Tag color="blue">未读</Tag>),
          },
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '操作',
            width: 100,
            render: (_, record) => (
              <Button type="link" onClick={() => openDetail(record)}>
                查看
              </Button>
            ),
          },
        ]}
      />

      <Drawer
        title={detail?.title}
        open={drawerOpen}
        size={480}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {formatDateTime(detail?.createdAt)}
        </Typography.Paragraph>
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{detail?.content}</Typography.Paragraph>
      </Drawer>
    </Card>
  );
}
