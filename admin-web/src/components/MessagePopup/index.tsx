import { Button, Modal, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MessageItem } from '@/api/message';
import { useMessageStore } from '@/stores/useMessageStore';
import '@/components/MessageBell/message-bell.css';

/**
 * 重要消息弹窗：登录后或轮询到新消息时依次展示。
 */
export function MessagePopup() {
  const navigate = useNavigate();
  const popupQueue = useMessageStore((s) => s.popupQueue);
  const shiftPopup = useMessageStore((s) => s.shiftPopup);
  const markPopupShown = useMessageStore((s) => s.markPopupShown);
  const dismissPopup = useMessageStore((s) => s.dismissPopup);
  const markRead = useMessageStore((s) => s.markRead);
  const [current, setCurrent] = useState<MessageItem>();

  useEffect(() => {
    if (!current && popupQueue.length) {
      const next = shiftPopup();
      if (next) {
        markPopupShown(next.id);
        setCurrent(next);
      }
    }
  }, [popupQueue, current, shiftPopup, markPopupShown]);

  const handleClose = async (read = true) => {
    if (!current) return;
    if (read) await markRead(current.id);
    dismissPopup(current.id);
    setCurrent(undefined);
  };

  return (
    <Modal
      title={
        <Space>
          <Typography.Text strong>{current?.title}</Typography.Text>
          {current?.priority === 'important' && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              重要
            </Typography.Text>
          )}
        </Space>
      }
      open={!!current}
      onCancel={() => handleClose(true)}
      footer={
        <Space>
          <Button onClick={() => handleClose(true)}>知道了</Button>
          <Button
            type="primary"
            onClick={async () => {
              const id = current?.id;
              await handleClose(true);
              if (id) navigate('/profile/messages');
            }}
          >
            查看全部
          </Button>
        </Space>
      }
      width={520}
      centered
      destroyOnHidden
    >
      <div className="pro-message-popup-content">{current?.content}</div>
    </Modal>
  );
}
