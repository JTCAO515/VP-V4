# VisePanda 品牌方向与工程交付调整研究

VisePanda 的核心工程目标应明确为：在获准使用的个人偏好和可信信息基础上，帮助普通来华自由行游客完成一个具体目标，并在下一次使用或情况变化时接着帮助。实现重点是跨规划偏好、完整服务任务、可执行下一步，以及与事实和动作状态一致的表达。原生 iOS、轻量 Web、单一 Trip、受控工具和确认后原子修改的架构可以保留。[^1][^2]

最需要先改的是三处语义：**基础长期偏好属于免费体验；必要澄清属于原服务任务；温暖和确定性必须体现在真实结果中。** 提示词、界面与账本应共用这些语义。现有模块已经提供部分基础，优先补消费接线、版本与验收，避免另建记忆库、人格服务、消费账或 Agent 框架。

## 1. 结论与证据范围

| 优先级 | 调整 | 直接收益 | 完成证据 |
| --- | --- | --- | --- |
| P0 语义 | 固定 ServiceTask、Turn、attempt、成果与消费的区别 | 澄清与修复不重复消耗，成本仍有界 | 同一任务跨多轮、重连、重试和结算无重复 |
| P0 权益与记忆 | Free 可使用明确基础跨 Trip 偏好，按任务检索 | 免费体验能证明“懂我” | 两个 Trip 使用正确偏好，纠正与撤回立即影响后续使用 |
| P0 输出 | 版本化内容与语气规范，事实和动作由真实回执约束 | 用户看懂结论、限制与下一步 | 正常可答、部分答案、冲突和失败场景的中英输出通过 |
| P1 连续体验 | 把规划、已保存信息、在途变化和局部恢复串起来 | 记忆转化成具体帮助 | 保留已确认晚餐，提出有依据的少走路方案并正确确认重载 |
| P1 度量 | 以任务成果、正确偏好使用、必要澄清和真实成本衡量 | 能区分有用、可靠与只是好听 | 最终状态、交互质量和成本分别有证据 |
| 保持未决 | 额度数值、partial 计费、激活制、eSIM、人工 SLA | 防止候选变成错误承诺 | 单独决策后才进入对应实现与商品条款 |

品牌输入固定为 `8ae95a78cdc02a99c3b3b006f4b3fe44a76ac00c` 的 Q1–Q38 报告；代码基线固定为 `d4eeb084b41f8c82a1794a0f946529bb54e2d5db`。前者是独立提交中的产品输入，不能假定其文件已在该 main 基线中。相关 45 个 Issue 的状态和原生依赖另有带时间的 [快照](brand-engineering-2026-09-10/issue-snapshot.json)。快照是排期证据，不替代后续 live 核查。

基线包含协议适配、离线 Harness 配对、原生基础和 Staging 的增量成果；共享记录显示 Staging 已升级至 25 条迁移并通过普通 HTTP JWT 隔离矩阵，direct/worker 路径仍单独待验。相关运行父票保持开放。上述状态来自已提交证据及 GitHub 记录，不表示本报告独立重跑了数据库、真实模型或设备验收。[^3]

## 2. 品牌决定与既有工程的具体差异

| 已确认输入 | 既有规划或代码 | 调整方式 |
| --- | --- | --- |
| Q36：Free 基础偏好跨规划使用 | Master Plan 将明确跨 Trip 偏好增强放在 Pass；相关 memory API 未发现运行中的付费 gate | 修改权益定义和验收；不能宣称“移除已上线付费墙” |
| Q37：完整服务任务包含必要澄清、系统修复 | Ask 仍按一次用户请求定义；UsageLedger 虽提 task 幂等，但真实跨多 Turn 归属未建成 | 明确任务边界、成果、状态及账本；旧 6/30/300 等数字不直接换名沿用 |
| Q14/Q18/Q19：懂需求并给适合的下一步 | ContextPlan 的 information_lookup 与 recovery 排除 memory；Today 主要输出 review_fact | 有条件开放任务相关偏好；把行动建议、核实入口和修改提案接到真实消费者 |
| Q28/Q30/Q32：产品直接、耐心、沉着、英语优先 | prompt 目录主要是版本/digest 元数据；旧输出信封和新 outcome 文档尚未贯通 | 将表达策略接入真实生成链，版本化 schema 和双端展示，不只修改预览文案 |
| Q13/Q26：真人重点处理旅途执行问题 | 已规划 CaseRequest、TravelerBrief、ServiceCase | 复用原职责，区分申请、接单、处理中和外部结果；普通行前规划不默认分流真人 |
| Q31：成熟清爽，熊猫适度出现 | 已有正式品牌资产、设计 token 和原生/网页实现 | 保留资产，优先信息层级与可访问性；无需再次重画 Logo |
| Q38：购买/激活分离仅为候选 | 现行规划按购买交易形成限期权益 | 保留现行机制；不引入到达自动激活、持续定位或增值供应商 |

