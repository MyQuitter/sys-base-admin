/** 应用浏览器标题与 favicon */
export function applySiteBranding(siteName: string, faviconUrl?: string) {
  document.title = siteName;

  if (!faviconUrl) return;

  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = `${faviconUrl}?t=${Date.now()}`;
}

/** 拼接带缓存戳的资源地址，避免浏览器缓存旧图 */
export function withCacheBust(url?: string) {
  if (!url) return undefined;
  return `${url}?t=${Date.now()}`;
}
