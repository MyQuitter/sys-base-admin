import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Abi } from 'viem';

const abiDirs = [
  join(__dirname, '..', 'abi'),
  join(process.cwd(), 'src', 'modules', 'crm-whitelist', 'abi'),
];

function loadAbi(name: string): Abi {
  for (const dir of abiDirs) {
    const file = join(dir, name);
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8')) as Abi;
    }
  }
  throw new Error(`未找到 ABI 文件: ${name}`);
}

export const CRAM_TOKEN_MODULAR_ABI = loadAbi('CRAMTokenModular.abi.json');
export const CRM_TOKEN_LEGACY_ABI = loadAbi('CRMToken.abi.json');
export const CRAM_BUSINESS_ABI = loadAbi('CRAMBusiness.abi.json');

export function resolveTokenAbi(tokenAbiKey: string): Abi {
  return tokenAbiKey === 'legacy' ? CRM_TOKEN_LEGACY_ABI : CRAM_TOKEN_MODULAR_ABI;
}
