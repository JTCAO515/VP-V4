# 最小真实动作差额（本轮未执行目标写）

固定连接 Go2China / `link_6acdbe0471c081919ff47de24ca53b0f`；目标 `dzqdzetcctkhbrhlxxgn`；拟定原 DB writer `01a133bb-cc6d-7ca1-8db0-9e02bd252e1d`。当前没有 target 写 lease、实际无并发安排或真实 canary/费用批准。参数/JSON 不创造这些事实。

| 动作 | 实际副作用 | 现有覆盖与差额 |
| --- | --- | --- |
| 源码生成、独立本机 fixture/测试 | 自有 nonce PG 和本地文件；无真实目标连接 | 重写方向及 D3/source/local 指令已覆盖，继续直接做 |
| 同账号 fresh before / recovery inspection | 限定程序/结构/权限/角色可达元数据，只读事务，无应用行 | 日常有限只读诊断澄清已覆盖；不是新的 JT 开发方向审批 |
| 目标 rollback 演练 | 锁四张共享表，临时 DDL/GRANT 后 ROLLBACK；仍可能阻塞调用 | 需要明确目标写/锁范围与执行安排；不能因尾部 ROLLBACK 当作普通只读 |
| 目标 apply | 18 新函数、1 列/约束、2 约束扩展、新 trigger、3 个已有 body 最小更新；COMMIT | 新增具体 target DDL/write scope 尚未下达；须固定 reviewed payload、fresh before、唯一 writer 和无冲突窗口 |
| 新 QA 函数授权 | 7 authenticated、6 service_role EXECUTE；5 内部；不 CREATE ROLE、不授表/schema、不改原 ACL | 与该次增量一体核定；不是泛化提权。实际普通角色身份仍由原 Auth/RLS 验证 |
| 显式 safe STOP | 仅撤销 18 新函数的客户端权限，保留所有旧/新数据及结构；COMMIT | 单独明确停用 scope；不能由 COMMIT_UNKNOWN 自动触发，也不是删除式回滚 |
| 真实 runtime 心跳/启用 | heartbeat 写运行记录；启用/配置可能启动真实 worker 处理 | 当前未执行/未授权激活。心跳不等于 ready；配置/并发 drain 由实际 runtime owner 提供事实 |
| 普通身份 canary | 实际登录、用户通知/同意、request/Task/queue、预算 reserve/dispatch/settle，可能产生 provider 费用 | 当前未提供具体 actor/policy/budget/endpoint/费用与 canary lease；不能伪造同意、借 service 身份冒普通用户或从源码推导已批准 |

旧 A–D/E 与本轮方向不混用：本包不恢复旧 restore/window/材料，不以旧 A–D 的历史执行或源代码成功证明 E 条件满足；也不把旧条文泛化成阻止常规源码/只读工作的理由。真正新增的是上表目标写锁/提交、新 QA 执行权限、runtime 激活及真实 canary/费用的精确动作，不重复询问重写方向。

## 执行字段来源与尚未证实项

- project/link：D0 官方 get_project 与既有固定连接；所有生成请求固定这些工具参数，不接受 DSN/其他身份。
- owner/schema/角色及原对象：D0 + D2 follow-up 元数据；4 个旧差异 routine 和额外 4 个 worker/Task routine 已与仓库源 hash 匹配。
- work 列槽：`d3-work-shape.json`，实际 `relnatts=10`、无 dropped slots；与 visible-column 信息一起用于 fresh guard。
- 角色继承：`d3-role-reachability.json` 的四角色 MEMBER/USAGE 16 对，仅程序权限元数据。普通角色间无继承升级。
- 实际 writer/approval_reference/concurrency_reference/window：来自未来已核定的外部真实指令/安排；目前缺失，所以 apply/rollback/safe-stop 请求未生成、更未提交。工具能力、非空参数或 sourceReady 不能替代该事实。
- Actor/policy/budget/费用不属于 DDL 所需虚构参数；它们留给真实 runtime/canary 包，不阻塞已授权源码与本机验证。

事务使用 15s statement / 2s lock / 30s idle timeout、固定 owner/database/version 检查、协作 advisory lock、四表锁、完整 scoped before/after 比较及时间复查。协作锁/表锁不能证明所有外部 worker、旧缓存函数调用和部署已经排空；实际无冲突安排仍需 runtime/writer owner 明确。

COMMIT 回执缺失、错 run ID、错 action 或提交后断言错误均保持 UNKNOWN。只读结果分 BEFORE / AFTER / MIXED_OR_DRIFT / observation failure；任何一种都不自动重试或逆迁移。AFTER 仅证明当前效果存在，不是该 run 的持久回执。safe STOP 保留 postchange 记录；完整逆迁移必须另有数据兼容证明，当前没有假定可行。
