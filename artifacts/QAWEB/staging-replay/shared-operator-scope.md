# 给 BestJ / JT 的一次集中执行范围提案

状态：**未批准提案，副作用全部未执行。** JT 最新经 Main 的指令已明确选择原 Go2China `dzqdzetcctkhbrhlxxgn`，知道测试与 Production 同 data；本包不再请求共享方向、新项目、免费配额或新平台 key。这个方向选择不自动批准下面实际的数据读取、恢复身份、角色使用、DDL 或服务影响。

Main 可直接预填 `shared-operator-proposal-unapproved.json` 并据此形成一份集中批准记录，不让 JT 手写 JSON。所有 approved/confirmed 字段当前为 false/null，actions为空，不可通过现有执行 gate。JT 对所列具体组的实际批准后，才由 Main 转为相应已批准操作记录；文件、技术选型及本地 PASS 均不自授批准。

## 不可替代的具体动作与范围

| 组 | 请求实际批准的动作 | 限界与先后条件 |
| --- | --- | --- |
| A：共享真实数据加密捕获 | 使用既有同账户官方 CLI 上下文，临时登录凭据只在子进程内存中；仅为该 ref 的只读捕获执行 SET LOCAL ROLE postgres。读取完整14 data schemas及 Realtime89行原迁移账本，原样直接流入 AGE；另捕获完整schema、owner/ACL、无密码 globals | 包含共享库的真实身份/会话/任务/Trips/同意等数据，不能说只有 QA 样例。没有新永久 API key、GRANT/RLS变更、跨项目或聊天秘密。实际权限不足立即停止，不换身份绕过。既有 JT 已放置的 keys不查值、不重导；备份用官方现有 CLI 登录流程，不消费Qwen key。 |
| B：本地恢复身份与保留 | 新建一次 AGE local恢复identity，分别放固定私有 FileVault目录；保留密文和身份至2026-10-20 23:59:59+08 | 这是新本地恢复key，不是新 Supabase/provider key，仍需明确批准创建与保留。0700目录、0600文件；失败保受保护quarantine，不自动删除恢复身份。 |
| C：真实数据本机恢复与演练 | 仅解密指定四archive到唯一自有、无网/无端口/无mount的本机 Docker PG17.6.1.155；核全部schema/roles/owner/ACL/计数/ledger摘要和sequence安全，随后在该离线copy演练精确80个缺失迁移 | 不打印用户内容、不读模型上下文、不对外送数据；完成销毁该解密副本。真实14-data restore+80 replay仍UNRUN。现有候选restore会在完成后删除copy，Main必须先绑定本轮接受的实际数据replay接缝，不能拿fresh/synthetic replay替代。 |
| D：稳定边界及共享服务影响 | 按现有owner/control机制协调 application DDL/migrators、managed Realtime migrations、roles/membership、ACL/policy DDL、extension/ledger schema 的维护边界，保持或按明确批准停下QA producer/入口 | 可能影响同data Production，不能谎称Staging独占。只读snapshot可容纳普通 managedAuth/SDK DML；没有全DML静止保证，不虚填quiet=true。不新增全库冻结权限/配置，不改未知WAF规则。任何需要更广服务暂停或权限修改的情况先停止并另列具体范围。 |
| E：条件成立后的共享80升级 | 在该同一ref上，按原顺序逐个执行源文件/校验哈希固定的80迁移，保留已应用75历史 | 仅当实际恢复+80演练PASS、相同最终源码/manifest、所有所需稳定边界、实际时间窗口及当前源前置检查通过后才可执行。A-D批准不自行包含E；JT可在一次集中批准中给E明确条件式授权，条件不成立就不执行。Provider激活/费用不在本包。 |

## 推荐实际参数

- 唯一隔离恢复目的地：自有本机 cached `public.ecr.aws/supabase/postgres:17.6.1.155`，image ID `sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`；不新建付费项目、不借共享容器。
- Archive root：`/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/archives`。
- Identity root：`/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/identities`。
- 保留至：`2026-10-20T23:59:59+08:00`；未创建删除/保留自动化。
- 窗口：60min，实际 start/end 由 Main 在已批准且安全边界完成时填入；exporter每次最多600s。建议捕获10min、恢复核对15min、80动作15min、最终核对10min、失败退出预留10min；若批准只覆盖恢复演练，目标DDL槽不执行。

