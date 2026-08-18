import { create } from 'zustand';

interface LoadingState {
  visible: boolean;
  percent: number;
  _count: number;
  _timer: ReturnType<typeof setInterval> | null;
  /** 开始一次请求，引用计数 +1 */
  start: () => void;
  /** 结束一次请求，引用计数 -1 */
  done: () => void;
}

/**
 * 全局顶栏加载进度：多请求并发时引用计数，全部完成后收起。
 */
export const useLoadingStore = create<LoadingState>((set, get) => ({
  visible: false,
  percent: 0,
  _count: 0,
  _timer: null,

  start() {
    const count = get()._count + 1;
    if (count === 1) {
      const timer = setInterval(() => {
        const current = get().percent;
        if (current < 90) {
          set({ percent: current + Math.max(1, (90 - current) * 0.08) });
        }
      }, 150);
      set({ visible: true, percent: 12, _count: count, _timer: timer });
    } else {
      set({ _count: count });
    }
  },

  done() {
    const count = Math.max(0, get()._count - 1);
    if (count === 0) {
      const timer = get()._timer;
      if (timer) clearInterval(timer);
      set({ percent: 100, _count: 0, _timer: null });
      setTimeout(() => set({ visible: false, percent: 0 }), 280);
    } else {
      set({ _count: count });
    }
  },
}));
