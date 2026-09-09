# 基础偏好跨 Trip：现状与最小调整

研究日期：2026-09-10；代码固定 `d4eeb084b41f8c82a1794a0f946529bb54e2d5db`。只读研究，未改代码、合同、Issue或数据库，未运行真实模型与用户数据测试。Q36 的“明确基础偏好跨规划且 Free 可用”已接受；不推导自动画像许可。[品牌报告 Q36](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md#q36--免费用户的基础长期偏好能否跨规划使用)

## 已核实事实

1. **已有存储与控制，无需第二套记忆库。** `memory_profiles` 存 owner、consent、状态、约束类型、500字以内摘要与来源收据；RLS按owner隔离；删除把摘要置空。没有Trip范围、适用任务、显式revision或替代关系。SQL检索只取获准且explicit/confirmed的记录，按硬约束、更新时间排序。[schema:19–38、134–176](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/supabase/migrations/20260828193000_v4_13_memory_profile.sql#L19)
2. **管理入口已接数据库，纠正内容尚未形成完整接口。** 表单先申请consent再创建memory；API支持列表、创建、状态转换，transition只接收state，不能原子替换摘要。`listMemoryProfiles`读取管理列表及影响收据，并非模型专用检索。列表可含暂停或撤回项以便用户管理，不能整体注入模型。[表单:280–309](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/components/copilot/CopilotMemoryWorkspace.tsx#L280)、[adapter:313–339、442–493](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/identity/user-data-adapter.ts#L313)
3. **producer与consumer仍断开。** 对`lib/app/components`作调用检索，`assembleContext`仅见定义；`projectRetrievableMemory`仅被收据投影调用，收据投影自身未接运行调用。收据表存在但无客户端写入口；当前startChatTurn只调用接收digest的RPC。故“能存、能看收据类型”不证明回答用过偏好。[assembler:46](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/context/context-assembler.ts#L46)、[receipt:25–45](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/memory/receipts.ts#L25)、[turn:1027–1043](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/identity/user-data-adapter.ts#L1027)
4. **问答和恢复现政策排除memory。** `information_lookup`、`recovery`的allowedSources不含memory；只改提示词无法得到有关偏好。assembler检查actor、state和允许来源，不判断Trip适用性、撤回新鲜度或冲突语义；来源排列顺序不等于偏好优先级。[plan:77–82](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/context/context-plan.ts#L77)、[assembler:86–112](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/context/context-assembler.ts#L86)
5. **付费门槛目前是规划差异。** Master Plan:287将跨Trip增强放在Pass；检查memory路由、adapter、投影与相关SQL，未发现Pass/额度条件。不能描述成“移除已上线付费墙”。另Profile已有travelPace、币种、单位等，须避免与Memory重复保存相同事实。[权益:287](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md#L287)、[Profile:8–25](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/components/user/ProfileWorkspace.tsx#L8)
6. **已有测试保护资格与隔离，不证明长期收益。** memory契约覆盖暂停/撤回/删除排除、拒绝推断硬约束；consumer契约覆盖owner；context测试覆盖来源/预算。隐私contract仍明确`requested/not_started`，不能把删除请求视为完成所有派生清除。[memory测试:20](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/tests/contract/memory/memory-profile.test.ts#L20)、[privacy:11–17](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/privacy/contract.ts#L11)

## 工程建议：复用存储，补齐使用资格

**候选最小模型**沿用Memory，保留id/owner、summary、constraintKind、consent、state、sourceReceipt；按需补`key`（同类偏好消歧）、`scope`（trip/account）、`tripId`、单调`revision`，有期限才加`validUntil`。来源收据记录显式保存/纠正及范围，消费收据关联实际使用的revision。仅本次的数据留working context，不建永久行。Profile已有字段保留其唯一权威源，模型读取做受控投影；新建通用Preference表或画像向量库没有本轮证据支持。

**读前确定语义。** 同一偏好当前明确输入优先于当前Trip范围偏好，再优先于明确长期偏好；此顺序不允许改写已确认Trip事实，也不能压过权限与安全规则。历史健康硬约束与本次含糊要求冲突时澄清，不自行忽略。长期偏好只作默认值；“这次省钱”不推导永久预算或收入。

**read-for-task资格**由服务端检查身份、有效同意、明确状态、任务相关性、Trip/scope、最新revision、期限和本次禁用；仅将合格最小投影交给既有Context。对问答/恢复有条件开放相关偏好，不能改成无条件读取所有记忆。实际入选后再写use receipt；“检索到但预算丢弃”不能记作已使用。偏好只影响选取和解释，不能成为“餐厅安全/营业”之类外部事实依据；Knowledge仍需reviewed、许可与有效期。[fact资格](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/knowledge/fact/eligibility.ts#L1)

**显式保存与撤回。** 自然语言可提出保存候选，由用户确认内容与范围；敏感信息不自动画像，不把付费当同意。纠正采用版本比较与原子替代，防止两个设备静默互盖；撤回后停止未来发送，作废队列中的旧上下文和待提交建议，重试重新校验。已发送外部请求无法撤回的事实须诚实记录。派生摘要与缓存按来源版本失效；历史已确认Trip不能直接抹改，交由既有隐私删除合同处理。共享设备登出清理账号缓存、待显示响应及身份epoch，A的异步结果不能落到B页面。

## 验收与排期调整

- **#199：**把第三条从“Free当前Trip安全/纠错”补成“Free明确基础跨Trip偏好可保存、纠正、使用与撤回”；真实跨会话/两Trip回答体现偏好，且不强制每轮宣称记得。单独测Pass到期后同样可用。
- **#190：**明确偏好范围、保存同意、敏感信息、接收方、撤回生效点、队列/缓存/备份删除边界与共享设备行为；未定保留期限不自行造数值。
- **#195：**把实际读取→资格过滤→Context→回答→使用收据接成链；断点分别留证，不能用管理API或fixture代替。服务重启/重连后重新读取最新版本。
- **#206：**以偏好筛选已许可证据并给下一步；个人记忆与外部事实来源分开，不因“懂我”降低事实门槛。

建议将反例并入既有Harness记忆/恢复场景和模块测试：Free跨Trip慢节奏；本次高强度覆盖旧默认；仅本次禁用不删长期项；排队后撤回；两设备同时纠正；登出换账号仍有迟到响应；删除后摘要不复活；偏好中嵌入指令不得越权。无需为凑覆盖另扩12场景规模。真实验收依赖仍保留，可先做契约与合成测试准备。

## 外部证据与推断限度

[LongMemEval v2](https://arxiv.org/abs/2410.10813v2)（2025-03-04，核对2026-09-10）把长期记忆分解为提取、跨会话推理、时间推理、更新与不作答，并区分索引、检索、阅读。这支持上述断点测量与纠正反例的设计；论文基准不能证明VP收益，也不要求引入其整套记忆架构。

[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)与[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)（未标统一发布日期，核对2026-09-10）确认行策略与GRANT共同决定访问，owner/BYPASSRLS有例外。推断：VP应以普通用户JWT验证跨用户拒绝，不能以service-role成功作为权限验收。官方changelog.md本次抓取受内容类型限制；没有实施版本升级或据此作平台兼容性结论。
