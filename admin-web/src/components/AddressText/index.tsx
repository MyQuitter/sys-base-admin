import { CopyOutlined } from '@ant-design/icons';
import { Space, Typography } from 'antd';
import type { MouseEvent } from 'react';

import { toast } from '@/utils/toast';
/** 0x0437***E72e39 */
export function maskAddress(address?: string | null) {
  if (!address) return '-';
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}***${address.slice(-6)}`;
}

export function AddressText({
  address,
  successMessage = '已复制地址',
}: {
  address?: string | null;
  successMessage?: string;
}) {
  if (!address) return <>-</>;

  const onCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      toast.success(successMessage);
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <Space size={6} wrap={false}>
      <Typography.Text ellipsis={{ tooltip: address }} style={{ maxWidth: 160, marginBottom: 0 }}>
        {maskAddress(address)}
      </Typography.Text>
      <CopyOutlined onClick={(e) => void onCopy(e)} style={{ cursor: 'pointer', color: '#1677ff' }} />
    </Space>
  );
}
