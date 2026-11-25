/** 管理端部署子目录，来自 Vite `base`（如 /sashdjahkaf/） */
export function appBase() {
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return '';
  return base.replace(/\/$/, '');
}

export function appHref(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${appBase()}${p}`;
}
