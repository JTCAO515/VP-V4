# VP-V4 同仓三工程边界 — VPV10-MODULAR-001

2026-10-14 接受方向；仓库仍为 `JTCAO515/VP-V4`，保留名称、历史、资源与有效实现。当前先完成方向、文档和开放 Issue 重排；现有源码返修仅安全收尾，新共享库、迁移、部署和自动新实现不由本文启动。

## 用户结果与工程责任

VisePanda 继续帮助来华旅客规划、准备与完成旅程。iOS、Web、Agent 是同仓独立演进工程，按各自入口、版本、验证和交付负责。工程独立不意味着复制业务数据、另建队列或立即拆库。

| 工程 | 当前复用入口 | 自有责任 | 跨边界方式 |
| --- | --- | --- | --- |
| iOS | `ios/VisePanda`，VP/Journeys/Library/Memory 四 Tab | 原生体验、设备能力、Native Bearer 适配、签名与设备验收 | 消费版本化业务 API；不嵌入 worker/provider 凭据 |
| Web | `app`、`components`；首体验 `/qa`，已有 TripCanvas | 浏览器会话与成果呈现、Cookie/CSRF 适配、Web 构建与 Vercel 入口 | 服务端适配业务端口；不要求等待完整 iOS 发布 |
| Agent | `lib/server/qa-agent`、`qa-agent-context`、`turn`、`model-gateway` 与现有 hosted worker | 持久任务、上下文资格、模型调用、预算、执行与结果收据 | 对两端提供同一业务语义，独立执行/版本验证；当前仍与 Next 服务入口共存 |
| shared 业务与数据权威 | 现有 `lib/server` 的 Trip/身份/policy/lifecycle 模块、`supabase/migrations` 与 RLS，及 `docs/contracts` | 原领域 owner 保持对象身份、数据、授权、确认、幂等和生命周期权威，由 Main 协调精确单 writer lease | Agent/Web/iOS 消费这些领域端口；不是第四工程、新 SDK 或复制的数据层 |

`lib/server` 是当前混合目录，不整体等于 Agent。Agent 负责执行/model/context/budget 的生产者与消费者接缝，仍消费 shared 身份、policy、Trip 和生命周期权威，不能自行接管全部 server/DB。Harness/CI 横向验证三工程与 shared 合同，既有测试和 CI owner/lease 保持。Web 的 Vercel、Agent 的 hosted worker、iOS 的签名发布各自消费对应渠道，不能互相取得部署或凭据权限。

当前物理目录及构建保持原样。下一阶段先明确端口与可独立验证入口，再渐进抽取。不得先大搬目录、重写已合并能力或为了三个名字建立三个数据权威。

shared 票按 `business-data`（原业务/数据 domain owner）、`quality-delivery`（恢复/基础设施/横向质量与交付 owner）、`product-operations`（产品经营决策和观察，非运行工程）分类。具体 lead 与受影响消费者见[现有逐票映射](../product/VPV10-MODULAR-001/issue-map.md)，不是把责任留给笼统 shared/HANDOFF；实际源码 writer 仍沿原 lease。

## 第一项可体验交付

复用 #680–#683：用户在 `qatesting.go2china.space/qa` 登录，新建 Session，获得真实 Agent 首答，刷新仍可读回，继续“为什么/简化/第二方案/纠正”并保持同 Session 上下文；新 Session 和其他用户隔离。客户不选择 LLM。#680 负责 Agent 服务入口，#681 负责 Web 会话，#682 负责真实上下文消费，#683 负责获准 QA 交付。

源代码、合并、synthetic、目标运行、真人体验分别举证。PR684/685 的既有合并成果继续复用；PR686 与真实 Auth/provider 路径仍按实际证据判断。本文没有运行浏览器、provider、数据库或设备验收，全部该轮运行证据为 UNRUN。#229/PR679、#203 安全暂停成果保留，不前置恢复整个旧队列。

## 方向完成后的两条可并行前沿

- 前端 UX 可体验切片：复用四 Tab/VPJ77、`/qa` 与现有样例/合同 placeholder，验证入口、会话、成果和确认交互；明确标注 sample、未接入和可用范围。这一局部交互验收不等待真实 provider、全部 80 迁移或完整商业矩阵；只依赖该片实际合同、路径 lease 与可运行环境。样例不伪造真实任务完成，也不开放真实数据写入。
- 真实 QA 最小闭环：#680–#683 保持真实 Auth/provider、持久化、多轮及隔离标准；依实际目标、策略/预算和原恢复门禁推进。前端样例完成不会关闭这些真实验收条款。

两条前沿都只在方向阶段完成后由唯一 Main 使用已有授权安排；本文不新增 UI route、演示实现或派工。共享消费者与端口有冲突时按精确 lease 串行整合，不让真实 provider 的等待阻塞所有独立 UX 工作。

## #681 有限前端样例工作单元（规划，尚未派发）

用户结果：从明确标识 Sample / 未接入的 `/qa/demo` 入口，切换两组示例会话，输入追问并查看确定性的示例响应，随后重置到初始数据。