这些差异的证据和行号分别见 [任务计量](brand-engineering-2026-09-10/service-task-evidence.md)、[偏好与记忆](brand-engineering-2026-09-10/memory-evidence.md)、[输出内容与语气](brand-engineering-2026-09-10/response-evidence.md)。它们要求精确修改已有责任任务，而非重建 Program。

## 3. 架构取舍：保留现有模块，补三个接缝

继续使用现有模块化单体。用户输入进入已验证身份与 TurnCoordinator，按当前目标读取获准上下文和证据，模型输出候选，服务端验证，再交给原生与 Web 消费。需要修改 Trip 时仍走不可变 Proposal、可见 diff、准确版本确认与原子 Patch。

```text
用户的一个明确目标（ServiceTask 业务归属）
  ├─ 一轮或多轮 Turn → 一个或多个 provider/tool attempt
  ├─ 当前输入 + 当前 Trip + 相关且获准的基础偏好
  ├─ 合格证据 + 范围内候选 → 事实、约束与动作校验
  ├─ 可读取的回答 / 部分成果 / 澄清 / 提案 / 实际提交回执
  └─ 用户服务容量记录；内部每个 attempt 成本另行计量
```

新增 ServiceTask 是业务归属，不是第二个 worker、队列或聊天引擎。输出策略是生成入口的职责，不是独立人格微服务。基础偏好沿用已有 Profile/Memory 权威源，通过受控投影供任务使用，不新建同义 Preference 数据库。

这一取舍符合以可测收益决定复杂度的原则。Anthropic 的架构资料将固定工作流与自主 Agent 区分，并建议从简单可组合方式开始；其 2024 年文章已提示工具生态发生变化，因此这里只采用设计取舍，不据此指定当前 SDK 或供应商。[^4]

## 4. 完整服务任务与两类计量

### 4.1 首先定义“完成了什么”

建议 ServiceTask 至少具有 owner、可选 Trip、目标与范围版本、约定成果类型、关联 Turn、状态和成果引用。技术 attempt 继续有独立身份与实际用量。LLM 可以提出意图分类，服务端负责检验归属、身份、范围和消费策略；不能仅凭语言相似度或模型一句“这是新任务”收费。

| 约定成果 | 可接受的完成事实 | 不能混淆 |
| --- | --- | --- |
| 回答一个旅行问题 | 合格回答与必要限定持久化且可读取 | 流结束不等于回答正确 |
| 提供局部调整方案 | 有依据、可审阅的具体 Proposal 已交付 | proposal_ready 不等于 Trip 已修改 |
| 应用已确认改动 | 精确确认与原子应用回执成立，重载一致 | 模型说“已保存”不是提交证明 |
| 准备供应商联系内容 | 用户可用的文字或允许的官方入口 | 准备联系不等于已经联系或成交 |
| 请求真人协助 | CaseRequest 被可靠记录 | 请求受理、真人接单、问题解决各自有状态 |

任务接纳不必让每条低风险问题都经历额外确认弹窗。直接提问可以形成清楚的咨询目标；只有范围有歧义、发生实质扩展、增加消费或涉及受保护动作时，才说明范围并取得所需确认。Trip 确认与任务额度确认不是同一件事。

### 4.2 对话延续与新目标

Q37 已确定必要澄清和系统修复不新增消费。建议通过明确的 continuation 关系与范围版本继续同一 ServiceTask：补充城市、人数、日期，回答 VP 为完成该目标提出的问题，以及纠正系统误读，都保留原归属。新城市行程、独立成果或明显扩展范围可以形成新任务，但须在新增工作和消费前说清楚。

完成后自主改稿的边界、等待输入的 TTL、跨权益期续作和 partial 计费仍未定。先实现记录与分类验证，未决消费策略保持禁止启用。不能把所有后续输入永久并入一个任务，也不能把每次澄清都当新的收费目标。

