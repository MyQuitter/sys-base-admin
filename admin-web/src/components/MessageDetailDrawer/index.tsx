import { Drawer, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getMessageDetail, type MessageItem } from '@/api/message';
import { useMessageStore } from '@/stores/useMessageStore';
import { formatDateTime } from '@/utils/format';

interface MessageDetailDrawerProps {
  messageId?: number;
  open: boolean;
  onClose: () => void;
}

/**
 * 消息详情抽屉，顶栏铃铛与消息页共用。
 */
export function MessageDetailDrawer({ messageId, open, onClose }: MessageDetailDrawerProps) {
  const refresh = useMessageStore((s) => s.refresh);
  const [detail, setDetail] = useState<MessageItem>();

  useEffect(() => {
    if (!open || !messageId) {
      setDetail(undefined);
      return;
    }
    getMessageDetail(messageId)
      .then((data) => {
        setDetail(data);
        return refresh();
      })
      .catch(() => undefined);
  }, [open, messageId, refresh]);

  return (
    <Drawer title={detail?.title ?? '消息详情'} open={open} width={480} onClose={onClose} destroyOnHidden>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {formatDateTime(detail?.createdAt)}
      </Typography.Paragraph>
      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{detail?.content}</Typography.Paragraph>
    </Drawer>
  );
}
