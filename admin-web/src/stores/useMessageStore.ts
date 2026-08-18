import { create } from 'zustand';
import {
  getMyMessages,
  getUnreadCount,
  markAllMessagesRead,
  markMessageRead,
  type MessageItem,
} from '@/api/message';

const POLL_INTERVAL_MS = 60_000;
const POPUP_SHOWN_KEY = 'message-popup-shown-ids';

function getShownPopupIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(POPUP_SHOWN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function addShownPopupId(id: number) {
  const ids = getShownPopupIds();
  ids.add(id);
  sessionStorage.setItem(POPUP_SHOWN_KEY, JSON.stringify([...ids]));
}

interface MessageState {
  unreadCount: number;
  recentMessages: MessageItem[];
  popupQueue: MessageItem[];
  pollTimer?: ReturnType<typeof setInterval>;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  shiftPopup: () => MessageItem | undefined;
  markPopupShown: (id: number) => void;
  dismissPopup: (id: number) => void;
  startPolling: () => void;
  stopPolling: () => void;
  reset: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  unreadCount: 0,
  recentMessages: [],
  popupQueue: [],

  refresh: async () => {
    const [{ count }, recent] = await Promise.all([
      getUnreadCount(),
      getMyMessages({ page: 1, pageSize: 5, isRead: 0 }),
    ]);

    const shownIds = getShownPopupIds();
    const newPopups = recent.items.filter(
      (m) => m.isPopup === 1 && m.priority === 'important' && !shownIds.has(m.id),
    );

    set((state) => {
      const existingIds = new Set(state.popupQueue.map((m) => m.id));
      const merged = [...state.popupQueue];
      for (const item of newPopups) {
        if (!existingIds.has(item.id)) merged.push(item);
      }
      return {
        unreadCount: count,
        recentMessages: recent.items,
        popupQueue: merged,
      };
    });
  },

  markRead: async (id) => {
    await markMessageRead(id);
    await get().refresh();
  },

  markAllRead: async () => {
    await markAllMessagesRead();
    await get().refresh();
  },

  shiftPopup: () => {
    const queue = get().popupQueue;
    if (!queue.length) return undefined;
    const [first, ...rest] = queue;
    set({ popupQueue: rest });
    return first;
  },

  markPopupShown: (id) => {
    addShownPopupId(id);
  },

  dismissPopup: (id) => {
    set((state) => ({
      popupQueue: state.popupQueue.filter((m) => m.id !== id),
    }));
  },

  startPolling: () => {
    const { pollTimer, refresh } = get();
    if (pollTimer) return;
    refresh().catch(() => undefined);
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    set({ pollTimer: timer });
  },

  stopPolling: () => {
    const { pollTimer } = get();
    if (pollTimer) clearInterval(pollTimer);
    set({ pollTimer: undefined });
  },

  reset: () => {
    get().stopPolling();
    sessionStorage.removeItem(POPUP_SHOWN_KEY);
    set({ unreadCount: 0, recentMessages: [], popupQueue: [] });
  },
}));