### 4.3 用户容量与内部成本分开

用户容量按服务任务；内部成本按每个实际 attempt 累加。澄清、重试和修复可以不扣新的用户容量，但继续受单任务输入/输出、工具次数、重试、运行时间和整批支出限制。费用未知保留待核，不填零；已取消任务的晚到响应只能按规则核验，不恢复已失效写入权限。

多设备请求最后一份容量时，需要账号额度的并发保护；相同 owner/task 的重复请求需要唯一身份与幂等结算。数据库唯一约束和行锁解决不同问题，不能用进程内 Map 代替。PostgreSQL 官方文档也说明普通 CHECK 不适合跨行一致性约束。[^5] AWS 对幂等请求的讨论说明了请求身份、参数一致性与晚到重试的重要性；这些机制不能让无法控制的供应商自动实现“只收费一次”。[^6]

当前 #194 的 provider 成本预算应继续先做，不等待 IAP 商品。#227 则负责用户容量与商业权益的整合。Q37 不取消反滥用、预算和原始成本记录，也不授权新增支付行为。

### 4.4 兼容方式

先增加 ServiceTask 归属与记录模式，保留现有 Turn/event 兼容。若已有真实消费路径，只允许一个权威执行者；新规则先作不扣费的对照记录。若尚无真实消费实现，不为迁移而凭空建设旧 Ask 收费系统。历史数据不回填成未经证明的服务任务，不追溯扣费，不改已应用迁移。

StoreKit 的购买交易身份、用户服务容量与模型 attempt 是不同对象。恢复购买不能补发同一 grant，任务重试不能变成新购买。Apple 的交易与权益文档支持这种分工，但不替 VP 决定新的商品期限或激活方式。[^7] 具体约束见 [服务任务计量契约](../contracts/service-task-metering.md)。

## 5. 基础偏好：从“能保存”走到“正确使用”

现有 memory_profiles、管理 API、consent、状态和 source receipt 可以复用；Profile 已持有 travelPace 等偏好。当前缺口是适用范围、纠正版本和实际使用链路。管理页列表可以包含暂停/撤回记录，不能直接整个塞进模型。ContextPlan 对问答和恢复排除 memory 的配置尤其需要修订。[^8]

建议明确每一类字段的唯一权威源：Profile 已有字段继续由 Profile 管理；自然语言明确保存的其他偏好由 Memory 持有；某次行程事实仍在 Trip。本次临时偏好留工作上下文，不自动持久化。按需补充 scope、tripId、revision 和到期信息，通过共同的受控读取投影进入 Context，而非复制三份状态。

使用优先级为当前明确要求、当前 Trip 适用偏好、明确长期偏好。权限、安全政策和已确认 Trip 事实始终是约束。偏好冲突需要解释或澄清，不能用旧记忆压过当前选择，也不能因为用户想少走路就篡改已确认晚餐。

保存也应减少重复操作：用户明确说“记住我偏好慢节奏”，且内容、范围和既有许可清楚时，可按该明确意图保存；从一次低价查询推断长期预算，则只能提出候选。购买 Pass 不扩大同意，Free 也不降低同意要求。

每次模型外发前检查 owner、consent、最新 revision、任务相关性、Trip/scope、期限和本次禁用。纠正或撤回后，排队请求、重试、待提交建议与派生缓存必须重新核验。已外发的数据无法凭本地删除撤回，这一限制应如实纳入删除策略；已确认 Trip 的保留/删除仍由既有隐私合同处理。普通用户 JWT 与他人账号的拒绝测试不能用 service-role 成功替代。[^9]

LongMemEval 把长期记忆能力拆成提取、跨会话与时间推理、更新和不作答等任务。这支持分开检验记忆管线，而非只问“记住了吗”；其基准结果不证明 VP 的实际收益，也不要求引入研究原型中的全部结构。[^10] 具体边界见 [基础跨 Trip 偏好契约](../contracts/basic-preferences-cross-trip.md)。

## 6. 输出内容与表达语气

### 6.1 内容先于修辞

VP 应先判断这次需要交付的成果，再组织可被证据支持的内容与下一步，最后用合适的语言表达。最小职责分工是：#195 的真实生成入口组织内容和品牌策略，#206 检查证据与部分答案，#196 和客户端根据实际事件显示进度与恢复状态。