- 计划范围：`app/qa/demo/**`、`components/qa-demo/**`；复用 `/qa` 的可用交互样式和四 Tab/VPJ77 的呈现经验。只在组件内使用标识 synthetic 的静态 fixtures 和内存状态。
- 排除：不接 Agent/provider/Auth API，不持久化真实 Session/Memory/Trip，不使用 cookies、localStorage 或真实用户资料，不改真实 `/qa` 请求路径。
- Source owner：方向阶段完成后由唯一 Main 派给新的独立开发聊天并授精确路径 lease；现在没有 UI writer、没有实现/新路由或新派工。
- 输入与依赖：本规范、现有 UI 可读源码、两组明确 synthetic fixtures、可运行前端环境和路径 lease；不以真实 provider、全 80 迁移或 SDK/商业矩阵作为本样例前置。

样例验收（不得用于替代本票真实验收）：

- [ ] `/qa/demo` 始终可见 Sample / 未接入说明，静态内容不冒充真实模型回答或保存成果。
- [ ] 可切换示例会话、键盘输入/提交追问、查看确定性示例响应，并一键 reset；切换与 reset 不丢失焦点路径或留下伪运行状态。
- [ ] 浏览器验证示例操作不触发 Agent/Auth/provider/数据网络请求（正常静态资源加载除外），无 key/secret 引用，无真实数据持久化。
- [ ] 明确链接到真实 `/qa` 入口，进入真实入口仍走原登录/许可边界；样例按钮不模拟已登录、已授权或真实成功。
- [ ] 记录测试版本和实际交互证据；样例完成不关闭 #681，原 real Auth/persist/answer 全部验收继续独立保留。

## 版本化业务接口

| 端口 | 生产者 → 消费者 | 兼容与验收 |
| --- | --- | --- |
| Session / Conversation / Turn | Agent 持久执行端口（沿 shared 数据/身份权威）→ Web、iOS 的各自适配器 | 保留已实现 UUID、requestId、actor/auth-session、Session/Task/Turn 绑定、事件顺序与重放；不把 QA Session 直接假定等同所有 Native wire |
| Context / Memory | 唯一资格投影 → 获准模型调用 | 复用 `qa-context/1` 的同 Session、有界完整对、digest 与 consent/source 资格；记录保存、入选、实际消费三个事实；不新建画像存储 |
| Result / Artifact | 持久执行结果 → 两端显示与重新打开 | 回答、partial、blocked、technical_failure、unknown 如实区分；source/version/receipt 与内容同归属 |
| TripProposal / Patch | Trip 权威 → 两端确认界面 | Result → Proposal → 可见 diff → 明确确认 → 原子 Patch；旧版本冲突拒绝，草稿不直接写 Trip |
| Task / Model / Budget | 现有队列、ModelGateway、预算账本 → worker | 同 ServiceTask 的延续与尝试，不另建队列/重复 admission；未知结果先 reconciliation，不盲重试/重复收费 |
| Identity / Policy / Lifecycle | 原权威 → 所有端口 | Cookie/CSRF 与 Native Bearer 各自验证；统一业务资格不统一身份协议，不放宽 Origin/RLS、撤回、删除、接收方许可 |

每个新增或变化端口在实施前记录：当前 schema/API 版本、生产者、消费者、错误集合、幂等键、权限范围、兼容窗口和定向验证。已有 wire 继续有效；本文不是凭空启用新的通用 `v1` API。三工程可独立发布，涉及合同变化时用消费者兼容矩阵约束，不强制全端同版本，也不允许无契约跨端破坏。

采用 expand → 验证 → 迁移消费者 → 退役旧入口的顺序。旧入口退役必须证明原能力、数据与接口兼容，确认没有活跃消费者，并保留回退；永久删除另需具体授权。SDK、Android、新语言和完整商业矩阵不作为当前前置。

## 资源与执行边界

保留 Vercel `vp-v4` / `prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2` / `team_vLT8SL2mQJJSnXbD9GzVLP4K`。数据库固定 `dzqdzetcctkhbrhlxxgn`，原 Production/QA 共享数据事实与明确目标绑定继续有效。方向调整不新建项目、不改 DNS、env、套餐、权限或凭据。

原 Main A–D 与条件式 E 授权和维护确认保留；本专项不操作 backup/key/Docker/target。没有 START/window/actual capture 证据时不能填已执行。本轮不新增生产发布、provider 费用或真实数据权限。

唯一 Main 与唯一 HANDOFF 保持原处。本文件只拥有工程方向与端口责任；当前 writer/ready 前沿依唯一 HANDOFF 和 Main 的精确 lease。历史 ADR-0023/0027 的“iOS 完整产品、Web 轻量附属”及旧固定实施顺序被本次接受方向定向替代；未冲突的产品、安全和发布约束保留。本规范就是已接受方向的单一补充；根导航已同步，CONTEXT 保留生成历史，其它 owner 运行文档保持原权限与合同，见[当前文档映射](../product/VPV10-MODULAR-001/README.md)。
