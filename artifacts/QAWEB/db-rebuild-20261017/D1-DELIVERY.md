# D1：最小 QA 增量源码候选与有限代表性验证

源码固定 `98ff87bac0632d507a90e5b5732af9e964b71907`。输入固定为 D0 `0762e867cbc3801448b0f6c8caa4fef5dbc766ca` 与原执行源码 `7f0352ac99affbb00c67e77ca1ff1b7196b769af`；原 7f 文件字节保持不变。

状态：SOURCE_CANDIDATE_BLOCKED_FOR_TARGET。本轮没有再次读取真实目标、没有 target apply、没有切换。此候选不会提供可用的完整 QA 服务。

## 可审查结果

- `d1-plan.json`：82 个对象逐项继承 D0 分类，记录 reuse / retain / hold / propose-create；18 个缺失 QA 函数的精确签名、源码 hash、after body hash、直接源码引用和拓扑顺序；7 项明确阻塞。
- `d1-candidate.sql`：精确候选 CREATE + 新对象 owner/revoke，before/after 目录断言、事务本地超时、无条件拒绝门与 ROLLBACK。不包含 COMMIT，不更新迁移账本，不创建缺失非 QA 空 anchor，不修改旧列/ACL/RLS/body，不激活新入口。
- `scripts/qa-agent-db-baseline/target-delta/propose.py`：默认只打印提案摘要；`--emit` 只写固定自有 artifact 路径。没有 DSN 或 apply 模式。
- `verify_local.py`：仅调用已有固定镜像、自有 nonce、无网络/端口/挂载 Fixture。它直接验证候选定义及 pre/post 断言，从不把候选接到真实目标。

没有对 22 个差异对象生成猜测性替换。29 个 reuse-exact 仍仅是 D0 捕获字段相同。18 个新函数全部撤销 PUBLIC、anon、authenticated、service_role 权限；只在本机实验临时开放三项有限 Native 读会话函数，测试后全部安全停止。缺失函数的直接源码引用为 lexical inventory，不是完整的动态依赖闭包证明。

## 本机证据

最终运行 `d1-run-a6ee0c685a9e4f51bb637b12f61d1e90.json`：PASS_D1_BOUNDED_REPRESENTATIVE，6 组观察，cleanup PASS。所有运行时 Python 文件 hash 与固定源码提交相同。新增源码 AST、执行参数拒绝、7f 全部原文件字节及 diff 检查通过。

1. 有限旧结构：移除 D0 缺失对象和三列，保留目标已知额外列的类型；恢复两项 bodyHash 与 D0 相同的旧函数，保留 native_session_v2 的 service_role EXECUTE；增加明确标识的合成旧列/策略/索引/触发器哨兵。
2. before 与本机代表性目录完全匹配时，候选仍以 P0104 拒绝；目录漂移以 P0103 拒绝，既有结构与行均不改变。
3. 18 项定义在事务内安装后 ROLLBACK，新增对象消失、原元数据与全部合成行摘要不变。
4. 仅本机提交候选定义后，实际执行 after 断言；18 项新函数原始 bodyHash/owner/deny-all ACL 一致，原有对象和合成身份/epoch、归档/隐藏/撤回状态、unknown 原始字节、Task 父链、pending 预算行不变。
5. 本机临时开放有限 Native create/list/read/reopen，验证归档排除、跨 actor 与过期 epoch 拒绝，原 Native service 权限仍在。
6. safe STOP 只撤销新增入口权限，保留本次创建的会话及全部 postchange 行，unknown 字节 hash 不变，worker 仍 disabled。

这不是目标复刻：未重建未知真实策略/触发器/约束定义，合成额外结构只验证保全机制；真实数据兼容、真实删除/撤回历史保护、完整 Native submit→模型回答→保存、实际 JWT/GoTrue、provider、设备、并发 writer 和网络 COMMIT 未知均 UNRUN。没有重跑旧 38 项完整矩阵。

历史运行完整保留：`c9498cfa0b684b5984df518140859854` 在代表性构建阶段 FAIL SQL_2BP01 / cleanup PASS，因为 fixture 的 qa_link_mode trigger 仍引用待移除函数；改为只在自有本机明确先移除该 fixture trigger。`b94089dae0c949fb9bac6c12f6e7b8bb` 为上一版 6 组 PASS / cleanup PASS；最终版补充可执行 postflight 和独立漂移 SQLSTATE 后再跑，不能把两次 PASS 相加为 12 项。

## 最小缺口与风险

1. `cancel_chat_turn`、`start_chat_turn` 的 D0 bodyHash 在固定 7f 的同名 dollar-quoted 定义扫描中未匹配。先定位可证明匹配的已接受源码；若仍不足，再由 Main 核定是否需要单独有界定义调查。扫描不涵盖重命名、动态 DDL 或变换，不宣称仓库绝无来源。见 `d1-source-matches.json`。
2. text_policies_context_mode_check、service_tasks_expected_result_check、grounded_turns_intent_check 的既有语义尚不能由 hash 得出；三项缺列的历史/default/backfill 语义也未验明。不能缩窄约束或把 fixture 默认值直接写入旧行。
3. qa_claim_work 所需 cancel_unclaimable / assistant_event 链依赖缺失的 assistant 结构。不能用空 anchor 或成功 stub 冒充兼容实现；完整写链保持阻塞。
4. D0 没有 schema ACL、角色继承/属性全貌或有效 managed Auth 会话语义，也没有并发写入隔离证据。需要 Main 核定最小新增只读范围与实际 writer 区间；当前 postgres 连接能力不是写权。
5. `read_text_turn` 与 `require_text_task` 的 D0 bodyHash 已匹配到固定源码 grounded-turn 版本；仍须验证新 QA 历史契约与旧额外结构的兼容。native_session_v2 既有 service grant 保留，不按 fixture 缩减。
6. target 执行还需精确候选审阅、新鲜 before/after pins 和具体 target write lease。本提案仅固定既有快照，不能自动满足该条件。

## 事务与回退边界

提案中设置 statement 15s / lock 2s / idle-in-transaction 30s，预检 major 17、current_user postgres、必要角色存在及 D0 对象元数据。完整 schema/role 检验仍因上列缺口阻塞，不能用当前基础检查冒作完整权限验收。after 检查精确新对象元数据并要求所有既有捕获对象不变。没有应用行读取或写入的 target SQL。

未提交的失败由事务整体回滚。本机已提交后的实验使用 safe STOP，保留新增与旧数据；不以 DROP 或删记录假装无损回滚。若未来真实 COMMIT 回执未知，必须停止、保留原始请求身份/字节和本次事实，不盲目重试，不声称 rollback，等待有界权威回执/目录核对。此网络情形本轮未模拟。

旧 A–D、条件 E 与本轮源码/合成数据方向分别记录。旧窗口没有恢复，E 条件没有凭新方向变真；当前没有 target 写 lease。下一步应针对以上最小缺口补证与审查，再产生独立可执行 target patch；不要删掉本候选的拒绝门直接执行。
