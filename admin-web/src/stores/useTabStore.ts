import { create } from 'zustand';

/** 多标签页项 */
export interface AppTab {
  key: string;
  label: string;
  closable: boolean;
}

interface TabState {
  tabs: AppTab[];
  activeKey: string;
  /** 打开或激活标签页 */
  openTab: (key: string, label: string) => void;
  /** 关闭标签页，返回关闭后应激活的路由 key */
  closeTab: (key: string) => string;
  /** 关闭当前标签左侧可关闭的标签 */
  closeLeftTabs: () => string;
  /** 关闭当前标签右侧可关闭的标签 */
  closeRightTabs: () => string;
  /** 关闭除当前与首页外的标签 */
  closeOtherTabs: () => string;
  /** 关闭除首页外全部标签 */
  closeAllTabs: () => string;
  setActiveKey: (key: string) => void;
  /** 根据最新菜单标题刷新已打开标签的显示名 */
  syncTabLabels: (resolveTitle: (path: string) => string) => void;
  reset: () => void;
}

const HOME_TAB: AppTab = { key: '/dashboard', label: '首页', closable: false };
const TAB_STORAGE_KEY = 'app-open-tabs';

function loadPersistedTabs(): { tabs: AppTab[]; activeKey: string } {
  const fallback = { tabs: [HOME_TAB], activeKey: HOME_TAB.key };
  const raw = localStorage.getItem(TAB_STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { tabs?: AppTab[]; activeKey?: string };
    const tabs =
      parsed.tabs?.filter((tab) => tab?.key && tab?.label).map((tab) => ({
        key: tab.key,
        label: tab.label,
        closable: tab.key !== HOME_TAB.key,
      })) ?? [];
    const mergedTabs = [HOME_TAB, ...tabs.filter((tab) => tab.key !== HOME_TAB.key)];
    const activeKey = mergedTabs.some((tab) => tab.key === parsed.activeKey) ? parsed.activeKey! : HOME_TAB.key;
    return { tabs: mergedTabs, activeKey };
  } catch {
    return fallback;
  }
}

function persistTabs(tabs: AppTab[], activeKey: string) {
  localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ tabs, activeKey }));
}

const persistedState = loadPersistedTabs();

/**
 * 多标签页状态：首页固定不可关闭，其余页面从侧边栏打开时追加标签。
 */
export const useTabStore = create<TabState>((set, get) => ({
  tabs: persistedState.tabs,
  activeKey: persistedState.activeKey,
  openTab: (key, label) => {
    const { tabs } = get();
    const exists = tabs.some((t) => t.key === key);
    const nextTabs = exists
      ? tabs.map((tab) =>
          tab.key === key && tab.label !== label
            ? { ...tab, label }
            : tab,
        )
      : [...tabs, { key, label, closable: key !== '/dashboard' }];
    persistTabs(nextTabs, key);
    set({
      tabs: nextTabs,
      activeKey: key,
    });
  },
  closeTab: (key) => {
    if (key === '/dashboard') return '/dashboard';
    const { tabs, activeKey } = get();
    const nextTabs = tabs.filter((t) => t.key !== key);
    let nextKey = activeKey;
    if (activeKey === key) {
      const idx = tabs.findIndex((t) => t.key === key);
      const fallback = nextTabs[Math.max(0, idx - 1)] ?? HOME_TAB;
      nextKey = fallback.key;
    }
    persistTabs(nextTabs.length ? nextTabs : [HOME_TAB], nextKey);
    set({ tabs: nextTabs.length ? nextTabs : [HOME_TAB], activeKey: nextKey });
    return nextKey;
  },
  closeLeftTabs: () => {
    const { tabs, activeKey } = get();
    const activeIdx = tabs.findIndex((t) => t.key === activeKey);
    const nextTabs = tabs.filter((t, i) => i >= activeIdx || !t.closable);
    persistTabs(nextTabs.length ? nextTabs : [HOME_TAB], activeKey);
    set({ tabs: nextTabs.length ? nextTabs : [HOME_TAB], activeKey });
    return activeKey;
  },
  closeRightTabs: () => {
    const { tabs, activeKey } = get();
    const activeIdx = tabs.findIndex((t) => t.key === activeKey);
    const nextTabs = tabs.filter((t, i) => i <= activeIdx || !t.closable);
    persistTabs(nextTabs.length ? nextTabs : [HOME_TAB], activeKey);
    set({ tabs: nextTabs.length ? nextTabs : [HOME_TAB], activeKey });
    return activeKey;
  },
  closeOtherTabs: () => {
    const { tabs, activeKey } = get();
    const nextTabs = tabs.filter((t) => t.key === activeKey || !t.closable);
    persistTabs(nextTabs.length ? nextTabs : [HOME_TAB], activeKey);
    set({ tabs: nextTabs.length ? nextTabs : [HOME_TAB], activeKey });
    return activeKey;
  },
  closeAllTabs: () => {
    persistTabs([HOME_TAB], HOME_TAB.key);
    set({ tabs: [HOME_TAB], activeKey: HOME_TAB.key });
    return HOME_TAB.key;
  },
  setActiveKey: (key) => {
    persistTabs(get().tabs, key);
    set({ activeKey: key });
  },
  syncTabLabels: (resolveTitle) => {
    const { tabs, activeKey } = get();
    const nextTabs = tabs.map((tab) => {
      const label = resolveTitle(tab.key);
      return label && label !== '页面' ? { ...tab, label } : tab;
    });
    persistTabs(nextTabs, activeKey);
    set({ tabs: nextTabs });
  },
  reset: () => {
    localStorage.removeItem(TAB_STORAGE_KEY);
    set({ tabs: [HOME_TAB], activeKey: '/dashboard' });
  },
}));
