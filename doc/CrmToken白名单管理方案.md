# CrmToken 白名单管理方案（审阅稿）

> 状态：**审阅通过，可实现**  
> 目标：在 Base 管理端扩展「交易白名单 + 节点白名单」运维能力，**共用**现有登录/RBAC，**不改动** `modules/base` 核心业务。  
> 合约来源：`E:\CrayMat-contract-main\CrayMat-contract-main`  
> §6 定案：列表仅有效项 · 模块名 `crm-whitelist` · 节点读用默认 `nodeWhitelistLevel` · Owner 不强制绑定后台钱包

---

## 1. 已确认需求

| 项 | 定案 |
|----|------|
| 范围 | **交易白名单**（Token）+ **节点白名单**（Business） |
| 写链方式 | MetaMask：已连接则直接用当前账户；未连接则弹出连接 |
| 列表 | **全量列表**（索引链上事件入库后分页展示） |
| 合约地址 | 管理端**手动配置**（Token、Business、chainId、起始块等） |
| **ABI** | **采用全量 ABI**（Hardhat 编译产物完整 `abi` 数组），方便后续加功能时复用，不按白名单裁剪 |
| 鉴权 | 共用 Base JWT + 权限码；链上写入不经过服务端私钥 |

### 1.1 ABI 策略（定稿）

- 从 CrayMat 工程 `hardhat compile` 产物拷贝**全量** `abi` 数组（已落地）：
  - Token（模块化）：[`admin-web/src/abi/CRAMTokenModular.abi.json`](../admin-web/src/abi/CRAMTokenModular.abi.json)（server 同源：`server/src/modules/crm-whitelist/abi/`）
  - Business：[`admin-web/src/abi/CRAMBusiness.abi.json`](../admin-web/src/abi/CRAMBusiness.abi.json)
  - Token（单体参考，如部署用 `CRMToken.sol`）：[`admin-web/src/abi/CRMToken.abi.json`](../admin-web/src/abi/CRMToken.abi.json)
- 配置页按实际部署选择使用 Modular 或单体 Token ABI；Business 用 `CRAMBusiness.abi.json`
- 本阶段页面/服务只用白名单相关方法；**文件内为全量 ABI**，后续功能直接复用
- 合约升级后：在 CrayMat 工程重新 `hardhat compile` → 覆盖上述 JSON → 回归白名单读写与事件 topic

### 1.2 明确不做（本阶段）

- 不实现其它 CrmToken 业务 UI（参与、Rebase、领取、税率配置等）——仅白名单运维；全量 ABI 仅为预留
- 服务端不托管 Owner 私钥代发交易
- 不修改 `sys_*` 表结构与 `modules/base` 既有接口语义

---

## 2. 链上能力对照

### 2.1 交易白名单（CRMToken）

| 操作 | 方法 / 事件 | 说明 |
|------|-------------|------|
| 读 | `isTraderWhitelisted(address) → bool` | 单地址核对 |
| 写 | `setTraderWhitelist(address account, bool allowed)` | `onlyOwner`；`allowed=false` 为移除 |
| 事件 | `TraderWhitelistUpdated(address indexed trader, bool allowed)` | 全量列表索引依据 |
| 约束 | 零地址、Token 自身、Pair、Router 等受保护地址不可加入 | 前端模拟 + 文案提示 |

参考：`contracts/modular/CRAMTokenModular.sol`、`contracts/crm/CRMConfiguration.sol`

### 2.2 节点白名单（CRAMBusiness / Rewards）

| 操作 | 方法 / 事件 | 说明 |
|------|-------------|------|
| 读 | `nodeWhitelistLevel(address) → uint8`（部署 ABI 为准） | `0` 表示未在白名单 |
| 写 | `setNodeWhitelist(address account, uint8 level)` | `onlyOwner`；`level` 1–8 设等级，`0` 移除 |
| 事件 | `NodeWhitelistUpdated(address indexed account, uint8 level)` | 全量列表索引依据 |

参考：`contracts/modular/CRAMRewardsModular.sol`、`contracts/crm/CRMNodeWhitelist.sol`  
说明：部署上用户入口多为 Token；**节点白名单维护在 Business 地址**，配置页需单独填写 Business 合约地址。

### 2.3 写链前置条件

- MetaMask 当前链 = 配置的 `chainId`
- 当前账户 = 对应合约 `owner()`（交易白名单对 Token Owner；节点白名单对 Business Owner；若两合约 Owner 不同，需分别校验）
- 登录态仅控制「能否打开后台、能否看到按钮」；真正上链签名在浏览器钱包

