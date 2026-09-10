# VPJ-02 Staging核查与验收记录

最新2026-09-10：原13+获额外授权RPC迁移已完成11→25，备份恢复和普通JWT矩阵16/16通过，精确清理后原数据摘要一致。见[本次实际结果](staging-apply-20260910.md)。下文为此前只读阶段历史记录，不代表当前待执行清单。

## 已确认

用户明确指定 VP - V4（新加坡）作为后续测试环境，并确认没有真实用户/业务数据。
CLI项目列表实测名称匹配、region=ap-southeast-1、ACTIVE_HEALTHY；已在独立工作区link。
原始Xcode工作区的修改保持原样；supabase/config.toml未重建；本地绑定缓存忽略，不提交密钥或项目ref。

## 只读结果

- 本地24条迁移；远端11条，版本与名称均匹配；没有远端独有版本。
- 已有3条Auth记录、2条Trip记录；未读取具体身份、内容，也未修改/删除。用户的“无真实业务”是环境说明，不当作物理空库。
- 观察到的11张public/private表均启用RLS。这是管理连接的元数据检查，不证明真实owner/other/anon隔离。
- 当前authenticated仍有直接UPDATE trips授权；待应用V4-10迁移会撤销它，不得为了跑旧测试恢复权限。
- 应用SQL文本/所有函数内容与版本号的等价性未核对；迁移记录匹配不代表全部运行验收。

## 待应用的13个既有迁移

只列计划，尚未执行：

- `20260828153000_v4_08_durable_chat_threads.sql`
- `20260828160000_v4_09_chat_feedback.sql`
- `20260828170000_v4_10_trip_version_snapshots.sql`
- `20260828180000_v4_11_trip_place_references.sql`
- `20260828190000_v4_12_trip_action_references.sql`
- `20260828193000_v4_13_memory_profile.sql`
- `20260828194000_v4_15_memory_consumer_receipts.sql`
- `20260828200000_v4_16_user_profiles.sql`
- `20260828210000_v4_17_privacy_lifecycle.sql`
- `20260829191000_v4_14_server_minted_memory_consent.sql`
- `20260830100000_launch_03_trip_content_snapshots.sql`
- `20260830210000_launch_11_trip_proposal_patch.sql`
- `20260830211000_launch_11_trip_proposal_patch_revision.sql`

## 独立迁移审阅

13条待应用SQL未见顶层删除Auth/Trip、DROP TABLE或TRUNCATE，但不能称为纯新增表：

- V4-10为已有Trip回填当前head snapshot并撤销直接UPDATE；不补造历史。
- LAUNCH-03回填snapshot.content，替换proposal policy/确认RPC；函数内的trip_days删除仅在后续确认调用中执行。
- V4-08撤销直接创建Turn并修改状态约束；Memory consent改为服务端生成ID，旧写入方式不再兼容。
- 升级前必须核对实际函数/policy/约束漂移，取得覆盖现有账号/Trip及关联状态的可恢复备份。只记录备份时间/范围，不把数据、密码哈希或凭据写仓库。
- 13个文件的SHA256固定在readiness.json；文件变更时重新审查，失败不repair冒充成功、不恢复旧直接写权限。

## 连通性证据

HTTPS Management API固定只读查询成功。
`supabase db push --linked --dry-run --skip-vault` 未执行任何迁移，报直连Postgres连接中断。
切换CLI的HTTPS DNS resolver后报无有效IP。
额外无凭据协议探针：direct在SSLRequest后关闭；session pooler响应SSL，但默认系统CA严格校验失败。
后者不能直接判为服务端坏证书；[Supabase官方文档](https://supabase.com/docs/guides/platform/ssl-enforcement)要求verify-full使用对应CA。
尚未取得并核对该连接CA，不关闭证书验证、不降低TLS、不修改全局网络/SSL配置。
直连、pooler、worker的实际数据库身份路径仍未验收，不能用HTTPS管理连接代替。

## 下一阶段的限定范围（待明确授权与运行门）

1. 解决目标Staging的可靠连接，完成dry-run、适用迁移验证和备份/恢复方案后，才按原始顺序应用上述13个已有迁移。
2. 不改写或repair已应用11条历史，不重置数据库，不复用旧VP-Final，不执行Production迁移。
3. 如授权测试账号准备，仅创建两个本轮专用、普通Auth临时账号；不发邮件、不授予reviewer/admin、不更改认证设置。随机密码/JWT仅在受控进程内使用，不写聊天/日志/仓库。
4. 真实password登录并校验Auth用户身份；JWT owner创建唯一标记空Trip，owner可读、other/anon拒绝跨用户读写；直接PATCH按当前最新合同拒绝。
5. 清理仅限本轮明确记录的测试Trip与新建临时账号；不按前缀或全表删除，不动现有3个Auth与2个Trip，不删审计记录；失败保留清晰残留记录。
6. 最小矩阵不调用confirm RPC，且不修改已有计划。后续计划更新必须走Proposal→可见diff→明确确认→原子Patch。

项目连接授权已落实；上述实际schema/账号变更不能仅由link命令推导批准。未得到明确范围或运行门未通过时只保留准备工作。

## 可复查命令

```bash
supabase db query --linked --file scripts/db/vpj-02-readonly.sql --output-format json
supabase db push --linked --dry-run --skip-vault
pnpm docs:check
git diff --check
```

运行前须核对当前独立工作区绑定到指定Staging。只读SQL通过BEGIN READ ONLY/ROLLBACK限定；版本与表元数据不含用户内容。

回滚本PR只需revert文档/只读SQL；未执行远端迁移或用户数据变更。解绑本地缓存不代表删除远端项目。

## 2026-09-11 frozen26→33 preparation

Current [explicit Staging metadata](staging-33-preparation/staging-metadata.json) freshly confirms26,
matching versions/names and3 Auth/2 Trip. Migration27's exact15-function prerequisite encounters18;
the three extra effective grants are an observed blocker, not authorization to weaken the check.
[Preparation evidence](staging-33-preparation/verification.md) includes an isolated two-container
restore/upgrade rehearsal, guarded pre27 administrative SQL, exact frozen package and caller matrix.
[Runbook](../../docs/runbooks/staging-26-to-33.md) requires separate actual migration/permission
approval. No remote writes, real credentials or user-row reads, new policy or team access occurred.