当前 prompt 目录主要登记版本和摘要，旧 message contract 仍是 answer/clarification/unavailable，而新领域文档使用 answered/partial/clarification/blocked/technical_failure。两者尚未成为完整真实调用链。更新须有明确 wire 版本、生产者和客户端兼容测试；不能在旧封闭 schema 中偷偷增加字段。[^11]

输出可以采用以下内容顺序，但不要把它变成每轮固定的四段模板：

1. 直接答案、主要建议或这次最值得做的一步。
2. 会改变决定的原因、用户约束及必要限定。
3. 需要时给一个替代方案、核实入口或可确认提案。
4. 来源、详细取舍和扩展说明按需展开。

简单问题可以只有两句；复杂多日规划可以有时间线；现场问题先突出操作步骤。长度是观察指标，不能为了短而删掉否定、条件或未知。信息不足时，能够安全回答的部分应保留；只有关键歧义会改变目标或行动时才追问。Apple 的生成式 AI 指南强调用户控制、已核实信息及真实阶段反馈；HAX 的消歧建议并未要求每轮问卷。[^12][^13]

### 6.2 人格一致，表达强度随场景变化

| 场景 | 推荐表达 | 避免 |
| --- | --- | --- |
| 行前探索 | 自然、体贴，给少量明确选择 | 每轮固定问三题，长篇城市百科，夸张保证 |
| 行程修改 | 说明改什么、保留什么、为什么适合 | 只说“为你优化好了”，隐藏代价和 diff |
| 在途疲劳或晚点 | 短、沉着，先给可用下一步 | 强行幽默、“别担心，一定没问题” |
| 证据不足 | 指出具体未知及影响，保留可靠部分 | 泛泛免责声明，或把缺一项证据扩大成全部拒答 |
| 使用记忆 | 仅在有帮助时自然说明来源与适用性 | 每轮展示“我记得你”，虚构亲历或永久人格判断 |
| 真人等待 | 依真实接单状态说明下一步 | 排队时声称有人处理，未经确认给 ETA/SLA |
| 额度与失败 | 用服务目标和已保存成果解释 | 将 token、模型内部错误或成本压力直接推给游客 |

英文以目标游客可自然理解的表达原生创作，中文保持事实、范围、否定与动作状态一致。熊猫角色不要求昵称、口头禅或每轮笑话；幽默可以为零。温暖主要来自减少重复输入、保留重要安排、承认限制并给有效选择，而非情感依赖或拟人化表演。解释记忆影响时应使用可核实的输入或使用收据，不编造模型的思考过程；HAX 也提醒解释可能增加过度信任。[^14]

### 6.3 对照样例

以下是虚构且预先给定状态的表达示范，不能作为已有运行能力或真实旅行事实。关键状态必须来自服务端回执。

| 已知状态 | 不合适的表达 | 建议英文 / 中文 |
| --- | --- | --- |
| 只有局部修改候选，晚餐保持 | “都安排好了，放心玩！” | “This draft keeps dinner in place and makes the afternoon lighter. Review the changes before saving.” / “这版草案保留晚餐，让下午轻松一些。先查看改动，再决定是否保存。” |
| 已知地址，无法确认今日开放时间 | “信息不足，无法提供帮助。” | “The verified address is below. I couldn't confirm today's opening hours, so check the museum's official information before setting off.” / “下方是已核实的地址。今天的开放时间还无法确认，出发前请核对博物馆官方信息。” |
| 旧偏好少走路，本次明确要徒步 | “你不喜欢走路，我不建议徒步。” | “You previously preferred shorter walks, but today you've asked for a hike. I'll follow today's choice and make the walking effort clear.” / “你之前偏好少走路，这次明确想徒步。我会按这次的选择规划，并说明步行强度。” |
| 两个同名地点尚未消歧 | “请填写完整旅游偏好问卷。” | “Which city is this museum in?” / “这家博物馆在哪个城市？” |
| Trip 提交早于停止请求，未撤销 | “已经取消，行程没有变化。” | “The change was saved before your stop request arrived. It hasn't been undone.” / “停止请求到达前，改动已经保存，目前还没有撤销。” |
| 真人请求 queued，无接单与时限 | “我们的专员马上处理。” | “Your request is in the queue; no one has accepted it yet. I don't have a confirmed response time.” / “请求正在排队，暂时无人接单，也没有确认的响应时间。” |

