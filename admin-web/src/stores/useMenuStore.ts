import { create } from 'zustand';
import { getMenuTree, type MenuTreeNode } from '@/api/menu';

interface MenuState {
  /** 当前用户可见的菜单树 */
  menus: MenuTreeNode[];
  /** 是否已完成至少一次拉取 */
  loaded: boolean;
  /** 从后端拉取菜单并写入 Store */
  fetchMenus: () => Promise<void>;
  /** 登出时清空菜单缓存 */
  reset: () => void;
}

/**
 * 侧边栏菜单全局状态，数据来源于 `GET /api/menus/tree`。
 */
export const useMenuStore = create<MenuState>((set) => ({
  menus: [],
  loaded: false,
  fetchMenus: async () => {
    const menus = await getMenuTree();
    set({ menus, loaded: true });
  },
  reset: () => set({ menus: [], loaded: false }),
}));
