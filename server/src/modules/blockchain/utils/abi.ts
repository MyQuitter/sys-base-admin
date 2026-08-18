import type { AbiEvent } from 'viem';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { STANDARD_TRANSFER_EVENT } from './standard-abi';

export function parseAbiJson(raw: string): readonly unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BusinessException('ABI 须为 JSON 数组', 'CONTRACT_ABI_INVALID');
    }
    return parsed;
  } catch (err) {
    if (err instanceof BusinessException) throw err;
    throw new BusinessException('ABI JSON 解析失败', 'CONTRACT_ABI_INVALID');
  }
}

export function validateEventInAbi(abi: readonly unknown[], eventName: string) {
  const found = abi.some(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as { type?: string; name?: string }).type === 'event' &&
      (item as { name?: string }).name === eventName,
  );
  if (!found) {
    throw new BusinessException(`ABI 中未找到事件 ${eventName}`, 'EVENT_NOT_IN_ABI');
  }
}

export function findEventAbiItem(abi: readonly unknown[], eventName: string): AbiEvent {
  const item = abi.find(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { type?: string; name?: string }).type === 'event' &&
      (entry as { name?: string }).name === eventName,
  );
  if (!item) {
    throw new BusinessException(`ABI 中未找到事件 ${eventName}`, 'EVENT_NOT_IN_ABI');
  }
  return item as AbiEvent;
}

/** 解析事件 ABI：优先合约 ABI，Transfer 可回退标准 ERC20 片段 */
export function resolveEventAbiItem(abiJson: string | undefined, eventName: string): AbiEvent {
  if (abiJson?.trim()) {
    const abi = parseAbiJson(abiJson);
    const found = abi.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { type?: string; name?: string }).type === 'event' &&
        (entry as { name?: string }).name === eventName,
    );
    if (found) return found as AbiEvent;
  }
  if (eventName === 'Transfer') {
    return STANDARD_TRANSFER_EVENT as AbiEvent;
  }
  throw new BusinessException(`ABI 中未找到事件 ${eventName}`, 'EVENT_NOT_IN_ABI');
}
