const BEIJING_TZ = 'Asia/Shanghai';

const beijingDateTimeFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: BEIJING_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const beijingTimeFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: BEIJING_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * 解析接口时间。
 * - 数字：Unix 秒/毫秒（UTC 瞬时）
 * - 带 Z / 偏移：真实瞬时
 * - 无时区 DATETIME：按北京时间墙钟（与 MySQL DATETIME 一致）
 */
export function parseApiDate(value: string | Date | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  const s = value.trim();
  if (!s) return new Date(Number.NaN);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(`${s.replace(' ', 'T')}+08:00`);
}

/** 格式化为北京时间 `YYYY-MM-DD HH:mm:ss` */
export function formatDateTime(value?: string | Date | number | null) {
  if (value === undefined || value === null || value === '') return '-';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return beijingDateTimeFmt.format(date);
}

/** 格式化为北京时间 `HH:mm:ss` */
export function formatTime(value?: string | Date | number | null) {
  if (value === undefined || value === null || value === '') return '-';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return beijingTimeFmt.format(date);
}

/** 北京时间当前小时（0–23），用于问候语等 */
export function getBeijingHour(date: Date = new Date()) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: BEIJING_TZ,
    hour: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .find((p) => p.type === 'hour')?.value;
  return Number(hour);
}

/** 字节数转可读大小 */
export function formatFileSize(size?: number | null) {
  if (size === undefined || size === null) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
