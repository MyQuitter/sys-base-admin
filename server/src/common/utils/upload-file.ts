import { basename } from 'path';
import { BusinessException } from '../exceptions/business.exception';

/** 校验通过后的规范化类型：磁盘只写这里给出的扩展名，MIME 不信客户端。 */
export interface InspectedUpload {
  mimeType: string;
  ext: string;
  originalName: string;
}

const DANGEROUS_EXT = new Set([
  'php',
  'phtml',
  'pht',
  'phar',
  'php3',
  'php4',
  'php5',
  'php7',
  'php8',
  'cgi',
  'asp',
  'aspx',
  'jsp',
  'jspx',
  'exe',
  'sh',
  'bat',
  'cmd',
  'com',
  'dll',
  'htaccess',
  'svg',
  'svgz',
]);

/**
 * 按文件头识别类型。客户端 MIME / 原扩展名一律忽略，避免伪装成 image/png 写入 .php。
 */
function sniffMagic(buf: Buffer): { mimeType: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mimeType: 'image/png', ext: '.png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: '.jpg' };
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { mimeType: 'image/gif', ext: '.gif' };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', ext: '.webp' };
  }
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) {
    return { mimeType: 'image/x-icon', ext: '.ico' };
  }
  if (buf.toString('ascii', 0, 5) === '%PDF-') {
    return { mimeType: 'application/pdf', ext: '.pdf' };
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    const hasTypes = buf.includes(Buffer.from('[Content_Types].xml'));
    if (hasTypes && buf.includes(Buffer.from('word/'))) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: '.docx',
      };
    }
    if (hasTypes && buf.includes(Buffer.from('xl/'))) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: '.xlsx',
      };
    }
  }
  return null;
}

/** 扫描夹带脚本：扫描器常用 PNG 后拼接 `<?php echo ...` */
function hasEmbeddedScript(buf: Buffer): boolean {
  const latin = buf.toString('latin1');
  if (latin.includes('<?php') || latin.includes('<?=')) return true;
  if (latin.includes('<%') && /<%[\s=]/.test(latin)) return true;
  return false;
}

/**
 * 展示用文件名：去掉路径、控制字符与危险后缀，再拼上魔数对应的扩展名。
 */
export function sanitizeOriginalName(originalName: string, ext: string): string {
  let base = basename(originalName || 'file')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[.\s]+$/g, '')
    .trim();
  if (!base) base = 'file';
  const parts = base.split('.');
  const kept = parts.filter((part, i) => {
    if (i === parts.length - 1 && parts.length > 1) return false;
    return !DANGEROUS_EXT.has(part.toLowerCase());
  });
  const stem = (kept.join('.') || 'file').slice(0, 160);
  return `${stem}${ext}`;
}

/**
 * 校验上传内容：魔数必须落在白名单，且不得夹带 PHP/脚本。
 * @param allowedMime 配置中的 MIME 白名单；为空时拒绝（避免误开任意类型）
 */
export function inspectUpload(
  buffer: Buffer | undefined,
  originalName: string,
  allowedMime: Set<string>,
): InspectedUpload {
  if (!buffer?.length) {
    throw new BusinessException('文件内容为空', 'FILE_TYPE_NOT_ALLOWED');
  }
  if (hasEmbeddedScript(buffer)) {
    throw new BusinessException('文件内容含可执行脚本，已拒绝', 'FILE_TYPE_NOT_ALLOWED');
  }
  const sniffed = sniffMagic(buffer);
  if (!sniffed) {
    throw new BusinessException('无法识别的文件类型', 'FILE_TYPE_NOT_ALLOWED');
  }
  const aliasMime =
    sniffed.mimeType === 'image/x-icon' ? new Set(['image/x-icon', 'image/vnd.microsoft.icon']) : null;
  const mimeOk =
    allowedMime.size > 0 &&
    (allowedMime.has(sniffed.mimeType) || (aliasMime ? [...aliasMime].some((m) => allowedMime.has(m)) : false));
  if (!mimeOk) {
    throw new BusinessException('不支持的文件类型', 'FILE_TYPE_NOT_ALLOWED');
  }
  return {
    mimeType: sniffed.mimeType,
    ext: sniffed.ext,
    originalName: sanitizeOriginalName(originalName, sniffed.ext),
  };
}
