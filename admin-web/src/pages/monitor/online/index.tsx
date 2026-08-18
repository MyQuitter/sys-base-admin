import { Button, Popconfirm, Table, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { getOnlineUsers, kickoutUser, type OnlineUserItem } from '@/api/monitor';
import { AuthButton } from '@/components/AuthButton';
import { useAuthStore } from '@/stores/useAuthStore';
import { formatDateTime } from '@/utils/format';

/**
 * 在线用户页：展示 Redis 在线会话，支持强制下线。
 */
export default function OnlineUsersPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OnlineUserItem[]>([]);
  const canKickout = useAuthStore((s) => s.hasPermission('monitor:online'));

  const loadData = async () => {
    setLoading(true);
    try {
      const items = await getOnlineUsers();
      setData(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleKickout = async (userId: number) => {
    await kickoutUser(userId);
    message.success('已强制下线');
    loadData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          在线用户
        </Typography.Title>
        <Button onClick={loadData}>刷新</Button>
      </div>
      <Table<OnlineUserItem>
        rowKey="userId"
        loading={loading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: '用户ID', dataIndex: 'userId', width: 90 },
          { title: '用户名', dataIndex: 'username', width: 120 },
          { title: '昵称', dataIndex: 'nickname', width: 120 },
          { title: 'IP', dataIndex: 'ip', width: 140 },
          {
            title: '登录时间',
            dataIndex: 'loginTime',
            width: 200,
            render: (v: string) => formatDateTime(v),
          },
          ...(canKickout
            ? [
                {
                  title: '操作',
                  width: 120,
                  render: (_: unknown, record: OnlineUserItem) => (
                    <Popconfirm
                      title="确认强制下线该用户？"
                      onConfirm={() => handleKickout(record.userId)}
                    >
                      <AuthButton type="link" danger permission="monitor:online">
                        强制下线
                      </AuthButton>
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
