# 独立 QA activation review kit

默认入口只准备独立 QA 目标。契约：`docs/contracts/qa-independent-target.md`。独占 scripts/qa-agent-activation、对应契约 tests 和 artifacts/QAWEB/activation；没有 provisioning/apply/预算启用/provider/worker 运行命令。

## 目标来源与命令

operator 单独提供 `operator-target.template.json` 的两个字段：`projectRef`（20位小写字母或数字，禁止共享 dzqdzetcctkhbrhlxxgn）与 `supabaseUrl`（严格 `https://<ref>.supabase.co`，无斜杠路径、默认端口、认证、query、fragment）。这是 CLI/服务端配置输入，不能由浏览器、请求、cookie、job 决定。空值不能推导、回退或创建项目；URL 必须与 approved ref 完全一致。

```sh
node scripts/qa-agent-activation/cli.mjs generate /absolute/operator-input.json /absolute/new-package.json /absolute/operator-target.json
node scripts/qa-agent-activation/cli.mjs preflight /absolute/package.json /absolute/new-report.json /absolute/observation.json /absolute/operator-target.json
node --test tests/contract/qa-agent-activation/toolkit.test.mjs
```

preflight 最后可加单独 approved checkout 的绝对路径，唯读其 supabase/migrations；不能改变 pinned hash/目标。输出独占创建，0600，不覆盖已有文件。退出0只表示离线检查通过，2表示preflight阻断，1表示输入无效。任何输出 activationAllowed 均 false；reviewReady不是资源、资金或运行授权。Node>=22.18/native TS stripping；真实host验证由独立deployment owner用审核过的worker image Node、无网络/credential mount完成，不安装host Node。

旧共享策略/75→155、profile /3 和旧源pins保存在 `historical-*`，旧说明为 `HISTORICAL.md`。只有明确执行 `historical-cli.mjs` 才进入旧模式；默认新入口不import/fallback旧工具。历史材料无目标运行授权，不能拿旧75基线、旧ECS db.key、旧scope或旧consent验证新QA。旧工作树未reset或清理。

## 新输入与公开来源

`input.template.json` 是 /2，空 owner/configuration/targetReceipts/budget/日期继续拒绝。input项目和URL还要匹配单独operator target。targetReceipts必须绑定同一ref、owner、configuration及预算证据hash，带一小时内观察时间和账户证据hash。这个非secret回执是operator审阅证据，不是供应商/数据库的认证证明。

供应商披露、价目/预算可信来源、有效期和BigInt边界沿原实现：固定Qwen快照、endpoint、官方覆盖1000000、保守金额输入乘数1048576，6/24不扣优惠的公开候选不变。未知region/terms/storage/留存仍如实unknown；recipient和endpoint不能未知。公开supplier-price-candidate.json不含已批准新ref/实际owner/配置/预算回执，不可直接生成。不会把方向同意、Pro组织现状或cost API不可用当作免费容量/创建/资金授权。

新policy/scope UUID及noticeVersion每次生成全新。notice摘要包括projectRef，policy+hash精确绑定新目标，改变目标、披露或内容必须新生成并重新同意。package包含 /4 mandatory projectRef profile、canonical hostedProfileHash、targetBinding、禁用server环境、原model_budget参数映射、project绑定的consent/attempt、sourceEvidence和targetReceipts。参数映射的每个数据库操作目标来自外层targetBinding，不允许独立目标override。

初始policy不发布，预算scope/provider disabled，Web=false、workerEnabled=false。policy没有可复活enabled字段，任何实际插入/撤销由Main按独立批准范围进行。终端用户必须在新目标QA UI认证并同意确切policyId+noticeHash，不能迁移共享账号或同意；kit不会创造这些回执。

## 空库与 source pin

独立manifest是 `initialMigrations=[]` → 精确全部155版本及源码hash；Main审核的 source revision见manifest。没有missing80或baseline75可替代新库初始化。缺失、额外、乱序、source文件缺失或内容漂移均失败。初次创建和费用、credentials、role/permission变更未获本包授权。

