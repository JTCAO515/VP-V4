# VPV10-SCALE-004/3 精确交付

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
