# VP 输出内容与表达：工程研究证据

研究日期：2026-09-10。代码固定为 `d4eeb084`；品牌输入固定为 [8ae95a7 / Q1–Q38](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md)。本文是建议，不修改运行契约、Issue 验收或产品授权；未调用模型、真实用户数据或生产服务。

## 判断

**品牌应进入“回答什么、凭什么、下一步是什么”的生成和验证链路，再体现为自然英文；单独增加亲切 prompt 不足以交付品牌。** B03/B04 要求本地帮手与可执行下一步；B05/Q15/Q19 要求记忆影响建议且可纠正；B11/Q23/Q28/Q30 要求温暖直接、沉着、有分寸，幽默可为零；B13 要求英文原生表达。它们不授权扩大服务能力、自动确认或真人承诺。

## 已核实的 producer / consumer

| 环节 | 固定版本证据 | 实际能力与缺口 |
| --- | --- | --- |
| Prompt 版本 | [prompt/index.ts:3–32](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/model-gateway/prompt/index.ts#L3)；[registry/index.ts:20–32](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/model-gateway/registry/index.ts#L20) | 只创建版本/digest 元数据边界，漂移后保持 hold；没有品牌系统提示词、真实请求组装或自动上线。 |
| 输出信封 | [message-contract.ts:36–41、89–103、116–135](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/turn/message-contract.ts#L89) | `answer/clarification/unavailable`、8000 字符、封闭卡片与 pending Proposal；验证形状不等于验证自然语言事实。对 `lib/app/components` 调用检索只找到该函数定义，不能当作已接入真实 producer。 |
| 未来业务结果 | [INTERFACES.md:3–9、17–26](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/program/2026-09-05/INTERFACES.md#L3) | 已要求 `answered/partial/clarification/blocked/technical_failure`，但文档明确这些责任不是已实现 schema。不能在旧信封偷偷增加 outcome 字段。 |
| 证据到卡片 | [grounded-execution.ts:28–80](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/knowledge/claim/grounded-execution.ts#L28) → [GroundedExecutionCard.ts:6–26](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/components/chat/cards/GroundedExecutionCard.ts#L6) | 纯函数校验资格、时间与 typed claim，renderer 显示 value/qualifiers；当前任一 row 不支持即整卡 unavailable。没有证明任意正文语义均被 receipt 支持，更不等于 live 知识链路。 |
| Web / iOS 展示 | [ChatThreadWorkspace.tsx:218–227](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/components/chat/ChatThreadWorkspace.tsx#L218)；[AskView.swift:79–105](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/ios/VisePanda/VisePanda/Features/Ask/AskView.swift#L79) | Web composer 禁用，状态 Turn 可取消；iOS 发送为空动作且禁用。修改这些预览文案不能证明用户已收到品牌化 AI 回答。 |
| 现有评测 | [pairing/index.ts:69–94、167](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/evals/harness/pairing/index.ts#L69)；[OFFLINE-SEEDS.md:7、34](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/harness/OFFLINE-SEEDS.md#L7) | H01 固定 oracle 可拦截地址错写及全拒答；仅英语合成种子接通，语义有用性、中文、live 与人工校准未完成。 |

## 最小工程调整建议

1. **在 #195 的真实生成入口定义同一套英文表达策略。** 直接复用获准 Context/Memory、EvidencePack、业务结果与能力状态；组装“本轮目标、可答内容、缺口、可执行动作”的有界输入。这是原 producer 的内容选择职责，不新增 ContentPlan 服务、第二模型调用或人格 agent。品牌策略随已有 prompt version/digest 发版；中文做本地化表达，日期、金额、地名、否定和对象状态等事实投影共用。
2. **事实、行动状态和确认由服务端负责。** #206 决定哪些 claim 有资格、是否被支持、哪些缺口可给 partial；关键金额/时刻/地址/动作标签采用已验证 typed value 绑定，不能由润色模型改写。自由文本仍需限制生成范围与语义评测，schema 或 LLM judge 都不构成事实证明。安全资格不通过的内容不展示；普通已支持内容不能被一句总拒答吞掉。若未来确需二次生成，必须再次校验，不能把“已验证”沿用到新正文。
3. **客户端显示短结论、必要限定和下一步。** 状态文字从真实 task/Proposal/ServiceCase 回执映射；正文不控制按钮权限、确认或取消结果。主结果与会改变决定的限定保持首屏可见，细节/来源可展开；无可靠阶段事件时不假称“正在联系酒店”。取消生成、撤回 Proposal、撤销已提交 Trip、取消外部订单分别表达。新旧 outcome 与客户端兼容由所属纵切版本化处理。

这些是工程推论：Apple 要求人保持控制、事实生成有已核实信息、加载反馈描述实际阶段；[Apple Generative AI HIG](https://developer.apple.com/design/human-interface-guidelines/generative-ai)（页面更新 2026-06-08，读取 2026-09-10）。HAX 10 支持目标不明时消歧或缩小服务范围，**并未要求每轮问卷**；[HAX 10](https://www.microsoft.com/en-us/haxtoolkit/guideline/scope-services-when-in-doubt/)（读取 2026-09-10）。HAX 11 提醒解释可能增加过度信任，故只解释可核实的“你这次说了什么／哪个已授权偏好影响建议”，不编造思考过程；[HAX 11](https://www.microsoft.com/en-us/haxtoolkit/guideline/make-clear-why-the-system-did-what-it-did/)（读取 2026-09-10）。这些设计证据不证明某款模型已能满足 VP 要求。

## 输出内容与语气规则（候选）

- **先帮用户前进：** 先回答核心问题或给一个推荐，再说明必要原因、限制与下一步。不固定“共情开场＋五点列表＋反问”。普通问题可完整回答，缺日期但不影响的低风险草案可标假设后继续；城市/对象歧义会改变可执行信息时先问最关键一点。
- **语气随处境：** 行前自然、轻松，可有一句体贴机智；在途疲劳或晚点短而沉着；费用、失败、取消、医疗安全和真人等待不加玩笑、不劝人“别担心”。温暖通过保留晚餐、减少重复输入和给清楚选择体现。禁止自称真人在当地、虚构亲历、“我永远陪你”等依赖表达。身份透明不等于每轮重复“作为 AI”。
- **信息密度适应任务：** 简单答案通常 2–5 句可作初始试验；复杂规划给可扫描时间线和关键取舍；现场操作一次突出下一步。长度为质量观察量，不作为截掉必要限定的硬上限。只在会改变方案时问问题，已回答/已授权记忆不重复索取；用户当前明确要求优先旧偏好。Q15 并未承诺固定选项数。

下面全部为**虚构状态下的表达演示**，不是现有能力、真实地点事实或可执行入口；投入产品前每个状态需有真实 receipt。英文为原作，中文保持相同事实与范围。

| 场景与已知条件 | English | 中文 |
| --- | --- | --- |
| 正常规划：用户要轻松下午，只有草案，尚未写 Trip | “I'd keep this afternoon to one main stop and leave room for a break. Here's a draft that keeps your dinner in place. Review the changes before adding them to your trip.” | “下午建议只安排一个主要地点，中间留时间休息。这版草案保留了你的晚餐，查看改动后再决定是否加入行程。” |
| 缺信息：存在两个同名地点，无法确定城市 | “Which city is this museum in? I need that to check the right place.” | “这家博物馆在哪个城市？确认城市后才能核对正确地点。” |
| 记忆冲突：获准旧偏好为少走路，本轮明确要徒步 | “You previously preferred shorter walks, but today you've asked for a hike. I'll follow today's choice and keep the walking effort clear.” | “你之前偏好少走路，这次明确想徒步。我会按这次的选择规划，并写清步行强度。” |
| 证据不足：地址已验证，今天开放时间缺有效证据 | “The verified address is shown below. I couldn't confirm today's opening hours. Check the museum's official information before setting off.” | “下方是已核实的地址。我还无法确认今天的开放时间，出发前请核对博物馆官方信息。” |
| 已提交后取消：提交回执先于取消；尚无撤销 | “The trip change was saved before your stop request arrived. It hasn't been undone. Review the current trip before deciding what to change next.” | “停止请求到达前，行程改动已经保存，目前还没有撤销。先查看当前行程，再决定下一步改哪里。” |
| 真人未接单：只有 queued 回执，没有 ETA | “Your request is in the queue; no one has accepted it yet. I don't have a confirmed response time. If it can't wait, contact the service provider directly.” | “请求正在排队，暂时还没有人接单，也没有确认的响应时间。如果等不及，请直接联系服务方。” |
| 在途恢复：用户报告累了，系统只有局部候选 | “Let's make the rest of the day lighter. This option removes the optional stop and keeps dinner. It's a proposed change—your trip stays as it is until you confirm.” | “接下来安排轻松一些。这版方案去掉可选地点、保留晚餐，目前只是修改建议，确认前行程保持原样。” |
| 低风险实用回答：用户问打包习惯，无 live 信息需求 | “Keep one day's essentials in your carry-on: medication you use, a change of clothes, and your charger. Future you will appreciate the spare socks.” | “随身包里放一天够用的必需品：常用药、换洗衣物和充电器。多一双袜子，往往会让之后的自己很感激。” |

最后一例仅演示轻微幽默，不应据此在每轮加俏皮结尾；用户不需要幽默时，前一句已足够。

## 质量评测与校准

沿 #267 的配对入口增加**候选** rubric，每项 0/1/2（不满足/部分/充分），分别记录：任务解决程度、事实与限定准确性、下一步清晰度、记忆适用性、信息密度、英文自然度与情境语气。人工评审要能指出具体句子，不能用“像品牌”作唯一尺度。工程硬检查负责 schema、引用关联、金额/时刻/否定投影、状态/权限与提交回执一致；LLM judge 仅协助语义、语气筛查，先与中英人工双评对齐，并记录分歧。使用相同输入/证据/时钟/权限/版本做配对，多次运行查看稳定性；不凭单次最好答案选择模型。

**Hard fail 独立于平均分：** 捏造证据/亲历/记忆；把未知写成确定；把 queued 写成已接单；把停止生成写成订单退款；无确认宣称已改 Trip；删掉实质限定；泄露原始个人上下文；遇真实急迫情况却调侃。另设“正常可答”反例：完整证据下全拒答、可答地址被缺失营业时间连带吞掉、无必要的一串追问均判任务失败，不能靠安全拒绝率获得高分。

这套分工参考 Anthropic 对 code/model/human graders、真实终态、任务完成与交互质量分开评估的实践；[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)（发布 2026-01-09，读取 2026-09-10）。具体分值、容差和预算仍由负责人在候选运行前冻结；本文不设未经校准的上线阈值。开发样例与人工校准集分开；本研究读取时可见现有 `cases.ts` 的公开 holdout 文字，未据此调参，未来调优须登记暴露/污染并使用未参与调优的新盲测，不能宣称现有案例独立保密。

## 既有 Issue 的验收增量候选

| Issue（以固定执行合同映射为准） | 建议纳入的可验证结果 |
| --- | --- |
| #195 / VPJ-07，合同 116 行起 | 在真实 producer 版本化 outcome 与品牌 prompt；五类中英结果接入实际 iOS consumer；同一文本不能给出与业务 receipt 冲突的成功/取消状态。 |
| #203 / VPJ-13，合同 227 行起 | 三入口先提供可用首值，必要才追问，支持跳过；回访只提确实可用的上次决定与记忆。 |
| #206 / VPJ-16，合同 280 行起 | required/background/coverage/conflicts 同时约束正文与卡片；partial 保留已支持答案、暴露具体缺口；正文润色不得新增事实。 |
| #220 / VPJ-29，合同 512 行附近 | 用户报告变化后以沉着短文给 1–2 个局部候选、保留约束并展示 diff；未确认不称解决，外部取消结果未知时明确 unknown。 |
| #224 / VPJ-32，合同 565 行起 | queued/accepted/assigned/waiting_external/resolved/unresolved 语义一致；未接单无 ETA/SLA；“有人接手”和“问题解决”分别验收。 |
| #267 / VPJ-70，合同 1250 行起 | 配对增加有用性/自然度/密度/记忆解释 rubric 与正常可答反例；hard fail 不被均分抵消，保留人工校准和预冻结门。 |
| #268 / VPJ-71，合同 1270 行起 | 同一已选配置的两条真实中英任务回归，连同状态文案、事实/确认保护和失败恢复验收；表达变好不代替原12场景与网络/停用证据。 |

合同证据：[EXECUTION-CONTRACT.md](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/program/2026-09-05/EXECUTION-CONTRACT.md)。补充 #199 负责记忆 receipt，#196 负责恢复事件；#218（VPJ-28）才是地点讲解，不应与 #220 混淆。这些是细化现有结果的候选，不增删依赖、不提前关闭票，也不把表达系统升级成独立大框架。
