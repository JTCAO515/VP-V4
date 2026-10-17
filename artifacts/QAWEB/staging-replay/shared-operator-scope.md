# 共享 Staging 执行范围与当前阻塞

JT 已直接批准 A–D，并条件式批准满足全部门禁后的 E。固定目标为 Go2China `dzqdzetcctkhbrhlxxgn`，同 data Production 影响已在原问题中告知。不再请求 JT 重复选择方向或重复批准已授权组。

直接授权来源是 Main 私有记录 `/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/shared-operator-human-authorization-20261013.json`，SHA256 `5637fbd49d992ba58f004a2a0f39fc56f5315cfbc96a8c44175f0c875367737c`。记录绑定完整问题、原答复和 questionItemId。`shared-operator-authorized-blocked.json` 已预填 A–D 范围、一次 UUID、当前 code hash；维护窗口、Main 启动回执和五项 owner 确认仍为空/false，因此不能执行。旧 `shared-operator-proposal-unapproved.json` 保留为历史未批准提案。

## 已授权范围

- A：现有同账户官方 CLI、只读 SET LOCAL ROLE postgres；14 data schemas、Realtime 89 行迁移账本、完整 schema/owner/ACL、无密码全局角色，直接流入四份 AGE 密文。
- B：新本地 AGE 恢复身份；FileVault 私有固定 archive/identity 目录；保留至 `2026-10-20T23:59:59+08:00`。
- C：唯一自有、无网/无端口/无 mount 的 cached PG17.6.1.155 Docker；恢复验证后在该副本重放固定 80 条，退出销毁解密副本。
- D：现有 owner/control 机制下的 DDL/DCL 稳定边界；60 分钟窗口，普通 DML 可以继续。无新权限、全 DML 暂停、live 覆盖或 provider 费用。
- E：仅由 Main 在实际恢复、80 演练及全部门禁成立后执行共享目标升级。此 owner 不获得目标迁移写权。

## 可审阅入口与固定源

`controlled-snapshot-backup.py --snapshot-from-direct-record <capture-packet> <fresh-official>` 与 `controlled-snapshot-restore.py --restore-replay-from-direct-record <restore-packet> <actual-manifest> <identity> <reviewed-replay-manifest>` 消费上述固定授权 SHA，不模拟人工 TTY 输入。

两个入口还必须消费独立 Main 私有启动记录 `/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/shared-operator-main-start-20261013.json`。Main 审阅后写入 `MAIN_REVIEWED_EXECUTION_START`、target、授权 SHA、UUID、allowedStages、各阶段 codeHashes、reviewedSourceCommit、validFrom/validUntil，并将回执 SHA 绑定到各 packet。该 owner/helper 不创建这个记录。可信依据为独立 Main UI 授权证据及其固定实际 hash；没有宣称平台签名或 JSON 自授权。

原 TTY 模式保留；原 strict capture/restore 文件不变；默认 dry-run 不产生外部 IO。所有原范围、窗口、freshness、TLS、FileVault、schema/role/ACL/sequence 门禁照常执行。

固定 Main 源为 `7d0c5128857e859720452d8a9f864fd8b20c8388`；manifest SHA256 `230500975ecbd08df8eb1663b073ae96a11c79f3f2806d611fc5ce2d0a2e2a2f`；QA SQL SHA256 `73b6fa9ee63ad48bdff43da4a1f88ddf19e28e46786948e30314a111bb25285d`。hook 核每份 155 源文件、精确原 75/缺失 80/最终 155、原账本不变、原行多重集合保留、10 项门禁及 v2 signature/ACL。逐文件事务，在原 COMMIT 前登记；不把 80 条称为全局原子事务。

显式 replay 模式仅对 owned clone 做两项精确兼容：已知 turn_feedback ROW-IN pg_dump deparse 差异重建为原约束；归档 owner MAINTAIN/默认 ACL 精确恢复。未知差异拒绝，不改源 SQL/门禁/真实库权限。默认 restore 不采用该兼容。

## 最小缺失证据

| 边界 | Main 可在原范围确认的内容 | 当前仍 UNKNOWN 的内容 |
| --- | --- | --- |
| application DDL/migrations | 唯一 Main migration dispatch、source/CI fixture lease，无并发 Main writer | 外部 dashboard/directDB/worker DDL 在完整窗口内的控制 |
| roles/membership、ACL/policy DDL | 原范围内 Main 管理动作与 CLI credential refresh 的协调 | 外部 owner/admin/IAM、managed Auth 角色或策略 DDL |
| managed Realtime migrations | 当前账本89的只读观测 | managed migrator/自动 partition DDL 的完整窗口稳定依据 |
| extension/ledger schema | 固定结构/扩展的当前观测 | managed service 更新及其它 owner 变更控制 |

不需要静止所有普通 DML；也不能把 WAF、短时计数平稳、AccessExclusive=0 或仓库 writer lease 当作全库 60 分钟控制。现有证据只确认 Main 自己的写入边界；未确认项继续 false，由 Main 在现有 owner 范围补具体引用/哈希/有效期，不向 JT 重复索取既有 A–D 授权。

还需 Main 对最终 code/source 审阅及真实启动回执；当次 <=5min 官方 metadata、实际权限/TLS/FileVault/窗口检查；捕获后实际 manifest/key 绑定；真实共享数据恢复及重放 PASS。任一门禁失败就停止，保留受保护密文/身份与已成功迁移历史；只回滚当前未提交事务，无 live 恢复 fallback。

