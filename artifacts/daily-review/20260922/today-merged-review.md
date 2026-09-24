# 2026-09-22 已合并改动只读复审

范围：`/Users/jtcao/Documents/VP-V4-Daily-Review-20260922`。固定终点 `b15635ad76a62590f7b3cc323f5bf46a45400100`，上海时区当日第一父链起点 `ce46abd3f614372bf2333bad40a0820fd49ab723`。按 `today-merged.json` 的 18 项分别比较 `git diff <merge>^ <merge>`，并在固定终点核对模块组合后的行为。

本记录是源码与现有证据审查；没有执行测试、构建、fetch、供应商请求、数据库写入或源码修复。测试文件的断言审查不是测试运行结果。图片/二进制仅核对所属范围与证据描述，未重做截图视觉验收。后续修复和实际 CI 由主执行任务汇总。

依据：根 `AGENTS.md`、`CONTEXT.md`、`docs/agents/development-workflow.md`、`docs/agents/issue-execution-contract.md`、`issue-plan.json` 对应 VPJ 行和各模块 contract。使用 code-review 的 Standards / Spec 两轴；已有文档明确允许的有界准备片段，不因整票仍有 UNRUN 自动判为代码缺陷。

## Standards

本次没有确认需要修复的硬性工程规则违反。已重点核对：身份/会话及 RLS 不变量；已应用迁移 append-only；Trip 原子确认；不将内部发布当公众发布；回执和未知费用；配置授权来源；秘密不进入客户端/通用日志；隔离测试与生产验收的区分。

未把自动工具可检查的格式问题列为人工发现，也未将样式偏好或所有重复脚本辅助函数列为阻断项。

## Spec

### F1 — P2：英文证件缺口标签容易被理解成预订编号

- PR #493；`lib/grounded/copy.ts:79`。
- `original_valid_booking_id` 显示为 `Booking ID`，但同一声明的 predicate 是 `requires_document`，中文标签为“购票证件”，RAIL-02 限定成人外籍护照/购票所用有效证件原件。英文旅客通常会把 Booking ID 理解成确认号，无法正确识别缺少的是证件要求依据。
- 修改为 `Original identity document used for booking`，保持中英文语义一致；不改历史已审核声明和 assertion ID。
- 对应 VPJ-16：“partial 保留可靠部分并指明具体缺口与可用下一步”。主任务已接收此修复。

### F2 — P2：原生 AI-assist 整体等待期限没有约束正在进行的请求

- PR #479；`ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift:126–131`，关联 `ios/VisePanda/VisePanda/App/NativeSession.swift:215`。
- 新增的 90 秒 deadline 仅在 poll 开始前检查；每次 `askRequest` 仍使用固定 90 秒 request timeout。如果前面的 pending 请求已消耗 60 秒，下一请求仍可等待 75–90 秒，用户总等待可达 135–150 秒，随后还会接受期限之后返回的结果。Web 的同一修复已经按剩余 deadline 限制本次 fetch。
- 将剩余等待预算传给原生请求，或给整次 run 施加可取消的截止时间；期限耗尽后不得继续等待/接受晚到结果。验证应使用可控延迟/时钟 fixture，覆盖先 pending 后慢请求及晚到响应，不需要真实模型调用。
- 这不破坏 Trip 写入或产生额外授权，但使此次超时修复新增的总预算没有实际约束。已通知主任务。

## 逐 PR 覆盖与结论

