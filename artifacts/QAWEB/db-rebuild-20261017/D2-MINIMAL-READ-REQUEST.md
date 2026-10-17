# D2 最小追加只读请求（未执行）

供 Main → BestJ 一次核定新增范围。沿用 Go2China 连接 `link_6acdbe0471c081919ff47de24ca53b0f`、项目 `dzqdzetcctkhbrhlxxgn`；不换账号、项目或凭据。当前 D0 授权只覆盖原 82 个对象及账本，本请求不把 source-only D2 授权解释为新增真实读取资格。

已解决：四个原差异 body 与四项约束均已由已接受仓库源码/明确变换和 D0 SHA-256 匹配，无需再读取这些对象的正文。此次只请求下面实际阻止共享队列隔离和普通角色接入判断的元数据，不读取用户材料。

| 新增范围 | 只读字段 | 必要性与来源 |
| --- | --- | --- |
| public.claim_turn_work() | 存在、签名、owner、security、search_path、body SHA256、对象 ACL、四角色有效 EXECUTE 布尔 | 原 QA migration 显式修改旧 global claimer，排除 QA context；D0 未覆盖，不能假定旧 worker 不会消费新 QA 工作 |
| turn_private.lock_text_work(uuid,uuid) | 同上 | 原 QA migration 显式拒绝 QA context，防止旧文本 worker 越过 QA dispatch；必须先证明旧源身份 |
| turn_private.bound_task_history()、turn_private.task_history(uuid) | 同上 | D0 已见 service_task_turns 的 bound_task_history trigger，但没有函数身份/定义 hash；保持原 Task 历史约束不能只靠名字 |
| turn_private.service_task_turns、turn_private.text_content 的非 internal trigger | trigger 名、enabled、函数 schema/name/identity signature、定义 SHA256 | 确认已见 trigger 绑定的真实函数，不读取触发器正文或数据 |
| public、turn_private、identity_private、auth schema | owner、ACL；四角色有效 USAGE/CREATE 布尔 | 对象级授权不等于可用 schema 权限；需要确认新 Native invoker / service 调用在既有边界内成立 |
| postgres、anon、authenticated、service_role | 存在、superuser、inherit、bypassRLS、canLogin；上述对象上的有效权限布尔 | 补 D0 未覆盖的最小角色条件；不查密码、pg_authid 或全局角色清单，不更改 membership |

拟执行查询见 `d2-requested-catalog.sql`，仅 `BEGIN READ ONLY ... ROLLBACK`、pg_catalog 与内置 has_* 检查。无动态业务调用、DML/DDL/GRANT、应用表 SELECT、函数/策略/default 明文、用户 ID/正文/同意行/余额/密钥。函数体在服务端只作 SHA256，结果仅保存到原自有 artifact 路径。若权限拒绝或身份/范围不符立即停止，不换账号或等价绕行。

主要保密风险仅是源码/权限元数据暴露，因此不输出正文，限定四个函数、两表 trigger、四个 schema 和四个已知角色。该查询不证明数据兼容、并发写窗口、worker 当前启用状态或实际调用成功；后续 activation/canary/费用及 target 写仍需精确动作范围，不能由本只读请求推导。

拿到 hash 后先继续本地源码匹配；若仍无法匹配，才逐对象报告必要的下一步定义证据，不预先申请全部函数正文。本次不需要真实 Actor、预算金额、旧 AGE 或身份材料。取消事件 helper 的缺失已经由 D0 证明，不能用本查询凭空补齐，也不能用空表或成功 stub 替代。
