import type { ButtonProps } from 'antd';
import { Button } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore';

interface AuthButtonProps extends ButtonProps {
  /** RBAC 权限码，无权限时不渲染按钮 */
  permission: string;
}

/**
 * 权限按钮：当前用户无 `permission` 时返回 null，用于列表页操作栏。
 * 继承 Ant Design Button 的全部 Props。
 */
export function AuthButton({ permission, children, ...rest }: AuthButtonProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission(permission));
  if (!hasPermission) return null;
  return <Button {...rest}>{children}</Button>;
}
