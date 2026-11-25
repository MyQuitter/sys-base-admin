export const BEIJING_TZ = 'Asia/Shanghai';

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

/** 格式化为北京时间 `YYYY-MM-DD HH:mm:ss`（展示用，存储仍用 Date / ISO） */
export function formatBeijingDateTime(date: Date = new Date()) {
  return beijingDateTimeFmt.format(date);
}
