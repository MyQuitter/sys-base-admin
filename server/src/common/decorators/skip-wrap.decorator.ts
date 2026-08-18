import { SetMetadata } from '@nestjs/common';

export const SKIP_WRAP_KEY = 'skipWrap';

/** 跳过全局响应包装，用于 CSV/文件流等原始响应 */
export const SkipWrap = () => SetMetadata(SKIP_WRAP_KEY, true);