---

## 3. 管理端功能清单

### 3.1 合约配置

- [x] 手动配置：`chainId`、`tokenAddress`、`businessAddress`
- [x] 可选：交易白名单起始块、节点白名单起始块（首次全量扫日志）
- [x] 复用「链管理」中对应 chainId 的启用 RPC
- [x] 权限：`crm-wl:config`
- [x] 保存后可触发「同步事件」

### 3.2 交易白名单

- [x] 全量分页列表（仅有效）
- [x] 加入 / 移除（MetaMask `setTraderWhitelist`）
- [x] 按地址核对（索引 + 链上）
- [x] 权限：`crm-wl:trader-list`、`crm-wl:trader-write`

### 3.3 节点白名单

- [x] 全量分页列表（仅 level>0）
- [x] 设置等级 / 清除（MetaMask）
- [x] 按地址核对
- [x] 权限：`crm-wl:node-list`、`crm-wl:node-write`

### 3.4 MetaMask 交互

- [x] `ensureWalletConnected`（已连接直接用）
- [x] 写前切链 + `owner()` 校验
- [x] 拒绝签名友好提示

### 3.5 事件同步

- [x] 扫 `TraderWhitelistUpdated` / `NodeWhitelistUpdated`
- [x] upsert；列表仅有效项
- [x] 手动同步 + 游标块高

---

## 4. 技术落点（与 Base 隔离）

| 层 | 建议路径 |
|----|----------|
| 后端模块 | `server/src/modules/crm-whitelist/` |
| 表前缀 | `crm_wl_*`（配置、交易白名单快照、节点白名单快照、扫描游标） |
| 前端页面 | `admin-web/src/pages/crm-whitelist/{config,trader,node}` |
| API | `admin-web/src/api/crm-whitelist.ts` |
| **全量 ABI** | 已落地：`admin-web/src/abi/*.abi.json` 与 `server/src/modules/crm-whitelist/abi/`（同源） |
| 菜单 | 一级「CrmToken白名单」；seed **增量**权限与菜单 |
| 钱包工具 | 扩展现有 `admin-web/src/utils/wallet.ts` |

原则：只在 `app.module` **注册新 Module**；不改 Base 用户/角色/登录语义。

---

## 5. 数据流

```
配置 Token/Business
    → 后端 eth_getLogs 扫事件 → crm_wl_* 全量快照
    → 管理端列表分页展示

运营点击加入/移除或设等级
    → 检测 MetaMask 连接 → 切链 → 校验 owner
    → walletClient.writeContract（abi = 全量 ABI）
    → 链上出块发事件
    → 同步任务/手动同步更新列表
```

---

## 6. 开放点定案

| # | 议题 | 定案 |
|---|------|------|
| 6.1 | 已移出地址是否仍显示 | **A**：列表仅当前有效（`allowed=true` / `level>0`） |
| 6.2 | 模块目录名 | **A**：`crm-whitelist` |
| 6.3 | 节点读函数名 | **不需要单独约定**：采用模块化全量 ABI 中的 `nodeWhitelistLevel` |
| 6.4 | Owner 与后台绑定钱包 | **A**：不强制一致；任意已连接且为合约 Owner 的 MetaMask 即可 |

---

## 7. 验收标准（建议）

- [ ] 仓库内 Token / Business **全量 ABI** 文件已落地，且与 CrayMat compile 产物一致  
- [ ] 配置保存后，手动同步能拉齐历史白名单事件并分页展示（默认列表仅为有效项）  
- [ ] 未装/未连 MetaMask 时，写操作会引导连接；已连接则不再多余弹窗要账户（除切链/签名）  
- [ ] 非 Owner 账户写操作被前端拦截或链上失败有明确错误  
- [ ] 受保护地址加入交易白名单失败有可读提示  
- [ ] 节点等级仅允许 0–8；非法输入前端校验  
- [ ] 无权限用户看不到写按钮；菜单受 `permissionCode` 控制  
- [ ] Base 原有系统管理/区块链模块行为无回归  

---

## 8. 文档与提交

- 本文路径：`doc/CrmToken白名单管理方案.md`  
- 索引：`doc/README.md`  
- 实现：`feat(crm-wl): ...`（模块目录 `server/src/modules/crm-whitelist/`）

---

**审阅结论**

- [x] 通过，可按此实现（含全量 ABI + §6 定案）
