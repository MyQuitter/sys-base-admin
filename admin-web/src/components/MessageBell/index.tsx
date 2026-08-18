import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, Popover, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MessageItem } from '@/api/message';
import { useMessageStore } from '@/stores/useMessageStore';
import { formatDateTime } from '@/utils/format';
import './message-bell.css';

interface MessageBellProps {
  onOpenMessage?: (message: MessageItem) => void;
}

/**
 * 顶栏消息铃铛：未读角标 + 最近消息列表。
 */
export function MessageBell({ onOpenMessage }: MessageBellProps) {
  const navigate = useNavigate();
  const unreadCount = useMessageStore((s) => s.unreadCount);
  const recentMessages = useMessageStore((s) => s.recentMessages);
  const markAllRead = useMessageStore((s) => s.markAllRead);
  const [open, setOpen] = useState(false);

  const content = (
    <div className="pro-message-bell-panel">
      <div className="pro-message-bell-header">
        <Typography.Text strong>消息通知</Typography.Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={() => markAllRead()}>
            全部已读
          </Button>
        )}
      </div>
      <div className="pro-message-bell-list">
        {recentMessages.length ? (
          recentMessages.map((item) => (
            <div
              key={item.id}
              className="pro-message-bell-item"
              onClick={() => {
                setOpen(false);
                onOpenMessage?.(item);
              }}
            >
              <div className="pro-message-bell-item-title">{item.title}</div>
              <div className="pro-message-bell-item-meta">{formatDateTime(item.createdAt)}</div>
            </div>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无未读消息" />
        )}
      </div>
      <div className="pro-message-bell-footer">
        <Button type="link" size="small" onClick={() => setOpen(false)}>
          关闭
        </Button>
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            navigate('/profile/messages');
          }}
        >
          查看全部
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
    >
      <div className="pro-message-bell-trigger">
        <Badge count={unreadCount} size="small" offset={[2, 0]}>
          <BellOutlined style={{ fontSize: 18, color: '#595959' }} />
        </Badge>
      </div>
    </Popover>
  );
}
