# D0：限定目录快照与目标差异建议

状态：只读采集与本机参考比较 PASS；target apply / cutover 未执行。

目标仅为 Go2China 既有连接 `link_6acdbe0471c081919ff47de24ca53b0f` 下的 `dzqdzetcctkhbrhlxxgn`。官方项目查询返回 ACTIVE_HEALTHY / 17.6.1.155；数据库报告 PostgreSQL 17.6。环境查询和目录查询实际返回 `transaction_read_only=on`。角色为 postgres，非 superuser、具备 bypass RLS；本次没有使用该能力读取业务行。

## 固定输入与结果

执行源码固定 `7f0352ac99affbb00c67e77ca1ff1b7196b769af`。允许清单从该提交的 reuse-map / port-coverage 生成：77 个应用对象加 auth.users、auth.sessions、auth.uid、auth.jwt、auth.role 五项依赖。每个对象的比较结果见 d0-comparison.json，原始安全元数据见 d0-target-catalog.json / d0-local-catalog.json。

| 分类 | 应用对象 | 21 个服务端口 |
| --- | ---: | ---: |
| reuse-exact | 29 | 6 |
| absent | 26 | 13 |
| different-owner-or-shape | 22 | 2 |

五个 managed Auth 依赖均存在，分类 UNKNOWN：真实平台对象不可与合成 Auth shim 等同或互换。reuse-exact 仅表示 d0-catalog.sql 中捕获字段相等，不证明完整依赖、有效继承权限、业务行兼容或运行行为。差异分类是保守标签，本次未发现 owner 差异，不代表其他差异一定是缺陷。

13 个缺失端口：qa_read_policy_v1、qa_accept_policy_v1、qa_list_sessions_v1、qa_read_session_v1、qa_submit_message_v1、qa_cancellation_v1、qa_native_session_v1、qa_ready_groups_v3、qa_claim_work_v1、qa_read_work_v1、qa_authorize_dispatch_v1、qa_authorize_dispatch_v2、qa_complete_work_v1。

两个已有但不同的端口：read_text_turn 的 bodyHash 不同；native_session_v2 的 ACL 不同。六个捕获字段相同的端口：native_prepare_v2、reserve_model_budget、dispatch_model_budget、finish_model_budget、read_hosted_worker_status、hosted_worker_heartbeat。不得把它们的元数据相同记作实际调用成功。

迁移账本仅取 version/name，共 75 条；最大记录版本 20260923140000（places_provider_quota）。该记录不能证明此后不存在手工或其他来源变更，也不授权重放全部后续 migration。

## 具体目标 delta 建议（不执行）

1. 保留既有 identity/mobile、预算、Trips、Profile、managed Auth 对象和数据。29 个相同对象原则上复用；未来 apply 前重新固定其元数据，不能沿用过期快照作写前条件。
2. 对缺失的 26 个对象分别审查真实依赖，再准备增量 CREATE。缺失包含 QA helper/端口、assistant 私有表、capacity 表及 cancellation helper；最小 fixture 的空依赖表不能直接视为目标完整业务实现。不得因名称缺失直接运行整个 baseline.sql。
3. 三个明确的列缺口：turn_private.work.execution_mode、turn_private.service_tasks.capacity_enforced、turn_private.grounded_turns.selected_place_request。只准备 additive 候选；默认值、历史行语义、回填和约束验证仍需单独证据。本次没有读取现有行。
4. 目标 grounded_turns 额外存在 unanswered_needs、place_subject_id、place_name、place_resolution 及相应约束；必须保留。目标 service_tasks_expected_result_check、grounded_turns_intent_check、text_policies_context_mode_check 与本机 hash 不同，不能用较窄的 fixture 检查约束替换。应基于已接受源码和明确的兼容集合设计后续约束；本次不读取目标约束正文。
5. public.chat_threads / trips / turns 等目标拥有额外索引、策略、触发器；public.turns 还有 turns_id_owner_unique。text_content、service_task_turns 也有目标独有约束或触发器。保留这些结构，禁止用 fixture 全量 ACL/RLS 或 schema 同步覆盖。完整差异名见 d0-comparison.json。
6. cancel_chat_turn、start_chat_turn、read_text_turn、turn_private.require_text_task 的函数体 hash 不同；优先追溯对应已接受源码及既有消费者，设计精确更新范围。native_session_v2、enqueue_turn_work、start_text_turn 等 ACL 差异须核对既有调用方，不能直接复制 fixture REVOKE/GRANT。
7. 下一份可执行 target delta 必须独立于固定 7f fixture：列出精确 before hash、additive patch、after hash、数据兼容及回退要求。当前尚无安全可执行 target patch，不以 D0 证明迁移/回滚可行。

## 采集、验证与边界

目录 SQL 预先限定到 allowlist，并审查为只调用 PostgreSQL 内置目录/格式化/哈希函数；没有业务 RPC、动态 SQL、应用表 SELECT、DML、DDL、GRANT、ROLE 或配置变更。函数正文、probin、默认值、策略、约束、索引和触发器定义只输出 SHA-256；未输出原文。唯一非 pg_catalog 表读取是已确认存在且可读的迁移账本，且只取 version/name。所有目标 SQL 使用 BEGIN READ ONLY / ROLLBACK。没有工具拒绝、重试换身份或越权读取。

本机参考仅在全新 nonce 自有、无网络/端口/挂载容器安装固定 7f platform.sql + baseline.sql，然后执行同一目录查询；没有 seed、provider、业务测试矩阵或新接口。运行前逐文件验证固定源码一致，cleanup PASS 且容器不存在，见 d0-local-proof.json。本轮不重跑此前 38 项合成观测；它们继续保留原本的验证范围。

目录与账本分别处于不同只读事务，不是原子整库快照。未采集 schema ACL、角色继承、allowlist 外依赖及所有数据库级属性；函数签名、对象 ACL/RLS 的比较不能证明调用者最终有效权限。真实 Auth/JWT、provider usage、服务端 HTTP endpoint、worker 激活、实际 iOS、删除/撤回历史保护、并发写入、unknown ACK 数据保全、迁移和回滚均未验证。TRANSITION-PLAN.md 中的门禁与原授权范围保持有效。

生成比较脚本曾因本机相对路径少算层级而失败；已改为 git show 固定 7f 读取 port-coverage 后成功。该失败未触发目标查询重试或目标写入。