完整的八组双语样例和评分说明见 [表达证据附件](brand-engineering-2026-09-10/response-evidence.md)。运行要求见 [VP 响应内容与表达契约](../contracts/vp-response-policy.md)。

### 6.4 让表达规范真正生效

把获准品牌策略作为已有 prompt 版本的一部分，记录策略版本、模型配置与 grader 版本。首次实现不新增二次润色模型；若以后证明确有收益，也必须重新验证改写后的事实与状态。已验证的卡片不能替旁边任意自由正文背书，合法 JSON 也不代表自然语言事实正确。

关键金额、日期、时区、地址、否定、Proposal 版本和动作状态从已验证数据绑定到展示。自由文本在获准事实范围内生成，再做语义评测。按钮权限和点击对象由结构化回执决定，不能从“已经帮你…”等文本解析执行意图。短结论不能隐藏不可行条件或让未确认动作显得已完成。

## 7. 知识、下一步与真人协助

### 7.1 把覆盖计划按任务组织

先从可持续维护的 1–2 个城市和普通旅行场景形成最小覆盖矩阵，城市名单依证据与服务能力确定。每个场景列必要的用户事实、外部证据、有效期、来源权利、可用工具、允许动作和缺口时的下一步。优先支撑抵达、移动、餐饮、开放与入场条件、材料理解和用户报告变化后的应变。

沿用 Canonical POI、Fact、EvidenceReceipt 与审核工作流。地点存在不等于所有属性已认证；用户喜欢某种食物也不证明餐厅满足相关条件。首轮用可审查的结构化信息和直接检索支撑任务，只有真实召回失败才进入更复杂检索与重排；不以语料条数或全国地图点位宣称服务深度。

### 7.2 从 review_fact 到具体帮助

当前 buildToday 的下一步主要是 review_fact，Recovery 的 accepted 结果仍是元数据判断；调用检索没有发现它们已接成真实旅途恢复和写入链。这些合同可以复用，但尚不足以支撑品牌所说的“知道下一步怎么做”。[^15]

建议为现有结果明确有限动作类别，例如阅读已保存资料、核实一项条件、展示地址/表达、查看候选、审阅修改、发出服务申请。每个动作携带适用条件、能力可用性及所需授权；执行状态来自实际系统。外部信息 unknown 时，可提供允许的核实路径或已有资料，不能虚构实时结果。

首个跨阶段验收采用：明确保存慢节奏偏好 → 新规划正确使用 → 再次打开仍保留 → 游客报告今天累了 → 在可靠路线依据下提出更轻松的下午 → 保留已确认晚餐 → diff 确认 → 重载同一 Trip。步行指标在运行前选择，保持来源、日期、出行模式与计算口径一致；缺依据时只能算待核候选。

### 7.3 主动程度逐级开放

先做好打开 App 后的接续、未完成任务、已确认安排与有理由的提示；再考虑用户订阅的到期提醒或服务状态更新。持续追踪外部变化、后台监控和推送是另有来源、权限、频率及失效控制的能力，不因“更体贴”自动获得授权。

iOS 后台运行由系统调度，不能把手机 App 当作保证准时、永久运行的 worker。Apple 对 BGProcessing/BGAppRefresh 的说明支持把需要持久性的任务放在已有服务端执行边界，并让客户端恢复读取实际状态；这不构成新平台选型。[^16]

### 7.4 真人成为具体问题的后盾

人工路径沿 CaseRequest → 按用途授权的 TravelerBrief → ServiceCase。只有接单之后才有负责人和可承诺的更新时间；AI 不得替真人说“已经接手”，也不能把提供教程称为已替游客改票。

首轮先列支持的任务类型、服务时段、容量和结果回传方式。真人所见摘要应最小化、可撤回、随实际任务授权；不默认把全部对话或永久偏好交给工作人员。可以准备结构与沙盒演练，真实团队、数据访问、时段、收费及承诺未定时保持对应门。

## 8. 评测需要同时覆盖成果、表达和成本

保留现有 12 场景基线、开发/holdout 分组和原有硬不变量。品牌方向带来的反例优先落到相关场景变体与模块测试；确有新的风险维度时才版本化扩充集合，并明确为什么增加。#263 的离线准备已经完成，不因新语气要求重新包装为未完成，也不能用它证明新增能力通过。

