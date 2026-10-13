# VPV10-SCALE-004/3 精确交付

以下初次交付保留为历史；最新已授权实际验证见文末。

独立工作树：w2-supabase-bootstrap-20261013；base 304c3fd65ada710af09f0ed171854d56ff0c3be2。
仅 helper、对应契约检查和本目录自有证据可提交。其他三份 Main overlay 哈希保持原样。

## 已定位的根因

官方 Supabase CLI 2.117.0、已缓存本地 PG17.6 image、唯一项目/62100 段端口启动。
155 份产品 migration 逐字节复制，产品源码 SHA256 始终为
5e07bc1ce41f236c0fd29ece8f9f15525c9e234e78f9a7a25ab22751082babdf。

使用与 installed_supported_v1 相同的空 search_path 比较：52 个静态函数全部匹配；8 张静态表中仅预算三表 ACL/policy roles 不匹配；所有约束、列、trigger、RLS 均匹配；原八个 guard 均 true。

1. 三个 public.model_budget_* 表：预期 service_role=arw，实际 arwdDxtm。
   真实 has_table_privilege 向量确认多出 DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN。
   PUBLIC、anon、authenticated 仍全部 false；postgres 全部 true。
   管理型栈 postgres/public 的 default ACL 对 service_role 预授所有表权限；历史 durable_model_budget.sql 只撤销 PUBLIC/anon/authenticated，之后 GRANT SELECT/INSERT/UPDATE 不会撤销遗留权限。普通 initdb synthetic 不带该默认 ACL，故只得到显式 arw。
2. native_mobile_access_v2 restrictive policy 的角色实际都是 authenticated；静态目录却硬编码 synthetic 本地 OID {16385}，真实 Supabase OID {16444}。
   OID 是实例分配值，不是持久角色身份。实际角色名映射已验证，详见 diagnostic-summary.json。

r4 诊断默认 search_path 下的额外 constraints 差异在 r5/r6 空 search_path 中消失；不能作为产品缺陷。早期两个临时诊断 shim 的语法错误已修正，不属于产品 SQL 错误。CLI 不保留 migration warning，因此最终在仅产品迁移、默认拒绝的独立已启动栈内读取目录。

## 可提交 helper 修复

保留 Main 的 exact reviewed source hash 与 separate retained-upgrade helper。
新增对子目录及 migration 文件符号链接的拒绝；即使链接目标字节完全一致也拒绝。
未 grant、提升角色、关闭 trigger、改变产品 guard 或采用未知 runtime source hash。

## Main/SQL 专业 writer 候选（未应用）

完整 w2-budget-acl-full-candidate.sql SHA256：
543e2617627fe7eddb8564ee4027e4c59cb986d77db2508da12a7a37ae633dea。

基于原 5e07... 完整产品 migration，只有两个修正：
- REVOKE 三表 service_role 的五项多余权限，保留现有 SELECT/INSERT/UPDATE；无 GRANT。
- 静态 installed table-policy catalog 以排序后的精确角色名数组比较，预期仅 [authenticated]，保留名称/command/permissive/USING/WITH CHECK 等所有其他属性与原八个 guard。

此候选改变产品 SQL/静态 guard，超出本 chat 写权，未 apply；helper sourceHash 仍为 5e07...。
Main 需由唯一 SQL writer 审核整合，并同步 reviewed helper hash；实际 candidate before/after vectors、初始化、authenticated CAS、恢复负例及 HTTP consumer 均 UNRUN。这里不能宣称初始化 PASS，也不能用 owner-only ACL 规范化掩盖真实多余权限。

## 实际验证

- PASS：4 项 staging/bytes/symlink/inventory 契约检查；helper 与诊断脚本语法；diff whitespace。
- PASS：独立官方 CLI 的 GoTrue/PostgREST/SQL 栈在仅产品迁移、默认拒绝下实际启动。
- PASS：原 helper 在真实 Supabase 元数据下拒绝 W2_FIXTURE_SOURCE_UNAVAILABLE，拒绝前后 snapshot 完全相同：ROOT revision0/manifestnull，12 disabled controls revision0/stop0，receipt0、fences0、budgets0、attempts0、auth users0、readyfalse。
- FAIL：当前精确 5e07 产品安装的 fresh 初始化，原因已定位为上述两个静态表元数据差异。
- UNRUN：SQL 候选应用后初始化、有效权限 after 向量、authenticated CAS 及 consumer 全链路；本轮无权限应用。
- 清理：全部本 chat 项目容器/卷/网络 absent、端口无 listener、执行会话结束；其他 owner 资源未触碰。helper 写权本轮释放，无在途进程。

