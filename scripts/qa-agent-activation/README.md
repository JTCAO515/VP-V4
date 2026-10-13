# 当前共享目标 QA activation review kit

最新共享目标决定覆盖独立库方向。默认入口只准备原共享 dzt 目标；原独立规范保留为历史方向。独占 scripts/qa-agent-activation、对应契约 tests 和 artifacts/QAWEB/activation；没有 provisioning/apply/预算启用/provider/worker 运行命令。

## 目标来源与命令

operator 单独提供 `operator-target.template.json` 的两个字段：`projectRef`（20位小写字母或数字，本轮仅允许 dzqdzetcctkhbrhlxxgn）与 `supabaseUrl`（严格 `https://<ref>.supabase.co`，无斜杠路径、默认端口、认证、query、fragment）。这是 CLI/服务端配置输入，不能由浏览器、请求、cookie、job 决定。空值不能推导、回退或创建项目；URL 必须与 operator明确批准的固定ref完全一致。

```sh
node scripts/qa-agent-activation/cli.mjs generate /absolute/operator-input.json /absolute/new-package.json /absolute/operator-target.json
node scripts/qa-agent-activation/cli.mjs preflight /absolute/package.json /absolute/new-report.json /absolute/observation.json /absolute/operator-target.json
node --test tests/contract/qa-agent-activation/toolkit.test.mjs
```

preflight 最后可加单独 approved checkout 的绝对路径，唯读其 supabase/migrations；不能改变 pinned hash/目标。输出独占创建，0600，不覆盖已有文件。退出0只表示离线检查通过，2表示preflight阻断，1表示输入无效。任何输出 activationAllowed 均 false；reviewReady不是资源、资金或运行授权。Node>=22.18/native TS stripping；真实host验证由deployment owner用审核过的worker image Node、无网络/credential mount完成，不安装host Node。

旧共享策略/75→155、profile /3 和旧源pins保存在 `historical-*`，旧说明为 `HISTORICAL.md`。只有明确执行 `historical-cli.mjs` 才进入旧模式；当前入口不import/fallback旧工具。空库→155准备保留在 `independent-historical-*` 和 `INDEPENDENT-HISTORICAL.md`，仅显式使用该CLI可做历史fixture回放；不是当前就绪证据。当前ref的现有owned slot可以复用，仍需确切role/holder/slot证据；旧policy和consent不得自动复活。旧工作树未reset或清理。

## 当前输入与公开来源

`input.template.json` 是 /2，空 owner/configuration/targetReceipts/budget/日期继续拒绝。input项目和URL还要匹配单独operator target。targetReceipts必须绑定当前同一ref、owner、configuration及预算证据hash，带一小时内观察时间和账户证据hash。这个非secret回执是operator审阅证据，不是供应商/数据库的认证证明。

供应商披露、价目/预算可信来源、有效期和BigInt边界沿原实现：固定Qwen快照、endpoint、官方覆盖1000000、保守金额输入乘数1048576，6/24不扣优惠的公开候选不变。未知region/terms/storage/留存仍如实unknown；recipient和endpoint不能未知。公开supplier-price-candidate.json写明当前目标，但不含已核实际owner/配置/预算回执，不可直接生成。不会把方向同意、Pro组织现状或cost API不可用当作免费容量/创建/资金授权。

新policy/scope UUID及noticeVersion每次生成全新。notice摘要包括projectRef，policy+hash精确绑定当前目标，改变目标、披露或内容必须新生成并重新同意。package包含 /4 mandatory projectRef profile、canonical hostedProfileHash、targetBinding、禁用server环境、原model_budget参数映射、project绑定的consent/attempt、sourceEvidence和targetReceipts。参数映射的每个数据库操作目标来自外层targetBinding，不允许独立目标override。

初始policy不发布，预算scope/provider disabled，Web=false、workerEnabled=false。policy没有可复活enabled字段，任何实际插入/撤销由Main按独立批准范围进行。终端用户必须在当前目标QA UI认证并同意确切policyId+noticeHash，不能迁移共享账号或同意；kit不会创造这些回执。

## 共享基线、source pin与恢复

当前manifest恢复为已实测75基线＋已审缺失80＝精确全部155版本及源码hash；未升级的75仍阻断。full155与missing80分别比较固定集合，不以计数通过；缺失、额外、乱序、source缺失或内容漂移均失败。`initialization`记录共享Production库和必须验证backup/restore。旧空库记录不能替代当前同库基线。

`metadata.sql`只读已升级目标的实际v2 signature/ACL/迁移等元数据；前置版本、备份与恢复证据由原replay/backup owner提供。`initialization-metadata.sql`仅历史空库fixture说明。连接器中的project_id必须等于operator明确绑定的dzt，current_database()不是project identity。kit本轮不执行目标查询、copy或DDL。

