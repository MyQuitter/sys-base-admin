/**
 * 一次性：针对已知区块区间拉取白名单事件并写入本地库。
 * 用法：node scripts/crm-wl-bootstrap-range.mjs
 */
import { createPublicClient, http, decodeEventLog, getAddress } from 'viem';
import { bsc } from 'viem/chains';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/modules/crm-whitelist/abi/CRAMTokenModular.abi.json'), 'utf8'),
);
const businessAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/modules/crm-whitelist/abi/CRAMBusiness.abi.json'), 'utf8'),
);

const TOKEN = '0x0294a393008625ae9EfF35dd8074De38cB5eB21C';
const BUSINESS = '0x4a370fa33a58688be5cf63c8718cfab4e903f344';
const FROM = 116465390n;
const TO = 116465520n;

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-dataseed1.binance.org', { timeout: 30_000 }),
});

async function fetchLogs(address, abi, eventName, fromBlock, toBlock) {
  const event = abi.find((x) => x.type === 'event' && x.name === eventName);
  if (!event) throw new Error(`missing event ${eventName}`);
  const chunk = 5n;
  const all = [];
  for (let c = fromBlock; c <= toBlock; c += chunk) {
    const end = c + chunk - 1n > toBlock ? toBlock : c + chunk - 1n;
    process.stderr.write(`getLogs ${address.slice(0, 10)} ${c}-${end}\n`);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const logs = await client.getLogs({
          address: getAddress(address),
          event,
          fromBlock: c,
          toBlock: end,
        });
        all.push(...logs);
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  return all;
}

const db = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'root',
  database: 'sys_base',
});

const traderLogs = await fetchLogs(TOKEN, tokenAbi, 'TraderWhitelistUpdated', FROM, TO);
const nodeLogs = await fetchLogs(BUSINESS, businessAbi, 'NodeWhitelistUpdated', FROM, TO);

console.log(`trader events=${traderLogs.length}, node events=${nodeLogs.length}`);

for (const log of traderLogs) {
  const decoded = decodeEventLog({ abi: tokenAbi, data: log.data, topics: log.topics });
  const args = decoded.args;
  const address = getAddress(args.trader);
  const allowed = args.allowed ? 1 : 0;
  const blockNumber = (log.blockNumber ?? 0n).toString();
  const txHash = log.transactionHash ?? null;
  const logIndex = Number(log.logIndex ?? 0);
  await db.execute(
    `INSERT INTO crm_wl_trader (address, allowed, block_number, tx_hash, log_index, event_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE allowed=VALUES(allowed), block_number=VALUES(block_number),
       tx_hash=VALUES(tx_hash), log_index=VALUES(log_index), event_at=VALUES(event_at)`,
    [address, allowed, blockNumber, txHash, logIndex],
  );
  console.log(`trader ${address} allowed=${allowed} block=${blockNumber}`);
}

for (const log of nodeLogs) {
  const decoded = decodeEventLog({ abi: businessAbi, data: log.data, topics: log.topics });
  const args = decoded.args;
  const address = getAddress(args.account);
  const level = Number(args.level);
  const blockNumber = (log.blockNumber ?? 0n).toString();
  const txHash = log.transactionHash ?? null;
  const logIndex = Number(log.logIndex ?? 0);
  await db.execute(
    `INSERT INTO crm_wl_node (address, level, block_number, tx_hash, log_index, event_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE level=VALUES(level), block_number=VALUES(block_number),
       tx_hash=VALUES(tx_hash), log_index=VALUES(log_index), event_at=VALUES(event_at)`,
    [address, level, blockNumber, txHash, logIndex],
  );
  console.log(`node ${address} level=${level} block=${blockNumber}`);
}

await db.execute(
  `UPDATE crm_wl_config SET business_address=?, node_synced_block=?, trader_synced_block=? WHERE id=1`,
  [getAddress(BUSINESS), TO.toString(), TO.toString()],
);

const [[{ traders }]] = await db.query(`SELECT COUNT(*) AS traders FROM crm_wl_trader WHERE allowed=1`);
const [[{ nodes }]] = await db.query(`SELECT COUNT(*) AS nodes FROM crm_wl_node WHERE level>0`);
console.log(`done. active traders=${traders}, active nodes=${nodes}`);
await db.end();
