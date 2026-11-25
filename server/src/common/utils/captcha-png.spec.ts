import { renderCaptchaPng } from './captcha-png';

describe('renderCaptchaPng', () => {
  it('输出合法 PNG，且不含 SVG/明文文本节点', () => {
    const png = renderCaptchaPng('A2B3C');
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    const asText = png.toString('utf8');
    expect(asText).not.toContain('<svg');
    expect(asText).not.toContain('<text');
    expect(asText).not.toContain('A2B3C');
  });
});
