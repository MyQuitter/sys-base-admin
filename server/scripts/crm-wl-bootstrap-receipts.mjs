/**
 * 从已知 setNodeWhitelist 交易回执解析事件并写入库（避开 eth_getLogs 限流）。
 */
import { createPublicClient, http, decodeEventLog, getAddress, parseAbiItem } from 'viem';
import { bsc } from 'viem/chains';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const businessAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/modules/crm-whitelist/abi/CRAMBusiness.abi.json'), 'utf8'),
);
const tokenAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/modules/crm-whitelist/abi/CRAMTokenModular.abi.json'), 'utf8'),
);

const TOKEN = getAddress('0x0294a393008625ae9EfF35dd8074De38cB5eB21C');
const BUSINESS = getAddress('0x4a370fa33a58688be5cf63c8718cfab4e903f344');
const SELECTOR = '0x1c942360';
const FROM = 116465400n;
const TO = 116465520n;

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-dataseed.binance.org', { timeout: 30_000 }),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function collectTxHashes() {
  const hashes = [];
  for (let b = FROM; b <= TO; b++) {
    process.stderr.write(`block ${b}\n`);
    const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
    for (const tx of block.transactions) {
      if (
        typeof tx === 'object' &&
        tx.to &&
        getAddress(tx.to) === BUSINESS &&
        tx.input?.toLowerCase().startsWith(SELECTOR)
      ) {
        hashes.push(tx.hash);
      }
    }
    await sleep(120);
  }
  return hashes;
}

const hashes = await collectTxHashes();
console.log(`found ${hashes.length} setNodeWhitelist txs`);

const db = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'root',
  database: 'sys_base',
});

let nodeCount = 0;
for (const hash of hashes) {
  const receipt = await client.getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    if (!log.address || getAddress(log.address) !== BUSINESS) continue;
    try {
      const decoded = decodeEventLog({ abi: businessAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'NodeWhitelistUpdated') continue;
      const args = decoded.args;
      const address = getAddress(args.account);
      const level = Number(args.level);
      const blockNumber = (log.blockNumber ?? 0n).toString();
      const logIndex = Number(log.logIndex ?? 0);
      await db.execute(
        `INSERT INTO crm_wl_node (address, level, block_number, tx_hash, log_index, event_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE level=VALUES(level), block_number=VALUES(block_number),
           tx_hash=VALUES(tx_hash), log_index=VALUES(log_index), event_at=VALUES(event_at)`,
        [address, level, blockNumber, hash, logIndex],
      );
      console.log(`node ${address} L${level} block=${blockNumber}`);
      nodeCount += 1;
    } catch {
      /* not our event */
    }
  }
  await sleep(80);
}

// 同区间扫描 Token 上 setTraderWhitelist
const traderSelector = '0x9104d6a7';
let traderCount = 0;
for (let b = FROM; b <= TO; b++) {
  const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
  for (const tx of block.transactions) {
    if (
      typeof tx !== 'object' ||
      !tx.to ||
      getAddress(tx.to) !== TOKEN ||
      !tx.input?.toLowerCase().startsWith(traderSelector)
    ) {
      continue;
    }
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    for (const log of receipt.logs) {
      if (!log.address || getAddress(log.address) !== TOKEN) continue;
      try {
        const decoded = decodeEventLog({ abi: tokenAbi, data: log.data, topics: log.topics });
        if (decoded.eventName !== 'TraderWhitelistUpdated') continue;
        const args = decoded.args;
        const address = getAddress(args.trader);
        const allowed = args.allowed ? 1 : 0;
        const blockNumber = (log.blockNumber ?? 0n).toString();
        const logIndex = Number(log.logIndex ?? 0);
        await db.execute(
          `INSERT INTO crm_wl_trader (address, allowed, block_number, tx_hash, log_index, event_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE allowed=VALUES(allowed), block_number=VALUES(block_number),
             tx_hash=VALUES(tx_hash), log_index=VALUES(log_index), event_at=VALUES(event_at)`,
          [address, allowed, blockNumber, tx.hash, logIndex],
        );
        console.log(`trader ${address} allowed=${allowed} block=${blockNumber}`);
        traderCount += 1;
      } catch {
        /* ignore */
      }
    }
    await sleep(80);
  }
  await sleep(80);
}

await db.execute(
  `UPDATE crm_wl_config SET business_address=?, node_synced_block=?, trader_synced_block=? WHERE id=1`,
  [BUSINESS, TO.toString(), TO.toString()],
);

const [[{ nodes }]] = await db.query(`SELECT COUNT(*) AS nodes FROM crm_wl_node WHERE level>0`);
const [[{ traders }]] = await db.query(`SELECT COUNT(*) AS traders FROM crm_wl_trader WHERE allowed=1`);
console.log(`done. wrote nodeEvents=${nodeCount} traderEvents=${traderCount}; active nodes=${nodes} traders=${traders}`);
await db.end();