| 层面 | 核验对象 | 典型失败 |
| --- | --- | --- |
| 硬正确性 | owner、权限、证据资格、否定/数值、精确确认、重复消费 | 越权；未确认写入；queued 说成 accepted；重复扣次 |
| 服务结果 | 正常可答任务是否完成，成果是否可读取与继续使用 | 有文字无成果；可答部分被全部拒绝；只返回模型状态 |
| 记忆连续性 | 正确偏好影响建议，纠正/撤回在后续生效 | 展示旧记忆但不影响方案；将仅本次要求永久化 |
| 表达质量 | 下一步、必要限定、信息密度、英文自然度与情境语气 | 无谓追问；模板化共情；急迫情境调侃 |
| 稳定性与恢复 | 多次运行、重连、取消、迟到响应和最终状态 | 单次最好答案通过，其他运行错误；取消后副作用复活 |
| 经济性 | 服务任务成本、attempt 累积、失败/partial 和未知费用 | 只算首个调用；失败样本或未知费用被排除 |

确定性检查负责可验证的不变量，人工校准的 rubric 评估语义有用性和表达，模型 judge 仅辅助。软评分不能冲抵硬违规；正常完整证据下全拒答是任务失败。τ-bench 将结果核对与多次成功一致性分开，Anthropic 的评测实践也区分任务、trial、grader 和最终结果；这些方法适合借鉴，但外部成绩不是 VP 的能力证明。[^17][^18]

候选运行前固定场景、证据、时钟、配置、版本和费用上限，分别报告中英与正常可答等切片。先提出 0/1/2 等可解释评分标尺并做人工校准，再冻结容差；不凭主观平均分或临时阈值宣称上线通过。现有 holdout 文字在仓库中可读取，未来调优必须记录暴露情况，必要时换入未参与调优的新案例；语言翻译与参数变体不能跨组伪装独立样本。

建议最少报告：正常任务完成率、必需 claim 覆盖/支持、正确偏好使用率、重复问题数、同任务重复扣次、结果恢复一致性、服务任务与 attempt 成本。留存和付费观察按旅行阶段、实际使用机会、免费/付费和人工辅助分别统计；不把聊天更多等同于价值更高。

## 9. 既有 Issue 的调整与开发顺序

本轮优先细化原任务，不创建同义队列。共享语义文档应先可审阅，运行代码仍按真实依赖与环境推进。下面列的是应同步的验收增量，不表示原功能、预算或商品已经完成。

| 责任票 | 应补充的结果 | 开发注意 |
| --- | --- | --- |
| #190 数据政策 | 明确基础偏好范围、纠正/撤回与模型/人工接收方 | 不用 Free 或付费状态替代许可 |
| #199 记忆 | Free 跨 Trip 基础偏好真实使用，唯一权威源、版本与撤回 | 不另建同义存储，不只验管理页面 |
| #195 真实 Ask | ServiceTask 归属、内容与表达策略、真实五类结果 | 与 Turn/attempt 分层，候选 schema 先兼容再接入 |
| #196 恢复 | 服务任务跨轮与重连恢复，状态文字与真实事件一致 | 取消生成、撤销 Trip、外部取消分别表达 |
| #194 成本预算 | task/attempt 持久成本预算及未知费用核对 | 保留已有不依赖 IAP 的独立责任 |
| #225/#227 商品与容量 | Q36 权益、Q37 服务单位、数字重测与待决分支 | 旧 Ask 数字不可只换名称；计费政策未决不启用 |
| #226 IAP | 购买/恢复/退款仍与服务任务消费分开 | 本轮不改激活起算与商品期限 |
| #203 首值与回访 | 少量必要澄清、可跳过、正确使用已知偏好 | 可在 #195 首个消费者先验证，不必等全入口验收才看表达 |
| #205/#206 知识与有依据回答 | 任务导向覆盖；partial 保留可靠部分与可用下一步 | 不以偏好代替外部事实 |
| #211/#215/#219/#220 | 准备、已保存资料、计划依据和变化恢复贯通 | 继续保留当前依赖，不用新演示替代真实对象 |
| #218 讲解 | 按兴趣解释、英文自然、未知有界 | 不与 #220 的局部恢复责任混淆 |
| #221 主动服务 | 打开 App 后接续与有授权提醒，实际触发/到期控制 | 不承诺后台永久监控 |
| #222/#223/#224 人工 | 执行任务申请、授权摘要、接单和真实结果 | 不默认行前人工定制、无限容量或即时 SLA |
| #188/#234 体验 | 成熟清爽、关键状态易读、英中事实一致 | 可访问性缺陷继续修，保留已接受 Logo |
| #267/#268 Harness | 加入内容、记忆、任务延续和表达验收 | 真实运行门、12场景和硬违规门不减少 |
| #246/#247 经营观察 | 多阶段首值、回访、服务成本和实际付费分母 | 社媒触达与已验证产品结果分开 |

