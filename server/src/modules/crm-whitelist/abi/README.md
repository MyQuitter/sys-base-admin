# CrmToken / CRAM 全量 ABI（服务端副本）

与 `admin-web/src/abi/` 同源，用于事件扫描与只读调用。升级时两边同步覆盖。

当前对齐：`E:\CrayMat-contract` 2026-08-24 编译产物（`CRAMTokenModular` + `CRAMBusiness`/`CRAMRewardsModular`）。
团队入金事件为 `ParticipationAdded`；`leaderOverview` 第 5/7 项为 `quota` / `referralCrm`。
白名单/团队/数据面板所用接口签名未变；Rewards 侧 Rebase/Claim 事件与若干 view 有增减。
