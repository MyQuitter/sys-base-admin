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

/** 菜单树是否包含指定 path */
export function menuTreeHasPath(nodes: MenuTreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.path === path) return true;
    if (node.children?.length && menuTreeHasPath(node.children, path)) return true;
  }
  return false;
}

/** 可见菜单中第一个叶子路径（深度优先） */
export function firstMenuLeafPath(nodes: MenuTreeNode[]): string | undefined {
  for (const node of nodes) {
    if (node.children?.length) {
      const child = firstMenuLeafPath(node.children);
      if (child) return child;
    } else if (node.path && node.path !== '/') {
      return node.path;
    }
  }
  return undefined;
}

/**
 * 登录落地页：未分配工作台时进入第一个可见菜单，而不是写死 /dashboard。
 */
export function resolveLandingPath(nodes: MenuTreeNode[]): string {
  return firstMenuLeafPath(nodes) ?? '/dashboard';
}

/**
 * 当前路由是否允许停留（个人中心始终可进）。
 */
export function isPathAllowed(nodes: MenuTreeNode[], path: string): boolean {
  if (path === '/profile' || path.startsWith('/profile/')) return true;
  return menuTreeHasPath(nodes, path);
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