建议开发顺序如下：

1. **先同步语义。** 回写 Q36/Q37 权益与任务单位，发布基础偏好、服务任务计量、响应内容契约；把未决点标清。provider 协议、原生缺陷、已批准数据库验证等独立工作继续。
2. **优先真实文字链路。** #189/#190 的对应条件、#191/#192 身份与 Trip、#193 模型、#194 预算解锁 #195；#204/#205 与其并行支撑 #206。首个真实输出就采用品牌策略，不把表达留到发布前。
3. **再验证连续个性化。** #195 可用后推进 #199，与 #206 汇合；#264 仍先验只读闭环，完整跨 Trip 品牌成果随后在对应记忆、首值与恢复验收中贯通，不给 #195 反加依赖制造环。
4. **并行方案与评测。** #267 的配对评价与 #198/#219 计划链分别推进，#265 验局部改稿，#266 验恢复，#268 汇总真实门。已合并协议/配对准备应复用，避免重复开发。
5. **产品经营与最终发布保留原门。** #268 当前经 #229/#227 间接连到 IAP，完整首发还包含 Community、分享等责任。可先提交有界技术准备和人工操作材料；任何进一步拆分“可靠性技术验收”与“商业上线验收”的依赖变更，须单独给出证据、职责和回归影响，不能在调度时偷偷删边。

在核心闭环未证实前，Community、分享与生成式内容不宜抢占关键模块的开发容量，但原首发范围没有因本报告自动取消。eSIM、支付渠道和购买后激活继续不进入当前实现排期。

## 10. 并行工作与迁移验证

建议让接口明确、文件不重叠的工作并行：成本持久化、输出策略及配对判分、原生可访问性可以各有边界；ServiceTask、Memory 范围和 wire schema 的共享定义由主开发者协调。不要让多个实现者同时更改任务身份、共享类型或消费语义。不同分支必须基于已合并接口，依赖未就绪的 PR 清楚标准备范围。

代码落地按 expand → 消费者迁移 → 旧路径退役处理；新字段和策略具有版本，旧客户端不得因未知字段改变确认含义。数据迁移追加，不覆盖历史。记录模式与真实消费模式隔离，任何回滚都保留已发生账目、已确认 Trip、删除/撤权记录与核验能力。

对实现的验证至少包括：两客户端同目标延续、最后一份容量竞争、重放、相同 key 不同参数、取消与完成竞态、撤回后排队任务、旧偏好与当前输入冲突、模型正文与回执冲突、Free/Pass 到期前后基础偏好可用。真实数据库、provider、原生及商店行为分别验收；本地 fixture 或 CI 绿色不能覆盖缺失环境。

## 11. 需要明确的产品决定

| 决定 | 建议先形成的可审查材料 | 等待期间仍可做 |
| --- | --- | --- |
| 服务任务完成后怎样划分新修改 | 正反例：补信息、系统纠错、新偏好、新目的地、独立成果 | 归属记录、范围版本、参数冲突测试 |
| partial 与取消后的容量处理 | 何种成果可用，怎样告知缺失，结算/返还的具体规则 | 双账分离、幂等与未知费用状态 |
| 用户等待、任务超时、跨期续作 | 输入等待和执行预算分别定义，旧预留恢复规则 | 不收费记录模式、过期/重连测试 |
| 免费/付费具体容量 | 同一服务单位下的任务混合、成本与高峰数据 | 有界合成测试，预算本身先建设 |
| 偏好与资料的数据期限及接收方 | 字段、用途、地域、保留与删除矩阵 | 最小读取投影、合成撤回/隔离测试 |
| 首批城市、真人范围和时段 | 可维护证据、容量、负责人、外部结果定义 | 状态机、明确不可用表现、操作手册 |
| Q38 激活与增值服务 | 独立比较购买、行前权益、激活、到期四时点 | 保留现行交易合同，不建设候选功能 |

