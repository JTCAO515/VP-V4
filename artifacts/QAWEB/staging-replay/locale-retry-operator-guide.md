# ICU 修复与一次显式 C 重试（候选，未执行）

真实源的四字段 `UTF8/en_US.UTF-8/en_US.UTF-8/i` 与 strict ctor 的仅 libc `c` 发生冲突。snapshot adapter 新增明确 ICU factory；只接受已在固定image实际证明的 `en-US` / null rules / `153.121`，initdb 使用 ICU 参数，然后比对完整四字段、datlocale、daticurules、声明和 actual version。无 libc fallback，无 CREATE DATABASE COLLATION_VERSION 伪声明。strict capture/restore 字节、原capture manifest、原迁移源、10 gates/owner ACL/roles/counts/sequence/data retention/cleanup不变。

`owned-icu-replay-proof-04.json`：同固定PG17.6.155/image，源和恢复副本均实际 ICU en-US153.121；假数据四密文→schema/role/ownerACL/counts/sequence→exact80/10gates/v2ACL/原行保留→两自有copy cleanupPASS，33.203s。这是本地假数据证明，不是实际共享数据恢复PASS。历史und支持探针及proof01保留，最终allowlist不接受und或未知rules/version。

## Main 执行准备

仅 Main 处理原actual I/O。原UUID `f97d05db-c706-4ce9-82d8-579cbb0b9310`、消费标记、locale失败结果不删除、不改成未消费；不新capture、不新identity、不盲换UUID。source repair正式审阅完成后，使用独立 CLI：

`controlled-snapshot-restore.py --restore-replay-retry-from-direct-record <reviewed-retry-packet> <original-manifest> <same-identity> <pinned-reviewed-replay-manifest>`

原packet target/actions/replayMode/replayManifest、manifestPath/SHA、identityPath、approvedByJT、retention/授权5637hash保持原scope。approvalId仍原f97；windowStart/end必须原START validFrom/until的原值，严格60min，base仍至少余30min，不因修复放宽或新开60min。只替换已审当前restore codeSha256和新Main START真实hash；新增localeSupplementPath、localeSupplementSha256。总包/draft不是直接CLI输入。

先把原START原字节保存为Main私有0600不可变证据（旧SHA须与失败result.directHumanAuthorization.mainStartReceiptSha256一致）。Main独立写入正常固定 START 文件，仍 `MAIN_REVIEWED_EXECUTION_START`、issuedByMain、原UUID/target/授权5637hash、原window validFrom/until；allowedStages只授权 `restore-replay-retry`，codeHashes对应新restorehash，reviewedSourceCommit为正式审阅的修复整合commit。不授权新capture。

在该新START里增加 `retry`，必须逐项真实绑定：

- status=`MAIN_REVIEWED_LOCALE_REPAIR_RETRY`、attempt=1、originalApprovalId=原f97。
- previousOwnedCloneAbsent=true、noActualAttemptInFlight=true（Main实际确认；不由本owner虚填）。
- manifestSha256=原实际manifest SHA；identityPathSha256=原resolve绝对identityPath UTF8字符串的SHA256（只hash路径，不读key）。
- reviewedRepairCommit=新START.reviewedSourceCommit。
- originalClaimSha256=原消费marker的实际文件SHA256，旧文件保留。
- priorFailureResultPath/Sha256=Main私有原locale失败result；必须FAIL_LOCAL_RESTORE/cleanupPASS/UNSUPPORTED_DATABASE_LOCALE_PROFILE/未replay，oneTimeRestoreClaim须精确匹配原marker。
- originalStartRecordPath/Sha256=保存的原START，原target/UUID/授权/old restore codehash和原window核对失败证据。
- localeSupplementSha256=本次packet补件SHA；sameCapturedDatabaseLocaleUnchanged=true（Main核原snapshot基础facts+同source连续性）。

原START、失败result、locale补件须处于Main私有ROOT，0600/本人uid/单hardlink/无symlink。补件字段使用 Main 已提供的正常名字：sourceProject/database/owner/serverVersion/observedAt/encoding/collate/ctype/localeProvider/locale/icuRules/collationVersion/actualCollationVersion，附captureManifestSha256/captureApprovalId/evidenceKind=`readonly-database-locale-after-capture-same-approved-window`/targetWritten=false/userRowsRead=false。无需把原manifest四字段改写为额外事实。执行时补件<=5min；本地审阅后若过时，由Main只读刷新并更新hash绑定，不能假设旧观测仍fresh。

所有门禁成功后、首次archive hash/read/decrypt前，原子O_EXCL创建 `approval-<原UUID>.restore-replay-retry-1.used.json`，绑定同manifest/target/新codehash。即使后续失败该新标记也保留；重复/并发仅一份可进入恢复，旧初次消费标记字节不变。不提供retry-2、重试循环、清marker或live恢复fallback。

本轮capture hash变化来自共享authority helper字节；已完成的原捕获不因此重跑。最终hash见locale-repair-delivery.json。实际retry及E均UNRUN；Main必须在源和所需全部门禁通过后执行并报告真实结果。

PG17 ICU bootstrap语义依据：[initdb官方文档](https://www.postgresql.org/docs/17/app-initdb.html)；同镜像实际运行和版本比对见proof，不能用文档替代物理验证。
