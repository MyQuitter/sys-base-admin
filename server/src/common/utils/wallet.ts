/** EVM wallet address mask for logs and UI */
export function maskWallet(address?: string): string | undefined {
  if (!address) return undefined;
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