| PR | 已审范围 | 风险结论 / 保留边界 |
| --- | --- | --- |
| #479 `2ef09508` | Web/native AI-assist deadline、请求 scope、NativeSession、SavedAnswers；Staging actor/加密备份/恢复探针/迁移/政策/reader window/Wiki生成/提案/源撤回/rail candidate/worker 脚本及历史证据 | F2。脚本含固定历史主机、账号/源 ID 和状态门，作为历史专用执行记录保留，不能当作当前通用授权或直接重跑。旧 Staging 成果不等于今天新环境通过。 |
| #480 `d2d14061` | S1 intake、customer discovery pilot、Staging readiness、VPJ-46 verification/unrun | 无新增运行代码；真实访谈、交付、周复盘仍 UNRUN，没有将计划当实际客户成果。 |
| #481 `5f95d160` | Web lookup/API/AMap proxy与展示配置、PlaceWorkspace/AMapCanvas；native store/detail/geocode/selection/AMap、NativeSession与工程配置；SDK安装/安全env工具；lookup和原生竞态测试 | 未确认新增阻断缺陷。供应商观测、GCJ02、显式地图同意、不可用地址降级、输入/账号/屏幕变化失效路径保留。真实地图、Key/域名约束、真机多账户与完整 #363 验收仍未由源码/编译证明。 |
| #482 `72095f93` | v2冻结开发catalog、presentation、两价格arm StoreKit生成、生成一致性入口、Apple本地StoreKit探针与contract | 无新增缺陷。数值是开发试验政策；未启用销售、交易grant或ServiceTask扣次。真实Sandbox、地区价、媒体经济性仍 UNRUN。 |
| #483 `f80af226` | 上海机场候选statement/source/matrix、离线prepareCandidate和contract | 无新增缺陷。随机candidate/operation身份写入新文件、禁止覆盖以保留重试身份；不提交、不审核、不发布。matrix没有把候选补充算入supportedCells。 |
| #484 `55c6c446` | synthetic-vision输入/输出/usage/取消、固定语义cases、合成图渲染、显式campaign预算journal、provider mock测试 | 无新增阻断缺陷。候选不是资格；取消/未知费用保留hold，provider-side删除不被推导成功。真实OCR质量、ASR/TTS和用户媒体入口仍分开。 |
| #486 `7a058275` | archive闭合输入、adapter/RPC/native endpoint；SQL owner/mobile/锁/原子audit/写栅栏；NativeTripStore/View状态与测试；Xcode允许版本变动 | 无新增阻断缺陷。归档保留内容/未完服务；未知归档状态禁止编辑并保留只读；不是删除或自动结束。3草稿+1Active、偏好引导与实际导出等整票门仍 OPEN。 |
| #487 `458fbefc` | Quality PR/Nightly工作流及static-output错误诊断 | 无新增缺陷。完整git历史使artifact基线可用；文档PR也运行增量artifact guard。新错误信息没有把缺build输出变成skip。Nightly增加现有确定性门，不是生产验收。 |
| #488 `b4a99ec5` | AGENTS与共享治理去重、execution-contract默认条款、renderer及governance test diff | 无新增实质保护削弱。renderer仅在整段完全相等时用默认引用，偏离条款仍展开；任务行与原有权限/不可逆门保留。 |
| #489 `eabbbd95` | computeSequence/renderSequence、生成文档、manifest/index和单元测试 | 无新增阻断缺陷。hard blockers与acceptance dependencies分开，派生顺序不修改任务定义/身份/范围。生成日期与开放Issue是快照，不能作为永远有效当前队列。 |
| #493 `e7b6f35e` | SavedAnswers具体claim gap、read-model严格字段、双语copy、parser/render contract diff | F1。缺口只来自已验证服务器义务；可靠事实和来源保留；不是增加模型推断。 |
| #495 `2dcd25ce` | frozen-review计划/implementation hash/slots/三次重复/权限基准、质量阈值比较、CLI和negative tests、报告语义 | 无新增阻断缺陷。goal/evidence禁止质量容差抵消；单例失败拒绝；无 adopt 分支；human calibration及real provider pairing仍 UNRUN。 |
| #496 `9782e0c1` | Trip deletion native HTTP/worker、SQL queued与completed回执/reauth/写栅栏/lineage删除/锁超时/重放、专用PostgreSQL CI和HTTP/SQL测试 | 无新增阻断缺陷。scope=trip-core-v1，拒绝含chat/Turn引用Trip；completed与删除在同事务；tombstone阻止原ID复活。全数据、备份/供应商、离线cache清理不冒称已完成。 |
| #498 `b15635ad` | official URL参数/输入/日期/过期/打开回执、双语酒店表单和离开前披露、Tools接线、工程配置、native unit/UI测试 | 无新增阻断缺陷。Trip.com不发送参数，儿童Booking不伪造人数年龄，打开不等于预订/归因。现有unrun.md仍记录修正后的构建/7 tests等待窗口；以本轮准确SHA CI补充，不抹去旧UNRUN。真机/安装provider App字段留存仍须独立验证。 |
| #499 `a8fa82ad` | Qwen exact endpoint选定/校验、transport、Web/native provider config、worker/service/Wiki依赖传递、端点probe与negative tests | 无新增阻断缺陷。用户请求不能自行授权工作区；选定workspace后拒绝legacy/另一workspace，不静默fallback。历史专用脚本保留旧绑定属于文档已声明边界；新用户policy/consent与持久worker仍未凭C0探针验收。 |
| #500 `20d706d7` | H04 recorded RPC parser、owner/task/usage联结、完整Trip before/after比较、闭合输入及negative controls | 无新增阻断缺陷。recordingConsistency PASS不等于来源认证/真实当前许可/消费者/完整验收，所有相关标志明确保留不足。 |
| #501 `fa4b7f56` | OpsLedger findings提取、BudgetSnapshot/locale、workspace、contract与浏览器fixture | 无新增缺陷。相同已验证snapshot派生诊断，不再读第二账本；task与attempt不同口径，实际账单/latency/semantic quality未知项不记0。 |
| #502 `a3a69189` | community闭合HTTP/action输入、会话/显式reviewer资格、SQL default-off/ACL/RLS/自审拒绝/版本竞态/幂等digest/撤回清空、专用CI和SQL/HTTP测试 | 无新增阻断缺陷。published仅内部批准，所有projection仍internal/non-public/non-retrievable；作者看不到reviewer/note。公开UGC、消费者UI及全域生命周期没有被宣称完成。 |

## 结果和交接

Standards：0 项确认缺陷。Spec：2 项 P2；分别是 F1 英文证件含义和 F2 原生总超时约束。无确认 P0/P1。其余结论为本次只读源码审查未发现可确认缺陷，不是“系统无风险”或“18项都已真实验收”。

主任务需继续：修复 F1/F2 并执行相应验证；复用/核验各 PR 精确提交的 CI；汇总真实的已实现、目标环境观察和剩余验收。此子任务没有合并、发布、发消息到GitHub、运行历史数据/供应商脚本或更改任何源码。