## 实际验证与限制

`owned-replay-proof-12.json` 通过完整假数据捕获、恢复、80 replay、10 gates、v2 ACL、原数据/账本保留及 owned cleanup。先前 FAIL 均保留；本轮缺少 --synthetic-only 的调用也拒绝并留档。最终受影响复验及测试结果见本轮 delivery 文档。

共享真实 14-data capture/restore、实际 AGE 身份、实际 SET ROLE/长连接、共享目标 80 DDL、真实维护边界、provider 费用全部 UNRUN。没有读取 JT 已放置 key 的值、重导凭据、写 Main 文件、迁移或共享容器。


## Main 实际 I/O 接收与必填字段

原 owner 未启动真实捕获、AGE identity、真实 archive 解密或恢复，没有在途此类工具，也没有实际 data action 平台拒绝。未来实际目标捕获、两个 fixed 私有目录及未来 actual restore clone 写权明确停止并释放给 V10 Main；原 staging 源码返修和既有 synthetic 资源 lease 仍由原 owner 独占。见 `actual-io-release-to-main.json`。这是同对象/账号/已批准范围的首次明确 Main 执行边界，不代表窗口启动或额外权限。

Main 从 `shared-operator-authorized-blocked.json` 的 `captureApprovalDraft` / `restoreApprovalDraft` 提取两个独立操作 packet，保存到自己的私有 0600 文件。总包本身不是 CLI 参数；不要通过本 owner 写入 Main 私有目录。保留预填同一次 UUID（或在 START/两个 packet 一致地换一次新 UUID），以及精确 target/actions/codeSha256/retention/destination，不能从旧历史 proposal 提取过时 hash。

1. 审阅与 preflight 完成后填写实际 `windowStart/windowEnd`，严格 60min、结束早于 retainUntil。捕获入口要求至少余20min；恢复入口至少余30min。尚未就绪不启动时间窗口，不用延长原60min或修改断言掩盖超时。
2. capture：填 `decisionEvidence.evidenceRef/evidenceSha256` 为 Main 实际 B 决策记录；填五项 `catalogBoundaryConfirmations` 的 confirmed=true、owner=V10 Main 协调、维护事实记录绝对引用/hash，以及覆盖完整窗口的 validFrom/validUntil。这是“无其它 planned 变更安排”的事实，不保证 vendor 非计划变化；原 catalog 检查仍执行。
3. 当次 fresh official 文件须 `link_id/project/observedAt/versions/schemas/event_triggers` 与 gate 契约匹配（<=5min，精确75、schema/event trigger 已审 pin）。Main 的 transport PASS 不替代实际同连接 TLS/session role、ledger/权限和稳定边界核验。
4. Main 独立 START 文件保持 0600、本人uid、单hardlink、无symlink；status=`MAIN_REVIEWED_EXECUTION_START`、issuedBy=`Main`、固定 target/授权5637hash、同UUID、allowedStages 包含 `capture` / `restore-replay`、codeHashes 两阶段精确值、reviewedSourceCommit 为已审40hex、validFrom/validUntil覆盖当前及完整窗口。将文件真实 SHA 填到两个 packet 的 `mainStartReceiptSha256`。本 owner 不签 START。
5. 完成 capture 后，restore：填真实 `manifestPath` 与 `identityPath` 的绝对 resolve 路径、`manifestSha256`；其它精确六项 restore action加第七项 `replay-reviewed-missing80-owned-copy`、replayMode及manifest2305 hash保持不变。CLI 第五参数传已审 `reviewed-replay-manifest.json`。不要把 synthetic proof 当真实manifest/key输入。
6. 逐阶段记录真实输出，拒绝/FAIL立即保留受保护产物与证据，不能绕过门禁。本 owner 的所有 real I/O 仍UNRUN。E仍仅由Main在真实恢复+80 rehearsal及其它全部条件齐后处理。

历史9d46185c执行源码的 code hash：capture `998078025f5b471a75ecbcffec186e60ecaccb2a53347f626c6cf65b803c1af7`；restore-replay `c379c01f08bfdb0beed1e32e91afa9fe9f6bc7405d148830523b331a821c5df8`。只有文档/receipt更新，执行源码及本地PASS证据未变，不需因此重跑演练。


## 一次性 restore-replay 契约返修（2026-10-14）

packet/START 均要求相同规范非空 UUID（拒绝空值、非canonical、全零UUID）。首次真实 archive 读取/hash/decrypt 之前，在固定 capture archive root 内原子创建 `approval-<UUID>.restore-replay.used.json`，0600，绑定 target/exact manifest SHA/code SHA/stage；固定root已有700/本人uid/无symlink要求，不随 bundle 路径改变。重复、并发及不同 manifest/code 的相同 UUID 均拒绝。即使 marker 写入/fsync 或后续恢复失败也不删除 marker；失败后重试不能复用消费过的授权。Main 不应清理标记以重试；新的实际尝试需独立可审执行记录与新一次UUID，原范围授权无需重复询问。

实际 I/O 仍Main独占；本轮只测试专属临时假packet目录，无真实 archive/identity/target 操作。完整155未重跑，原恢复/cleanup及迁移源码不变。helper进入capture/restore code hash，因此Main需使用本轮 `one-time-restore-delivery.json` 的新hash重新绑定review/START/packet，旧hash不能执行。
