# D2：已知旧源兼容与普通角色 QA admission

状态：源码兼容首批与本机 admission 验证完成；targetReady=false。原 7f、D0、D1 已有文件保持不变，本轮只新增 target-delta 源码及自有证据，没有真实目标读取/写入、凭据/权限/费用/worker 激活。

## 已解除的源码缺口

四个不同 body 均已精确匹配 D0 SHA-256：

- cancel_chat_turn：20260909033302 原函数，经 20260909223841 首个 BEGIN 注入原 mobile guard。旧 body MD5 也等于该已接受迁移的固定前置值。
- start_chat_turn：20260911200339 原函数，经 20260917064821 同样重注入 mobile guard。
- read_text_turn、require_text_task：20260912190000 原定义直接匹配。

D1 的“未匹配同名原始 body”记录保留为当时事实，D2 补上明确变换来源，没有读取目标正文。`d2-compatibility.json` 给出固定 7f 来源/hash。cancel/start/read 三项保持目标旧 body，不为匹配 fixture 替换；require_text_task 仅提出已接受 QA 扩展，保留旧检查和 owner/ACL，防止直接 start_text_turn 绕过 QA Task 关联。

四项约束的源语义与 D0 SHA-256 精确匹配：context_mode、expected_result、relationship、grounded intent。仅前两类需要 QA 扩展中的 context_mode 和 relationship：旧集合原样保留，新增 QA 值；expected_result（含 reviewed_answer）与 grounded resolver 约束不改。grounded resolver 自身未采集、不执行 stub。具体 old/new hash 与顺序见 `d2-impact.json`。

## 最小源码授权与变更

18 个新 QA 函数沿用 D1 定义/顺序：7 个仅 authenticated EXECUTE，6 个仅 service_role EXECUTE，5 个仅 owner 内部使用；anon/PUBLIC 全部拒绝。既有函数、表、schema 权限不扩大，native_session_v2 原 service grant 保留。此权限方案只写 SQL 提案并在自有本机验证，没有目标 GRANT。

`d2-admission-proposal.sql` 是本机实际验证的源码子集：18 项定义 → 两个约束集合扩展 → require_text_task 的精确 QA 增量 → 新 qa_link_mode trigger → 新函数最小 GRANT。现有 trigger 保留；D0 额外结构、Auth、身份、已有列/owner/RLS 不改。提案以无条件异常阻断并以 ROLLBACK 结束，不能直接作为 target patch。完整 target pre/post 还缺附加依赖 pins；不可移除异常自行执行。

没有新增 capacity/assistant 空 anchor，没有复制 platform/baseline 到目标，没有更换 queue/数据权威/SDK，没有 API adapter diff。服务仍消费原端口；实际最短路径首先是补原共享 worker 隔离证据，而非改服务端接口。

## 本机结果

最终 `d2-run-5b9f5d3ccdb44cc692993ca48e168bf1.json`：5 组 PASS，cleanup PASS；源码哈希已与执行文件核对。

1. 代表性库四个旧函数 body 与 D0 相同，三项实际安装的约束 hash 与 D0 相同；第四项 grounded 约束只验证源字符串 hash，不虚构 resolver。
2. 完整本机 admission 子集（含新 GRANT）事务回滚后，目录和既有合成记录原样保留。
3. 7/6/5 权限矩阵正确；anon/PUBLIC 无新执行权，原 ACL/无关捕获对象不变。
4. 普通 Native create → submit → byte-exact replay → read/reopen；缺 consent、改请求字节、跨 Actor、同 Actor 改为另一已同意 policy、直接调用旧 start_text_turn 绕过 Task 关联均拒绝。使用真实原始 SQL 端口，不预置回答。
5. 扩展与 safe STOP 保留旧 archived thread、hidden content、revoked consent、未知请求字节、旧 Task 父链、pending 预算、身份/session/epoch；保留本次新增请求/Task，worker 持续 disabled。

首轮 `a1db156086d743d7bce89594569a5e1d` 同为 5 组 PASS / cleanup PASS，但未含后来补入的旧记录和第二 policy 场景；最终 proof 只取最后运行，不相加为 10 组。D1 的 6 组与原 38 项也不计入本轮数量。

这不是目标复刻。旧 bound_task_history trigger 的实际函数、其他捕获外依赖、真实角色/schema、global worker、删除真实历史、网络 COMMIT 未知、模型回答和设备仍未验明。未调用 claim/dispatch/provider，不把 admission 成功报为完整 Native 服务闭环。

## 最短剩余依赖

原 QA migration 明确改动 public.claim_turn_work / turn_private.lock_text_work 以排除 QA context；它们不在 D0，不能假定共享旧 worker 已隔离。D0 又只给了 bound_task_history trigger hash，没有它及 task_history 的函数身份。取消 helper 缺失的无效 session 分支仍 Gate/UNRUN，不能用空 anchor 或直接删 observer 调用来“修复”。

具体新增只读范围、字段、必要性、保密及现有许可边界见 `D2-MINIMAL-READ-REQUEST.md` 与 `d2-requested-catalog.sql`：仅 4 个固定签名函数的 hash/权限元数据、2 表 trigger 绑定、4 schema 和 4 角色的必要属性/有效权限布尔，不含用户材料或源码正文。尚未执行，交 Main 核定新增范围；当前可独立推进的源码追溯、最小权限及 admission 保全验证已完成。

后续若获准 metadata 读取，先做 hash→已有源码匹配，再决定最小 shared-worker 隔离 patch；若仍未知，只追加具体缺失证据。实际 apply、activation、canary、费用和写 lease 均另列新增范围，不把旧 A–D/E 或重写方向当作已满足条件。未来 COMMIT 未知仍保持 STOP、原字节与权威回执核对，不重试、不伪 rollback；本机安全停止只撤销新入口权限，保留 postchange 记录。
