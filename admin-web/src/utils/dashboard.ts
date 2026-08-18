import type { MenuTreeNode } from '@/api/menu';

/** 按时段返回问候语 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** 秒数格式化为可读运行时长 */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

/** 提取菜单树叶子节点作为快捷入口 */
export function flattenMenuLinks(nodes: MenuTreeNode[], limit = 8): MenuTreeNode[] {
  const result: MenuTreeNode[] = [];
  const walk = (list: MenuTreeNode[]) => {
    for (const node of list) {
      if (result.length >= limit) return;
      if (node.children?.length) {
        walk(node.children);
      } else if (node.path && node.path !== '/dashboard') {
        result.push(node);
      }
    }
  };
  walk(nodes);
  return result;
}
