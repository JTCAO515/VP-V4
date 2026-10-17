# D3 受控事务源码与本机消费接口

最终源码 `b6b503ddd02b77bd638da5f0acc152e91ab848fb`。8 组事务验证源码固定 `fee33c48181a23260298c896dcb6106865d6016a`；后续只改 CLI 请求文件的不可覆盖持久化，单独验证并核对 transaction/guard/recovery 等函数 AST 未变，复用 8 组证据而不重复跑矩阵。累计业务 SQL 仍固定 D2 `a3347896`，7f/753/旧恢复材料未改。

## 已完成的源码路径

`d3_transaction.py` 默认离线 dry-run；inspect 输出已有官方工具的同账号/同 target 只读请求。apply/rollback/safe-stop 需要明确开关及外部实际已准 writer/target/时间区间/无冲突安排引用，且只生成请求、不自行提交。当前未提供实际写 scope，因此没有生成或提交真实 apply 请求。

实现为最小 SQL 单事务：timeout → 当前 role/database/version 和实际时间 → 协作 advisory lock → 四表锁 → fresh scoped before/owner/ACL/schema/role reachability/结构缺席及列槽断言 → 固定增量 → exact after → 时间复查 → COMMIT/ROLLBACK → 再断言并返回关联回执。没有永久拒绝 stub；已在自有本机实际走过 COMMIT 路径。生成参数不构成授权。

请求文件按 action/run ID 排他创建，拒绝覆盖原字节；不新增审批 token/restore ledger。丢失或错配回执保持 UNKNOWN，恢复只读分类不触发自动重试/逆迁移。显式 safe STOP 另需 scope，精确核对 after 后只撤销新 QA 函数权限，保留 postchange 数据与结构。

使用方法/SQLSTATE/恢复限制见 `scripts/qa-agent-db-baseline/target-delta/D3-TRANSACTION.md`；每条真实动作、权限差额和字段来源见 `D3-ACTUAL-ACTION-DELTA.md`。

## 独立 service seam 已提前交付

接口初始固定 `0909a39a`，`LocalFixture.start/build_before/check/install_local/call_sql/seed/close`，无 DSN/真实目标输入。一个实例只创建/清理一个自有 nonce 容器；启动中途失败也由原 owner 清理。接口说明在 `LOCAL-FIXTURE.md`。

before 重建使用已知旧函数/约束，并恢复 D0 捕获的既有 application ACL。发现并纠正了“fresh 7f 撤销旧 start_text/start_chat 权限”与目标不一致的问题，避免把 42501 当作业务保护。6 个 seam 场景及 startup failure cleanup 均 PASS：旧普通调用正向仍可被 global worker 处理、新 QA 被排除、直接 QA bypass 由业务 P0001 拒绝、失效 session 取消、unknown budget 保留、event helper 出现 P0201 拒绝。不是实际 target replica 或完整旧 Web 验收。

## 最终事务验证

`d3-run-ca177ce267ed4fcda187cf4bb167b89c.json`：8 个命名组 PASS / cleanup PASS。

1. 实际本机 DDL 路径通过 before/after，ROLLBACK 后原目录/字节恢复。
2. 结构漂移、缺失 routine、role flag 改变、继承到 service_role、必要 EXECUTE 撤销均在增量前拒绝。
3. 错角色、过期执行区间、错 writer/target 或缺外部 scope 字段拒绝。
4. 第二本机协作 writer 被实际 advisory lock 拒绝；不冒作真实部署已排空。
5. after 不匹配使整个事务回滚，旧记录保留。
6. 显式 synthetic apply 实际 COMMIT，回执及 exact after 匹配。
7. 主动丢弃已收到的本机 COMMIT 回执后，只读得到 AFTER 仍保持 UNKNOWN，不自动 retry/inverse；错 run ID/operation 也不能冒认成功。
8. 显式 safe STOP 实际提交，保留新增会话与旧字节；普通 inspect 显示结构差异，不假装已回到 before。

真实网络中断没有模拟；“丢回执”仅是 bounded local outcome model。没有重跑原 8/38 功能矩阵。`d3-request-record-proof.json` 单独证明重复请求文件无法覆盖，且最终 CLI 变更未改已测事务函数。

历史失败保留：`c27409...` 首轮因本机已删除列槽使新列序号不同而 after 失败、cleanup PASS。新增同目标只读列槽查询后，将该事实纳入前后断言；不删断言。`710954...` 为 7 组、`fca5f4...` 为早期 8 组，均不能与最终 8 组相加。

## 事件与取消的定向澄清

普通 admission 的初始事件是 `public.chat_turn_events`，不是 standalone guard 检查的私有 assistant 三表/两 helper。`d3-event-cancel-proof.json` 两项本机定向验证 PASS / cleanup PASS：

- 正常 admission 实际生成 1 条初始事件；普通 cancel 和重试只产生 1 条 terminal cancelled receipt，pending 预算原样保留。取消 ACK 不代表费用为零或账本已结算。
- 显式删除该合成初始事件的负样本，原 cancel 以 23502 原子失败，Turn 保持 accepted、没有 cancelled receipt；read 仍为 pending/unknown。正常路径无需 DB body 修复；缺事件应保留技术失败，不伪造取消或补假 receipt。

## 当前真实边界

D3 只新增两次极小目标元数据读取：work 列槽与四角色 MEMBER/USAGE 矩阵。均 BEGIN READ ONLY / ROLLBACK，无应用行、正文、金额、密钥、旧材料或业务 RPC。SQL/结果已保存。

目标 DDL/GRANT/COMMIT、实际 worker/心跳、provider、费用、真实 canary、iOS UI 均未执行。实际 writer/无冲突安排与精确 target action lease 仍未下达；这些是具体接入步骤的 NO_GO，不是源码或普通只读的等待项。没有依据给小时级上线区间。独立 source/API 消费可并行；首个普通用户节点须在真实 apply 后通过真实 Auth/provider/UI 链路。
