interface AbiInput {
  name?: string;
  type: string;
  indexed?: boolean;
}

interface AbiEventItem {
  type: 'event';
  name: string;
  inputs?: AbiInput[];
  anonymous?: boolean;
}

/** 从合约 ABI JSON 中提取 event 列表 */
export function parseAbiEvents(abiJson: string): AbiEventItem[] {
  if (!abiJson?.trim()) return [];
  try {
    const parsed = JSON.parse(abiJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AbiEventItem =>
        typeof item === 'object' &&
        item !== null &&
        (item as { type?: string }).type === 'event' &&
        typeof (item as { name?: string }).name === 'string',
    );
  } catch {
    return [];
  }
}

/** 格式化事件签名，便于下拉展示 */
export function formatEventSignature(event: AbiEventItem): string {
  const inputs = event.inputs ?? [];
  if (!inputs.length) return `${event.name}()`;
  const params = inputs
    .map((input) => {
      const indexed = input.indexed ? ' indexed' : '';
      return `${input.type}${indexed}`;
    })
    .join(', ');
  return `${event.name}(${params})`;
}
