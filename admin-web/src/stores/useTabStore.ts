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
  /** 关闭除当前外的标签 */
  closeOtherTabs: () => string;
  /** 关闭到仅剩当前标签 */
  closeAllTabs: () => string;
  setActiveKey: (key: string) => void;
  /** 根据最新菜单标题刷新已打开标签的显示名 */
  syncTabLabels: (resolveTitle: (path: string) => string) => void;
  /** 去掉当前用户已不可见的标签（如未分配的工作台） */
  dropUnauthorizedTabs: (allowed: (path: string) => boolean, fallbackKey?: string) => string;
  reset: () => void;
}

const TAB_STORAGE_KEY = 'app-open-tabs';

function loadPersistedTabs(): { tabs: AppTab[]; activeKey: string } {
  const empty = { tabs: [] as AppTab[], activeKey: '' };
  const raw = localStorage.getItem(TAB_STORAGE_KEY);
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as { tabs?: AppTab[]; activeKey?: string };
    const tabs =
      parsed.tabs?.filter((tab) => tab?.key && tab?.label).map((tab) => ({
        key: tab.key,
        label: tab.label,
        closable: true,
      })) ?? [];
    const activeKey = tabs.some((tab) => tab.key === parsed.activeKey) ? parsed.activeKey! : (tabs[0]?.key ?? '');
    return { tabs, activeKey };
  } catch {
    return empty;
  }
}

function persistTabs(tabs: AppTab[], activeKey: string) {
  localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ tabs, activeKey }));
}

const persistedState = loadPersistedTabs();

/**
 * 多标签页状态：标签均可关闭，不再强制钉死工作台。
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
      : [...tabs, { key, label, closable: true }];
    persistTabs(nextTabs, key);
    set({
      tabs: nextTabs,
      activeKey: key,
    });
  },
  closeTab: (key) => {
    const { tabs, activeKey } = get();
    const nextTabs = tabs.filter((t) => t.key !== key);
    let nextKey = activeKey;
    if (activeKey === key) {
      const idx = tabs.findIndex((t) => t.key === key);
      nextKey = nextTabs[Math.max(0, idx - 1)]?.key ?? nextTabs[0]?.key ?? '';
    }
    persistTabs(nextTabs, nextKey);
    set({ tabs: nextTabs, activeKey: nextKey });
    return nextKey;
  },
  closeLeftTabs: () => {
    const { tabs, activeKey } = get();
    const activeIdx = tabs.findIndex((t) => t.key === activeKey);
    const nextTabs = tabs.filter((t, i) => i >= activeIdx || !t.closable);
    persistTabs(nextTabs, activeKey);
    set({ tabs: nextTabs, activeKey });
    return activeKey;
  },
  closeRightTabs: () => {
    const { tabs, activeKey } = get();
    const activeIdx = tabs.findIndex((t) => t.key === activeKey);
    const nextTabs = tabs.filter((t, i) => i <= activeIdx || !t.closable);
    persistTabs(nextTabs, activeKey);
    set({ tabs: nextTabs, activeKey });
    return activeKey;
  },
  closeOtherTabs: () => {
    const { tabs, activeKey } = get();
    const nextTabs = tabs.filter((t) => t.key === activeKey || !t.closable);
    persistTabs(nextTabs, activeKey);
    set({ tabs: nextTabs, activeKey });
    return activeKey;
  },
  closeAllTabs: () => {
    const { tabs, activeKey } = get();
    const current = tabs.find((t) => t.key === activeKey) ?? tabs[0];
    const nextTabs = current ? [current] : [];
    persistTabs(nextTabs, current?.key ?? '');
    set({ tabs: nextTabs, activeKey: current?.key ?? '' });
    return current?.key ?? '';
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
  dropUnauthorizedTabs: (allowed, fallbackKey) => {
    const { tabs, activeKey } = get();
    const nextTabs = tabs.filter((tab) => allowed(tab.key));
    if (nextTabs.length === tabs.length) return activeKey;
    const nextKey = nextTabs.some((t) => t.key === activeKey)
      ? activeKey
      : (fallbackKey && nextTabs.some((t) => t.key === fallbackKey) ? fallbackKey : nextTabs[0]?.key ?? fallbackKey ?? '');
    persistTabs(nextTabs, nextKey);
    set({ tabs: nextTabs, activeKey: nextKey });
    return nextKey;
  },
  reset: () => {
    localStorage.removeItem(TAB_STORAGE_KEY);
    set({ tabs: [], activeKey: '' });
  },
}));