不得复制Production用户/角色/keys/Auth/Storage/备份。`initialization-metadata.sql` 只供新目标初始化前counts/catalog inventory；官方 list_migrations 返回版本应为空。初始化完成后 `metadata.sql` 只读实际v2 signature及ACL/迁移等元数据；缺乏QA表时不能用这份post-init查询冒认空库已ready。连接器调用中的project_id必须匹配独立operator target。current_database()不提供project identity。没有实际新目标，这两份SQL均UNRUN。

新 `qaReadyGroupsAcl` 表示实际 `public.qa_ready_groups_v2(integer,text,text,text)`；service_role=true且PUBLIC/anon/authenticated=false。旧v1、缺参数、公开EXECUTE不满足。schema/lifecycle/RLS/fingerprint仍需Main证明；JS profile绑定model/price/endpoint，唯一预算scope由v2完整资格筛选，实际金额仍由reserve/dispatch核验。

## preflight observation

初始inventory在空库初始化记录中保存；后续consent/identity是当前新目标读回，两种证据不能混成同一次查询。下面空值/false只是未验模板：

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
  "freshInitialization": {"projectRef":null,"initialMigrations":[],"copiedSharedData":false,"copiedSharedAccounts":false,"copiedSharedRoles":false,"copiedSharedStorage":false,"copiedSharedBackup":false,"evidenceHash":null},
  "accessBinding": {"projectRef":null,"sourceProjectRef":null,"reusedSharedMaterial":false,"evidenceHash":null},
  "identityReceipts": {"projectRef":null,"ownerId":null,"policyId":null,"noticeHash":null,"scopeId":null,"configurationId":null,"hostedProfileHash":null,"endpoint":null,"evidenceHash":null},
  "exactConsent": {"projectRef":null,"ownerId":null,"authSessionId":null,"consentId":null,"policyId":null,"noticeHash":null,"accepted":false,"revoked":false,"evidenceHash":null},
  "workerStopped": false,
  "webDisabled": false,
  "ownerId": null,
  "initialPolicyIds": [],
  "initialNoticeVersions": [],
  "initialNoticeHashes": [],
  "initialScopeIds": [],
  "reviewedPackageHash": null
}
```

所有回执projectRef必须与新target一致；accessBinding仅表达新Supabase访问来源的安全审阅元数据，不输入key值、路径、JWT或旧文件。来源ref为dzt、复用共享material、无精确consent/receipt均失败。initial inventories必须空，新identityReceipts再绑定fresh policy/scope/profile。实际安全凭据仅由JT secure operator handoff及独立deployment owner处理；现有ECS db.key保留且不读取/复制/覆盖。kit filter不是通用secret detector，仍禁止输入任何秘密。

观察过期、来源/预算证据过期也失败；operator布尔/摘要仍只是事实记录，不能替代live actor/RLS/真实使用证据。初始化授权和policy发布须先独立完成，之后才能有当前consent供最终preflight；未发布candidate没有consent时会阻断，不通过合成回执激活。

## backend接缝与运行边界

阶段一用闭合 /4+projectRef接口候选，复用既有 /3 tariff离线验证；明确profileValidation=CANDIDATE_NOT_BACKEND_VERIFIED且preflight阻断。Main整合独立backend函数后，owner替换为其正式typed validator并补验；不能把候选标记改成成功骗过验证。hosttarget /2、image/sourceBuild/profileHash和独立trusted composition root由原package/backend owner负责，kit不改那些目录。

运行和停用沿原账本/生命周期：每次leaseToken对应原attempt，在同目标reserve→dispatch→真实usage→settle。unknown费用仍pending；不抹零或免费重试。停止先禁用Web admission与新预算，停止poll并drain现有独立host，再终端撤销policy，核账；不删除ledger/consent/data、不复活撤销policy。

本轮没有target/provisioning/role/credential/provider/fee/deploy动作，真实new-project Auth/Session/provider/multi-turn及host image验收UNRUN。
