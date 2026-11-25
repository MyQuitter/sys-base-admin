import { isValidDeviceId } from './device-id';

describe('isValidDeviceId', () => {
  it('接受标准 UUID', () => {
    expect(isValidDeviceId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('拒绝空值和非法格式', () => {
    expect(isValidDeviceId('')).toBe(false);
    expect(isValidDeviceId('not-a-uuid')).toBe(false);
    expect(isValidDeviceId('550e8400e29b41d4a716446655440000')).toBe(false);
  });
});