这些事项不能通过猜测数字、默认同意或给演示结果打“成功”来解决。已确认的方向足以启动规格和受控准备；只有改变实际权限、真实消费、交易或服务承诺的未决分支保持门禁。

## 12. 来源与附件

内部代码均固定到 `d4eeb084`，品牌原文固定到 `8ae95a7`；外部资料核对日为 2026-09-10。供应商文档支持通用机制，学术基准支持评价维度，均不代替 VP 自身的使用、正确性或商业证据。

- [服务任务与消费账本证据](brand-engineering-2026-09-10/service-task-evidence.md)
- [基础偏好与消费者证据](brand-engineering-2026-09-10/memory-evidence.md)
- [输出内容、语气、双语样例与评分证据](brand-engineering-2026-09-10/response-evidence.md)
- [相关 Issue 状态与原生依赖快照](brand-engineering-2026-09-10/issue-snapshot.json)

[^1]: VisePanda，[Q1–Q38 品牌定位蒸馏报告](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md)，2026-09-10；尤其 B05–B07、Q36–Q38 与第6–9节。
[^2]: VisePanda，[ADR-0023](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/adr/ADR-0023-vpj-integrated-native-journey-baseline.md)、[领域接口](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/program/2026-09-05/INTERFACES.md) 与 [开发流程](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/agents/development-workflow.md)。
[^3]: VisePanda，[共享交接](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/handoff.json)、[Staging 未验事项](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/artifacts/VPJ-02/unrun.md)；本附件另记录 GitHub 查询时刻。
[^4]: Anthropic，Erik Schluntz、Barry Zhang，[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)，2024-12-19，页面附工具生态更新提示。
[^5]: PostgreSQL，[Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)、[Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)，滚动维护文档，核对2026-09-10。
[^6]: Amazon Builders’ Library，Malcolm Featonby，[Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)，核对2026-09-10。
[^7]: Apple，[Transaction.id](https://developer.apple.com/documentation/storekit/transaction/id)、[Transaction.currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)，滚动文档，核对2026-09-10；此处不推导新商品或激活政策。
[^8]: VisePanda，[ContextPlan 的来源配置](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/context/context-plan.ts#L77)、[memory_profiles schema](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/supabase/migrations/20260828193000_v4_13_memory_profile.sql#L19)；调用关系及 Profile 证据见记忆附件。
[^9]: PostgreSQL，[Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)；Supabase，[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)，核对2026-09-10。
[^10]: Di Wu 等，[LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory](https://arxiv.org/abs/2410.10813v2)，v2，2025-03-04；用途限于评测维度和管线拆解。
[^11]: VisePanda，[Prompt registry](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/model-gateway/prompt/index.ts#L3)、[旧输出信封](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/turn/message-contract.ts#L36)、[当前 Ask 接受路由](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/app/api/chat/threads/%5BthreadId%5D/turns/route.ts#L7)。
[^12]: Apple，[Human Interface Guidelines: Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai)，页面更新2026-06-08，核对2026-09-10。
[^13]: Microsoft HAX Toolkit，[Guideline 10: Scope services when in doubt](https://www.microsoft.com/en-us/haxtoolkit/guideline/scope-services-when-in-doubt/)，核对2026-09-10。
[^14]: Microsoft HAX Toolkit，[Guideline 11: Make clear why the system did what it did](https://www.microsoft.com/en-us/haxtoolkit/guideline/make-clear-why-the-system-did-what-it-did/)，核对2026-09-10。
[^15]: VisePanda，[TodayResult](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/today/index.ts#L30)、[RecoveryProposal/Decision](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/lib/server/today/recovery/index.ts#L4)，均为固定基线源码证据。
[^16]: Apple，[Choosing Background Strategies for Your App](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app?changes=_5)，核对2026-09-10；系统调度行为不能解释为永久后台可用。
[^17]: Shunyu Yao、Noah Shinn、Pedram Razavi、Karthik Narasimhan，[τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains](https://arxiv.org/abs/2406.12045)，2024-06-17。
[^18]: Anthropic，[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)，2026-01-09；评价方法不等于 VP 已取得相应成绩。
