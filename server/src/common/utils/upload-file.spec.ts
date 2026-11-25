import { inspectUpload, sanitizeOriginalName } from './upload-file';

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/pdf',
]);

/** 1x1 PNG（与扫描器探针相同结构） */
function tinyPng(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63d8d860d85f0f00028301d5e5478d1f0000000049454e44ae426082',
    'hex',
  );
}

describe('inspectUpload', () => {
  it('接受干净 PNG 并忽略客户端扩展名', () => {
    const png = tinyPng();
    const result = inspectUpload(png, 'shell.php', ALLOWED);
    expect(result.ext).toBe('.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.originalName).toBe('shell.png');
  });

  it('拒绝 PNG 后拼接 PHP 的探针', () => {
    const payload = Buffer.concat([tinyPng(), Buffer.from("<?php echo 'SECTEST'; ?>")]);
    expect(() => inspectUpload(payload, 'x.png', ALLOWED)).toThrow();
    expect(() => inspectUpload(payload, 'x.php', ALLOWED)).toThrow();
  });

  it('拒绝无法识别的类型', () => {
    expect(() => inspectUpload(Buffer.from('<?php echo 1; ?>'), 'a.php', ALLOWED)).toThrow();
  });
});

describe('sanitizeOriginalName', () => {
  it('去掉路径与 php 双后缀', () => {
    expect(sanitizeOriginalName('../../a.php.png', '.png')).toBe('a.png');
    expect(sanitizeOriginalName('photo.PHP.jpg', '.jpg')).toBe('photo.jpg');
  });
});