## Source/code/pins 与当前证据

当前只读确认 Main WT clean、HEAD `f8bfe5ff93453a40a7914d2e94ef9aec14122965`；Git对象和工作文件的QA迁移一致，SHA256 `73b6fa9ee63ad48bdff43da4a1f88ddf19e28e46786948e30314a111bb25285d`。完整155 `{version,file,sha256}` catalog SHA256 `4a0221a727b2961d79395d43246acff8ab5d1365d67d5580ab1065e6c4a3c8b4`；该定义与activation整体manifest hash不同，不能混用。全部75已应用版本的本地源与原owner源相同；完整155及缺80列表、逐文件SHA均在JSON内。第一个补项是早于远端max的 `20260922033000`，不能删/补造旧迁移历史来跳过。

B capture/restore代码pin分别 `97f58fd3ea618c0d765344128c3166607d3a54e0a6f93b41791149e23314e2e7` / `60d9fa62262eb88027d5fe88d3e0d7fdb1b64332040bc136c41e4665c25db993`，源码commit7e27e7af，旧strict接口不变。任何源码/head漂移必须由Main重新固定和核相关证据，不自动接受旧批准。

保留并复用：actual metadata75版本（版本列表SHA55081cf9…）、14schema+Realtime账本89的官方COUNT/结构证据、同PG17.6.155/同image、四密文假数据恢复、五extension owner/ACL、角色无密码restore、共享exporter/TLS/临时CLI角色、并发DML及sequence安全负例。旧实际75→155本地演练测试的QA源835cb185…与当前73b6源不同；当前源码review/CI/smoke由Main负责，不能把旧hash的证明升级为新实际数据证明。真实目标最新状态还需当次fresh核，历史metadata不是当前执行许可。

**仍未验收：**真实共享14-data capture/restore和80 rehearsal、实际sequence profile、DDL/DCL owner控制、长时真实连接、服务影响、当前head保护检查。NoProdOverwrite；不自动把旧snapshot恢复到已有later writes的live库。Snapshot内旧consent/role数据不赋予当前provider/模型派发资格。

## 执行的不可替代顺序（Main预填，不让JT逐字段操作）

1. Main将本包变成一次清楚的A–E授权请求，包含共享真实数据与Production影响。依据JT的真实选择只填被批准组，不用方向批准替代副作用批准。
2. Main在自己原owner范围取得实际DDL/DCL/服务控制的owner确认及可核引用/哈希；窗口/UUID/fresh官方metadata由Main填。WAF只能阻Vercel HTTP，不能召回已开页面 SDK、Native、directDB/Management/pooler、Auth刷新或其它worker；不用WAF当全库静止门。
3. 在被批准A/B/D后，执行独立B入口 `controlled-snapshot-backup.py --snapshot-execute <approved-mode.json> <fresh-official.json>`。严格复验同账户/同项目/75+schema/89ledger/profile；共享read-only exporter统一三个pg_dump和计数/ledger摘要。Globalroles/catalog/DDL/ACL稳定另核。任何拒绝/过期/丢失即失败并保受保护产物，没有live fallback。
4. 在被批准C后，执行 `controlled-snapshot-restore.py --restore-snapshot-approved <approved-restore.json> <actual-manifest.json> <identity>` 的离线恢复核对，并由Main绑定受控实际数据80 replay。该接缝未就绪/证明不通过，则E不能执行。不要拿原replay.mjs的全新synthetic schema作为真实数据演练。
5. 只有E有实际条件式批准且C等所有条件成功，Main才在原迁移执行权限内应用精确包。包中已有各自BEGIN/COMMIT，不能用外套一个BEGIN假装80全原子。每一步登记/核readback，不启动QA/model/provider费用。
6. 失败只回滚当前未提交transaction；保持QA入口/worker off，已成功apply文件与历史append保留。记录当前版本/失败/实际数据完整性，Main决定后续。全库live restore、覆盖later writes、删除部分已应用迁移、复活已撤销记录都不在默认失败处置中，必须另有具体实际批准。

此文及JSON不是实际批准。没有目标连接、高privilege、用户行读取、dump、恢复key创建、DDL、暂停或provider动作发生；本轮只作离线proposal/固定源码pin/文档检查。
