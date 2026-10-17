# D2 续交：有界元数据、旧 worker 隔离与合成首答

源码 `f54f060783afa61b6a2d6dcec0517dd18967da7b`。最终本机运行 `d2-run-1b1bad5c38a44ed0971d086508785bd1.json`：8 组 PASS / cleanup PASS；执行源文件 SHA-256 与该提交相同。7f 顶层原执行文件未改。

本轮目标仍无写入。Main 后续明确澄清同账号/同目标有限程序/结构元数据属于既有日常只读诊断范围后，执行了此前列出的 `d2-requested-catalog.sql`：仅 4 个精确签名函数、2 表 trigger 绑定、4 schema/角色元数据，BEGIN READ ONLY / ROLLBACK，实际 readOnly=on。没有应用行、源码明文、用户材料、金额、密钥或业务 RPC；没有工具拒绝或换身份。前一份“未执行”请求及 proof 保留为历史，本文件记录其后事实。

## 新增的真实目录事实

- claim_turn_work、lock_text_work、bound_task_history、task_history 四个 body hash 均匹配固定仓库原定义，见 `d2-followup-source-matches.json`。
- 原 bound_task_history trigger 指向同名私有函数；text_content 的 require_text_task trigger 也确认了实际绑定与 enabled 状态。
- anon/authenticated 非 superuser、非 bypassRLS；service_role 的 bypassRLS 为既有状态。public 有普通角色 USAGE，turn_private 仅 postgres 有 USAGE/CREATE；新增 definer 端口不要求向客户端开放私有 schema。identity_private 与 managed auth 的现有权限保持原样。
- 原 global claimer 只排除 task_history/knowledge_intent，原 text lock 未排除 QA。不能直接接入新 QA 队列。

## 累计最小候选

`d2-admission-worker-proposal.sql` 仍为 source-only、无条件拒绝、ROLLBACK 结尾，无 COMMIT/apply runner。

保留此前 18 个缺失 QA 函数、两项有限集合约束扩展、require_text_task 的 QA 关联检查、新 qa_link_mode trigger 和 7 authenticated / 6 service / 5 internal 权限矩阵；既有权限不变。新增：

1. 从已接受 20260927060000 迁移仅提取 work.execution_mode 的一个 ADD COLUMN 声明，默认 text、原有限集合约束；不引入 planning 表或功能。旧 global claimer 在选取前和加锁后过滤 text，并额外排除 QA context；旧 lock_text_work 只增加拒绝 QA context。两者原 owner/ACL、取消逻辑与锁顺序保留。
2. 新 QA claimer 采用显式 standalone 兼容版本：保留全部原 receipt/budget 排除、锁序、租约和 work 取消；不调用不存在的 assistant-only observer。该 observer 的已接受源码只处理 assistant-linked Task，对旧独立 Task 原本不产生终态/event 更新。新版本在每次调用前检查 D0 中缺失的三张 assistant 表及两个 observer/helper 均仍不存在，否则 P0201 拒绝。没有创建空 anchor 或成功 stub，没有更改已有取消函数，也没有静默忽略后来引入的 assistant 能力。
3. 原 cancel/start/read 三项旧函数不替换；目标额外列、索引、策略、触发器和 managed Auth 保留。没有 API adapter、队列或数据权威变化。新 claimer 的变化及固定 source/candidate body hash 单列在 `d2-worker-compatibility.json`，需独立审阅其有界结构前提。

`d2-cumulative-expected-metadata.json` 将 D0 加本次额外目录证据展开为精确 before / EXPECTED after。新增 18 个函数；D0 内既有变化仅 require_text_task、text_policies 的一项约束、service_task_turns 的一项约束和新增 trigger、work 的一列和约束；额外查询内只有两个 worker body 与新增 trigger 元数据变化。其余字段保留。EXPECTED 不是目标 after 实测，未来执行前必须重新固定 authoritative before；完整 apply 仍须结合这些 pins、事务 timeout/pre/post、并发写窗口和具体 lease，不能删掉拒绝门直接执行。

## 8 组最终本机观察

1. 四个旧函数、三项实际实例化约束匹配 D0，第四项 grounded 约束源 hash 匹配；不虚构 resolver。
2. 累计候选含权限与 worker 更新在事务回滚后，既有目录/合成记录/worker 定义回到原值。
3. 7/6/5 最小权限正确，原 ACL/owner 与无关目录保留。
4. 普通 Native admission、byte-exact replay、reopen；缺同意、跨 Actor、改字节、同 Actor 换另一已同意 policy、绕过 QA 直接走旧入口均拒绝。
5. 在 rollback-only 本机事务复现旧 global worker 抢占 QA；新补丁排除 QA、旧 text lock 拒绝 QA，普通 service_role 的 QA claim/read 取得正确 Task。
6. canonical mode 列与 planning 排除；另一个普通 Actor 通过原 SQL reserve → authorize dispatch → settle 合成用量 7 → complete → reopen 获得合成首答；未结算前无法完成回答。未预置回答。ready 仍返回 disabled，没有 worker daemon 或 provider 调用。
7. 失效 session 的 standalone 取消只改变原 work 状态，保留 turn/text；pending 预算场景返回 reconciliation_required、原请求字节不变；后来出现 helper 的结构变化被 P0201 拒绝。
8. safe STOP 保留新增请求/Task/回答和旧 archived/hidden/revoked、Task 父链、pending 预算及未知字节。测试主动删除的合成 auth session 被明确计作撤销输入，不伪装成迁移删除；worker control 始终 disabled。

`ef8731e2...` 为 6 组、`4c9226ed...` 为 7 组的中间 PASS，均 cleanup PASS；最终仅计 `1b1bad5c...` 的 8 组，不累加旧 5/6/7/38 组结果。

## 剩余边界

本轮 source/有限 local 短路径已推进到合成首答；目标行兼容、真实 JWT/GoTrue、provider usage、实际 HTTP endpoint、真实 worker 调度、设备、网络 COMMIT 未知及真实 canary 均未验收。ready enabled 分支未调用；本机调用 trusted SQL 不等于真实服务启用。

下一步为对固定累计候选独立审查，再在明确 target writer/concurrency/apply 范围下准备实际执行；当前没有目标写 lease、激活、费用或真实 canary lease。旧 A–D/E 未因源码成功而自动满足，不恢复旧材料/window。任何未来 COMMIT 未知均 STOP、保留身份/字节并核对权威回执，不盲重试或声称 rollback；已有 postchange 数据只能在明确可证时回退，否则保持安全停止。
