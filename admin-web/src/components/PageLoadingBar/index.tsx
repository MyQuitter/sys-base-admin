import { useLoadingStore } from '@/stores/useLoadingStore';
import './page-loading-bar.css';

/**
 * 管理页顶栏加载进度条：固定在 Header 下方，随 API 请求自动显示。
 */
export function PageLoadingBar() {
  const visible = useLoadingStore((s) => s.visible);
  const percent = useLoadingStore((s) => s.percent);

  return (
    <div
      className={`page-loading-bar${visible ? ' is-active' : ''}`}
      aria-hidden={!visible}
    >
      <div className="page-loading-bar-track">
        <div className="page-loading-bar-inner" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