Supabase 默认权限背景：[官方变更说明](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)。当前结论以自有真实栈 pg_default_acl/has_table_privilege 结果为准，不由配置 flag 推断。

## Main 精确接受后的实际验证（最新）

Main 的 managed-budget-candidate-apply.json 精确授权 5e07... → 543e2617627fe7eddb8564ee4027e4c59cb986d77db2508da12a7a37ae633dea。
本 WT 仅按授权复制该完整候选到 W2 产品源；不提交该共享 migration，留 Main 唯一 SQL writer 整合。
helper sourceHash 同步 543e...，helper 文件 SHA256 为 e36c0c3b34e2d70b079d14015c649a935ee76a1b97bc9a05768e167af1bc9ec2，与 Main 审核记录完全一致。
text/durable 两份 Main overlay SHA 均保持原样。

PASS（accepted-results-aggregate.json 共 10 个实际检查）：
- 实际官方 Supabase CLI 2.117.0 / 唯一新项目 / 62100 段 / GoTrue+PostgREST+SQL startup。
- 三表有效权限 after 向量，PUBLIC/anon/authenticated 全 false，postgres 全 true，service_role 仅 SELECT/INSERT/UPDATE true；复用原 5e07 源真实 before 向量，与新 543e after 的差异严格仅 3×5 项撤销。两个向量来自独立 nonce 的相同 CLI/PG17.6 环境，非同库改写。
- installed_supported=true、原八个 core guard 全 true；临时 STRICT 属性与 policy rename 变异均返回 false，rollback 后恢复 true。52 个静态函数（包括 ACL/EXECUTE）继续匹配。
- 已 reconcile 但 revision-zero 的 restored 状态拒绝 fresh 初始化；交易自动 rollback，snapshot 不变。
- 真正 fresh 初始化执行12个 authenticated CAS，最终 ROOT revision13（reconcile +1，再12次 CAS），12 enabled controls、12 retired receipts、settings false、users/sessions/members/mobileAccounts/fences/budgets/attempts 全0、recoveryReady true。
- 重用已初始化库拒绝 W2_FIXTURE_NOT_PRISTINE，snapshot 不变。
- 新 nonce 栈在 startup 阶段通过 stageFreshOpsFixtureBootstrap 写入独立2099 initializer 并实际执行成功。
- 真 GoTrue cookie → 实际 Next HTTP /api/ops/controls：workspace200、set200、original receipt200、stale CAS409、unauth401、cross-origin403、revoked member403；两次合法变更最终 revision15。
- HTTP actor 先 global signOut 再 admin.deleteUser；用户/Session/member/mobile account 全0，receipt 全retired，settings false。
- 官方 CLI stop --no-backup 成功，Next own process退出；无其他 owner 资源被触碰。

验证脚本历史错误保留：r1/r2 把 reconcile 后 ROOT 预期误写为12，实际初始化已成功13；修正后通过。
r3/r4 的127.0.0.1 Origin 在 Next dev 的localhost request-origin下被正确拒绝403；相同账号 direct RPC成功、JWT/session有效，localhost Origin诊断返回200。
最终实际HTTP改用localhost URL+localhost Origin+localhost listener，原产品 envelope 未改、未放宽；此前6项有效 source/runtime证据复用，不重复矩阵。
Next dev 自动改写的 AGENTS.md / next-env.d.ts 已在 own server退出后按精确原字节恢复；未提交这两文件。

UNRUN：目标/Staging/Production、真实 provider/费用、Native/设备/VoiceOver、人类验收、Main 统一 final-head CI。本证明只覆盖此已授权本地初始化/SQL/Auth/HTTP范围。
最新证据入口：accepted-results-aggregate.json、accepted-runtime.log、fresh-initialization-snapshot.json、effective-vectors-after.json、actual-vector-delta.json、http-observations.json、accepted-cleanup.json。
