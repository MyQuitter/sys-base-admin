import type { MenuTreeNode } from '@/api/menu';

/**
 * 根据路由路径在菜单树中查找显示标题。
 * @param nodes - 后端菜单树
 * @param path - 当前路由 path
 */
export function findMenuTitle(nodes: MenuTreeNode[], path: string): string | undefined {
  for (const node of nodes) {
    if (node.path === path) return node.name;
    if (node.children?.length) {
      const found = findMenuTitle(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

/** 路由对应页面标题（含不在菜单树中的页面） */
const STATIC_PAGE_TITLES: Record<string, string> = {
  '/dashboard': '首页',
  '/profile': '个人中心',
  '/profile/messages': '我的消息',
  '/system/user': '系统用户',
  '/system/notice': '系统公告',
  '/system/settings': '系统设置',
  '/crm-whitelist/joins': '入金记录',
};

export function getPageTitle(nodes: MenuTreeNode[], path: string): string {
  return findMenuTitle(nodes, path) ?? STATIC_PAGE_TITLES[path] ?? '页面';
}

/**
 * 根据路径解析应高亮的侧边栏菜单 key 列表（含父级）。
 */
export function findMenuOpenKeys(nodes: MenuTreeNode[], path: string): string[] {
  const walk = (list: MenuTreeNode[], parents: string[]): string[] | null => {
    for (const node of list) {
      const key = node.path ?? `group-${node.id}`;
      if (node.path === path) return [...parents, key];
      if (node.children?.length) {
        const found = walk(node.children, [...parents, key]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(nodes, []) ?? [path];
}
