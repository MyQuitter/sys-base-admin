/** RPC URL 脱敏，隐藏用户名密码与常见 API Key 片段 */
export function maskRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    const maskedPath = parsed.pathname.replace(/\/v\d+\/[a-zA-Z0-9]{16,}/g, '/v*/***');
    parsed.pathname = maskedPath;
    return parsed.toString();
  } catch {
    return '***';
  }
}

export function maskRpcUrls(urls: string[]): string[] {
  return urls.map(maskRpcUrl);
}