当前 `qaReadyGroupsAcl` 检查实际 `public.qa_ready_groups_v2(integer,text,text,text)`，service_role=true且PUBLIC/anon/authenticated=false；旧v1/缺参数/公开execute失败。schema/lifecycle/RLS/fingerprint仍需Main证据；JS固定profile model/price/endpoint，金额仍在原reserve/dispatch核验。不得为了使用slot创建genericRole grants。

现有ECS owned slot如已由operator准备且属于dzt可使用。本包不读取其值，也不要求新project/newkey；只收当前ref、source ref、授权事实、service_role RPC身份、purpose、slotId、holderId及新观察/evidence hash。accessRequirements不提供路径或key值。实际高权限copy/DDL/maintenance窗口/费用仍按确切单包另批，不因方向同意或本地测试通过而执行。

## preflight observation

inventory记录发布新policy/scope前的共享现存IDs/notice版本/hash；后续consent/identity是当前精确policy读回。旧策略和scope可存在，候选必须新ID/新notice；不得沿用旧授权。下面空值/false只是未验模板：

```json
{
  "projectId": null,
  "supabaseUrl": null,
  "linkId": "link_6acdbe0471c081919ff47de24ca53b0f",
  "observedAt": null,
  "migrations": [],
  "reviewedMigrations": [],
  "migrationManifestHash": null,
  "qaRpcPresent": false,
  "turnDataPrivatePresent": false,
  "qaSchemaFingerprintMatches": false,
  "qaReadyGroupsAcl": {"signature":"public.qa_ready_groups_v2(integer,text,text,text)","serviceRoleExecute":false,"publicExecute":false,"anonExecute":false,"authenticatedExecute":false},
  "backupRestore": {"projectRef":null,"backupVerified":false,"restoreVerified":false,"backupEvidenceHash":null,"restoreEvidenceHash":null,"baselineVersionSetHash":null,"observedAt":null},
  "accessBinding": {"projectRef":null,"sourceProjectRef":null,"authorizedForTarget":false,"rpcRole":null,"slotId":null,"holderId":null,"purpose":"qa_hosted_worker","evidenceHash":null,"observedAt":null},
  "identityReceipts": {"projectRef":null,"ownerId":null,"policyId":null,"noticeHash":null,"scopeId":null,"configurationId":null,"hostedProfileHash":null,"endpoint":null,"evidenceHash":null},
  "exactConsent": {"projectRef":null,"ownerId":null,"authSessionId":null,"consentId":null,"policyId":null,"noticeHash":null,"accepted":false,"revoked":false,"evidenceHash":null},
  "workerStopped": false,
  "webDisabled": false,
  "ownerId": null,
  "existingPolicyIds": [],
  "existingNoticeVersions": [],
  "existingNoticeHashes": [],
  "existingScopeIds": [],
  "reviewedPackageHash": null
}
```

所有回执projectRef必须与当前dzt一致；accessBinding是安全审阅元数据，不输入key/JWT。其他ref、缺slot/holder、无当前授权或错误RPC role失败；属于dzt的现有slot不会因被标作“old access”而拒绝。backupRestore必须是原owner确切backup验证和恢复验证的两个新digest，baselineVersionSetHash=digest(manifest.baseline75)，观察不超过一小时；旧空库fixture/未完成备份不能当恢复ready。

观察/targetReceipts过期、来源/预算证据过期均失败；operator布尔/摘要仍需对应真实证据，不替代live actor/RLS。实际发布和同意另经原授权路径，缺精确同意仍阻断，旧policy不可复活。保留原未知费用pending/不可免费重试/停用顺序。

## backend接缝与运行边界

阶段一用闭合 /4+projectRef接口候选，复用既有 /3 tariff离线验证；明确profileValidation=CANDIDATE_NOT_BACKEND_VERIFIED且preflight阻断。Main整合目标绑定backend函数后，owner替换为其正式typed validator并补验；不能把候选标记改成成功骗过验证。hosttarget /2、image/sourceBuild/profileHash和trusted composition root由原package/backend owner负责，kit不改那些目录。

运行和停用沿原账本/生命周期：每次leaseToken对应原attempt，在同目标reserve→dispatch→真实usage→settle。unknown费用仍pending；不抹零或免费重试。停止先禁用Web admission与新预算，停止poll并drain现有host，再终端撤销policy，核账；不删除ledger/consent/data、不复活撤销policy。

本轮没有target/provisioning/role/credential/provider/fee/deploy动作，真实current-target Auth/Session/provider/multi-turn及host image验收UNRUN。
