import * as Icons from '@ant-design/icons';
import type { ComponentType, ReactNode } from 'react';

/**
 * 将后端存储的 Ant Design 图标名字符串渲染为图标组件。
 * @param name - 如 `DashboardOutlined`，与 @ant-design/icons 导出名一致
 * @returns 图标 React 节点，未知名称时返回 undefined
 */
export function renderMenuIcon(name?: string): ReactNode {
  if (!name) return undefined;
  const Icon = (Icons as unknown as Record<string, ComponentType>)[name];
  return Icon ? <Icon /> : undefined;
}
