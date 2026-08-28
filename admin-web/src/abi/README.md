# CrmToken / CRAM 全量 ABI

来源：CrayMat `hardhat compile` 产物，仅保留 `abi` 数组（全量，不裁剪）。

| 文件 | 合约 |
|------|------|
| `CRAMTokenModular.abi.json` | 模块化 Token |
| `CRAMBusiness.abi.json` | Business（节点白名单等） |
| `CRMToken.abi.json` | 单体 Token（参考） |

升级合约后请在 CrayMat 工程重新编译并覆盖本目录；与 `server/src/modules/crm-whitelist/abi/` 保持一致。
当前对齐：2026-08-24 编译产物。
