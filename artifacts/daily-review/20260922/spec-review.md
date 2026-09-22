# 2026-09-22 独立 Spec 审阅

固定基线：`b15635ad76a62590f7b3cc323f5bf46a45400100`。逐 PR 对 `open-prs.json` 固定 head 执行三点 diff 与基线到 head commit log；审阅 PR body 的本次切片、head 内合同及 issue-plan 验收和对应本地 Issue body。只读源码；没有 fetch、测试、构建或修改源码。

## 结论

本轮未确认可行动的切片规格违背。此结论不替代 CI、真实运行或父 Issue 完整验收。未把明确保留的未实现后续消费者或 UNRUN 环境项报告为本次 bug。

| PR | 固定 head | 覆盖内容 |
| --- | --- | --- |
| #513 | fcf58613 | Ask 稳定输入/Done ID，软件键盘前置、单次点击、失败层级、中文标签及原语言/草稿断言保留。该改动本身不修复 AX Code -56。 |
| #512 | 35541a61 | SIM-01 三维状态、五种用户结果、请求本地声明、双 Trip 读取、30 秒证据租期、版本变化及双端清理、来源与条件保留。其余准备类别和真实获准证据验收明确保留。 |
| #511 | 46e63b96 | 唯一 Profile pace 权威、显式用途/范围、CAS、暂停/撤回/精确 Undo、旧写入失效、当次优先/跳过投影；没有把尚未接入 planner 的资格 API 声称为真实偏好使用。 |
| #510 | 2e3f035c | 六线程政策、执行切片、Issue 同步收据、manifest 差异。父任务原 acceptance/status/owner/blockedBy 等未改；tasks 仅增加 executionBrief，statusSemantics/parentSupersedes/oldIssueSuccessors 保留。 |
| #509 | 6f6d9cbf | 原输入 Ask 到本机相对日 sheet、单兴趣不造第二方向、文本改动失效、无日期/Trip 也可生成、选 Trip 保留草稿、返回确认及 grounded 数据清理与布局保留；沿用 Proposal 写入口。 |
| #497 | b906d001 | requested 不等于 accepted、逐案字段预览/员工/期限、owner/员工 RPC、revision 撤权、分页、Profile dataScope 重建。没有默认真人接单或发送。 |
| #494 | e74bc89d | 两 ID fresh detail、全程三模式、公交站与替代线路、轨道/出租片段拒绝、未来时间明确不可用、入口/票价未知、有效期与返回重查、双端准确地址更新。 |
| #490 | 1ba22d51 | 用户时间/用途/原因保存、未知结果同 ID 重试、终态不可复活、重复拒绝、当前状态资格计算、全程 delivery unavailable；APNs 明确不在此切片。 |
| #485 | 63c00a51 | 现有受治理 current-input Turn、显式 consent、原文/译文/AI 回译、大字卡、结构/数字检查、已存结果不重新生成、活跃视图同 ID 重试；未把 AI 回译说成独立语义核验。 |
| #478 | 353c09b9 | UILabel 本机文字度量、动态 palette、原有审计保留、新增全类别中英明暗最大字审计和真实导航；工具链白名单仍锁定两个准确已验证版本。 |

## 集成注意

#497 与 #478 新增同内容 `VPReadableText.swift`（blob f8beaf90），但 project.pbxproj 分配不同 file/build IDs。合并应保留一个源码引用和一个 target Sources 注册，避免重复编译。此项为跨 PR 集成注意，不是单 PR 独立规格缺陷。

#478 现有 AX 超时与 #513 键盘状态测试必须分别看最终集成 head 的实际 CI，不得用本轮静态审阅推断运行 PASS。


## 增量：#479 deadline 与 #493 证件文案修复

审阅对象：`codex/daily-review-20260922` 工作树三文件未提交 diff，`NativeAskStore.swift`、`NativeAskStateTests.swift`、`lib/grounded/copy.ts`。本独立复审只读，未启动测试。

- 文案：`original_valid_booking_id` 改为 `Original identity document used for booking`，与原中文身份证件概念一致，不再误指订单编号。
- 超时主路径：所有轮询和 pending sleep 共用一个 ContinuousClock deadline；task group 的 deadline 子任务抛 timedOut，并取消 URLSession 所在子任务；helper 拒收到期响应。token、actor scope 和 session scope 检查保留。NativeSession 在 refresh 取消时保留 Keychain/同账号待发送凭据而降为 retry；没有新跨账号输出路径。
- **P2 RESOLVED（修复前发现）：MainActor 恢复边界仍须复核 deadline。** `NativeAskStore.swift:134-143` 中 nonisolated helper 检查成功后，调用方需重新进入 MainActor，当前 await 后 guard 只查 token/scope。若主 actor 排队跨过 90 秒，仍能把数据写成 `.done`。在恢复 actor 后及最终成功状态写入前重新核验同一 deadline 与取消；到期走 error，避免 return 遗留 loading。已有 3 个 helper 测试没有覆盖这个调用方恢复边界。
- Structured task group 会等子任务退出，其 deadline 依赖底层取消协作。当前真实路径是可取消的 URLSession 与短同步解析，没有观察到必须另开非结构化任务的理由；不把该一般性限制单独列作缺陷。

### 增量复核结果：P2 已解决

已只读核对当前 Daily-Review 工作树：`runAiAssist` 在 await 恢复 MainActor 并通过 token/scope 检查后，以及最终 `.done` 赋值前，均调用 `Task.checkCancellation()` 并检查同一 `ContinuousClock` deadline；到期抛 `URLError(.timedOut)`，由现有 catch 写 `.error`。两处检查间没有新增 actor suspension；原发现的晚到成功边界已关闭。本次复核未启动测试，当前增量无遗留 Spec finding。
