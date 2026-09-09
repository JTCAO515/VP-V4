# Hugging Face 复用研究：工具、Agent 方法与材料解析

研究日：2026-09-10。VP 代码检查基线：`d4eeb084`；品牌输入单独读取用户指定的 `8ae95a7` 报告。以下为建议，不是架构变更、供应商采纳或运行验收。仅检索公开文档、发布元数据、源码和模型卡；安装、权重下载、模型调用、文件解析、MCP 连接和 Spaces 部署全部 **UNRUN**。

## 结论

最值得直接借用的是 **smolagents 的简化工作流方法、Gradio 的内评界面组件、Docling 的材料转换框架**。当前不建议用 smolagents 替换 VP 的 Coordinator，也不建议把公开 Space 接成游客服务后端。Transformers.js 是 Web 本地小模型的备选，不解决完整原生 iOS 产品的推理需求。HF MCP/Skills 能减少开发期检索工作，但不等于 VP 已取得新的工具、数据或供应商权限。

品牌报告的 Q14/Q18 要求材料进入规划、给出可执行下一步，Q30/Q32 要求英语自然直接；Q36/Q37 又涉及记忆范围与完整任务账本。因此复用的目标应是减少解析、评测、工具描述等通用工作，保留 VP 对偏好、证据、确认和扣费的领域判断。

## 六项精选

| 候选 | 已核实维护者、许可及版本快照 | VP 最小借用方式 | 建议 |
| --- | --- | --- | --- |
| smolagents | Hugging Face；代码 Apache-2.0；最新 release `v1.26.0`，2026-05-29 | 先借工具契约和减少模型回合的方法；需验证时用独立 Python 离线 `ToolCallingAgent`，只读合成工具 | 借方法，不替换 Coordinator |
| Gradio / Spaces | gradio-app；Gradio 代码 Apache-2.0；`gradio@6.26.0`，2026-08-24；Spaces 为托管服务，不能把库许可套给任意 Space/权重 | Python 本地评审台读取现有配对 JSON，以 A/B 隐名呈现回答、证据和评分项 | 有真实人评需求时采用；先不托管 |
| Docling / SmolDocling | Docling 项目，始于 IBM Research，现由 LF AI & Data 托管；框架 MIT；`v2.126.0`，2026-09-04；权重另审 | 独立 Python 转换任务，输出保留页码/位置/来源的 JSON，再映射 VP 材料候选 | 框架可做有界试验；SmolDocling 暂不采纳 |
| Transformers.js | Hugging Face；Apache-2.0；`4.2.0`，2026-04-23 | 独立 Web Worker 或 Node 实验，对已许可轻量 ONNX 模型测本地检索/分类 | 非当前主线；有离线指标后再启用 |
| Hugging Face MCP | Hugging Face 托管 Hub MCP；滚动服务无本报告可固定的独立版本/统一社区工具许可 | 开发期模型/数据集/文档检索；连接前仅保留候选，运行期工具另作许可审查 | 可选开发工具；本次未连接 |
| Hugging Face Skills | `huggingface/skills`；Apache-2.0；检查 HEAD `97862b0fcc89c850fdd00c82ede1e62d3c930a6d`，2026-09-03 | 按需参考 CLI/数据/评测工作流的说明和模板，不批量加载训练/Jobs 工作流 | 借任务说明；本次未安装 |

发布版本与日期由 GitHub 官方 release API 实读；不是从搜索摘要猜测年份。版本是调研快照，采用前仍应固定 tag/commit、检查其依赖和对应安全修复。[smolagents release](https://github.com/huggingface/smolagents/releases/tag/v1.26.0)、[Gradio release](https://github.com/gradio-app/gradio/releases/tag/gradio%406.26.0)、[Docling release](https://github.com/docling-project/docling/releases/tag/v2.126.0)、[Transformers.js release](https://github.com/huggingface/transformers.js/releases/tag/4.2.0)、[Skills 固定版本](https://github.com/huggingface/skills/tree/97862b0fcc89c850fdd00c82ede1e62d3c930a6d)。

许可依据：[smolagents LICENSE](https://github.com/huggingface/smolagents/blob/main/LICENSE)、[Gradio LICENSE](https://github.com/gradio-app/gradio/blob/main/LICENSE)、[Docling LICENSE](https://github.com/docling-project/docling/blob/main/LICENSE)、[Transformers.js LICENSE](https://github.com/huggingface/transformers.js/blob/main/LICENSE)、[Skills LICENSE](https://github.com/huggingface/skills/blob/97862b0fcc89c850fdd00c82ede1e62d3c930a6d/LICENSE)。库代码许可不自动覆盖模型、测试材料、图片、第三方 API 或商标。

### 1. smolagents：最有价值的是少让模型做决定

官方教程本身建议减少 LLM 调用、合并相关工具，并把能确定执行的逻辑放进函数。其例子恰好涉及旅游：把距离与天气查询包装成一次地点信息工具调用。这适合 VP 的“给出下一步”链路：在已授权且有依据的前提下，一次提供地点消歧、可用时段、路线限制和信息时间，减少模型反复拼接零散结果。[Building good agents](https://huggingface.co/docs/smolagents/tutorials/building_good_agents)。

但工具聚合只是减少调用，不应合并权限，也不应隐藏部分失败。VP 的聚合结果仍需逐来源保留成功/未知/过期状态，天气可用不代表营业时间可用。只有用户请求需要时才查询；不能借工具聚合无限扩大外部数据发送。

`CodeAgent` 生成并执行 Python，默认在本地环境运行；官方安全说明明确提示风险，并提供受限解释器与沙箱路线。`ToolCallingAgent` 使用结构化工具调用，更接近 VP 的有限工具需求；但结构化参数并不等于权限检查。API 文档仍称其为可能变化的实验 API。[安全执行](https://huggingface.co/docs/smolagents/tutorials/secure_code_execution)、[Agent 类型](https://huggingface.co/docs/smolagents/reference/agents)。

本地已有 `lib/server/turn/reliable-coordinator.ts`：owner 隔离、lease、attempt、cancel、terminal/replay；该文件也明确只是内存生命周期合同。`lib/server/model-gateway/index.ts` 已定义 `AbortSignal`、数据分类、失败状态与 fixture 路由。迁移框架不会自动补齐持久 worker、RLS、Trip 原子回执或真实集成；反而会新增 Python 服务和控制权交接。

**最小试验建议**：只有现有工具循环被测出是瓶颈时，才对同一组只读合成任务比较现有路径与固定版本 `ToolCallingAgent`；禁止写 Trip，复用现有成功/失败 oracle、步数、耗时、成本字段。不得把框架自己的 plan review 当成 VP 的 TripProposal 确认。不要直接复制教程里的完整日志输出、`trust_remote_code=True` 或开放网络导入。[工具教程](https://huggingface.co/docs/smolagents/tutorials/tools)。

### 2. Gradio / Spaces：借内评 UI，保留正式产品 UI

`ChatInterface`、`Blocks`、`Chatbot.like()` 可快速组合回答展示和反馈。最小方案不需要新模型服务：只读已有 Harness 配对报告，随机隐藏候选身份，显示“更合适 / 持平 / 都不合格”及具体原因，输出版本化人评记录。品牌语气评审应另外比较直接程度、是否给下一步、是否重复展示记忆、英文自然度；安全事实硬门不能被“更讨喜”的投票抵消。[Gradio ChatInterface](https://www.gradio.app/docs/gradio/chatinterface)、[LikeData](https://www.gradio.app/docs/gradio/likedata)。

这是建议的人评流程，不是 Gradio 自带的 VP 评分标准。若现有 HTML/Markdown 报告已经满足少量评审，先加样本和 rubric，不为了用 Gradio 另建后台。

默认先本机运行且不启用公网分享。Spaces 支持不同可见性与硬件，免费硬件可能休眠；公开演示的可调用性不等于稳定的旅行服务承诺。保存位置、访问控制、删除和审计都需由 VP 明确；Space 为 private 也不自动满足数据接收方授权。[Spaces 概览](https://huggingface.co/docs/hub/spaces-overview)。

### 3. Docling：把材料解析外包给成熟框架，把确认留给 VP

Docling 提供多格式转换、布局/表格/OCR 和统一文档表示，可导出 JSON/Markdown。适合 Q14 的“已有安排/材料”输入，也可能减少知识 Ops 手工结构化工作；它不是事实核验器。框架代码 MIT，具体模型必须看各自许可。[Docling 上游](https://github.com/docling-project/docling)。

**候选接法**：在独立 Python 转换进程使用已许可的合成 PDF/截图，固定选用解析管线；把抽取文本、页码/位置、原材料标识映射到现有材料候选，而不是直接写入确认后的 Trip。中文混排、日期时区、货币、小字、折行、缺页、错误 OCR、重复材料和恶意文档指令必须单独验收；图中文字只能作为输入内容，不能变成执行指令。预算、文件尺寸/页数、超时和取消要设上限。

官方默认禁止远程服务和外部插件；保持 `enable_remote_services=false`、`allow_external_plugins=false`。这不禁止初次下载模型，真正离线需要先批准并固定全部模型资产，再验证无外发。超时可返回部分结果，VP 应显式标记不完整并要求校正，不能把有结果文件等同成功。[高级选项](https://docling-project.github.io/docling/usage/advanced_options/)、[Pipeline 配置](https://docling-project.github.io/docling/reference/pipeline_options/)、[CLI 模板](https://docling-project.github.io/docling/reference/cli/)。

**SmolDocling 权重的实际阻塞**：当前官方模型 ID 是 `docling-project/SmolDocling-256M-preview`，不是旧教程中的 `ds4sd/...`。HF API 实读 revision 为 `ce51f56c4ebe36e0b1c3a55f67b261ba22a50bf8`，最后更新 2025-09-17；卡片语言仅 `en`。卡片 metadata 标 `cdla-permissive-2.0`，正文 Model Summary 却写 Apache 2.0，许可标注冲突尚未澄清。本报告不把它列为“可直接商用”的中文 OCR 首选；可独立试 Docling 其他经核实的解析路径。[官方模型卡](https://huggingface.co/docling-project/SmolDocling-256M-preview)、[模型元数据](https://huggingface.co/api/models/docling-project/SmolDocling-256M-preview)。

### 4. Transformers.js：Web/Node 可复用，原生 iOS 需另评

HF 有 Next.js 教程；库用 ONNX Runtime，支持浏览器/Node 等 JavaScript 环境。v4 发布说明增加了 Node/Bun/Deno 的 WebGPU 路径、模型文件大小/缓存状态查询和本地加载控制。因此不能沿用“只在浏览器 WASM 跑”的旧理解，也不能据此声称任意模型、Safari 版本或 SwiftUI 都能直接运行。[Transformers.js](https://huggingface.co/docs/transformers.js/en/index)、[v4 release](https://github.com/huggingface/transformers.js/releases/tag/4.0.0)、[Next.js 教程](https://huggingface.co/docs/transformers.js/tutorials/next)。

VP 目前 iOS 是完整产品；没有明确 Web 离线检索/小模型收益时，不把权重和额外推理运行时塞入 Studio。若以后测试，独立 Worker 加载按 revision 固定、许可明确的模型，测首次下载、实际内存、冷启动、取消、失败回退和国内网络。模型本地运行不代表整个页面无外发；下载、分析、错误上报另验。保留服务端的权限和事实来源，前端输出无直接写入权限。

### 5. HF MCP：能复用发现能力，不把公共工具目录当授权表

HF 官方 MCP 可以检索模型、数据集、Spaces、论文及文档，还提供可配置的 Jobs、Sandboxes 和社区 Space 工具。当前文档主要列出 `hf_fs`，不能照抄旧文章的固定九工具名单。文档存在不代表本会话已连接，本次只通过网页和公开 API 读取资料。[HF MCP 官方说明](https://huggingface.co/docs/hub/en/agents-mcp)。

开发期最小收益是只读资源发现与版本检查。若未来接入，默认避免 Dynamic Spaces 自动发现后调用；只允许审核后的资源与操作。MCP 协议不提供 VP 的 recipient 许可、租户隔离或消费账本。社区 Space 接口背后可能运行不同发布者的代码和模型，需分别核验源码 revision、许可、输入去向、错误处理和限流；不自动把用户照片、行程或秘钥交给它。官方说明 `mcp_server=True` 可把 Gradio 函数暴露为工具，这证明接口易封装，不证明它具备安全业务行为。[Spaces as MCP servers](https://huggingface.co/docs/hub/spaces-mcp-servers)。

### 6. HF Skills：按任务借说明，不增加一套全局工程流程

官方 `huggingface/skills` 仓库提供 HF 工作流说明，当前 README 推荐以 `hf-cli` 为入口、其他工作流按需添加；技能包含说明、脚本和资源。可借其模型/数据查找、评测记录和元数据整理方法，降低重复编写查询脚本的成本。[官方 Skills](https://github.com/huggingface/skills/tree/97862b0fcc89c850fdd00c82ede1e62d3c930a6d)。

本次没有安装。后续采用要固定版本、只读所需 SKILL 和脚本后再决定，不因 skill 包含训练、上传、Jobs 指令就默认执行。VP 当前最短路线是做好已有模型 API 和 Harness，训练/微调不是改善语气的前置条件。

## 建议加入现有工程计划的最小准备片段

| 片段 | 对应现有工作面 | 完成判据；不得冒充的结果 |
| --- | --- | --- |
| 只读工具返回值整理 | Ask / Grounded Answer / Harness | 每个关键字段有来源、时间和缺失状态；模型少问、少调工具但任务成功率不降。不是模型或数据源已采纳 |
| 表达 A/B 人评模板 | 配对评测与产品表达 | 使用同输入、固定候选版本、盲评与品牌 rubric，保留“都失败”。不是硬安全门替代品 |
| Docling 合成材料转换 spike | 材料输入 #201 / 计划核验 #219 | 正确提取且能校正，保留证据位置，恶意指令不执行；各格式按实测声明。不是所有 PDF/URL 支持 |
| HF 资源登记 | 现有研究/许可账本 | repo ID、维护者、revision、库与权重许可、runtime、UNRUN 条目齐全。不是获得新供应商/用户数据许可 |

片段都应复用现有报告结构和接口，主统筹在实时核验 Issues 后再排期。本专项不修改依赖图、Issue、共享交接或应用代码。

## 验证记录

- PASS：官方文档、上游 LICENSE、GitHub release API、HF 模型 API 已读取；VP 指定基线的 AGENTS、CONTEXT、开发流程、Harness、ModelGateway 和 ReliableTurnCoordinator 已核对。
- PASS：品牌输入按用户固定提交 `8ae95a7` 读取；它与代码基线分开记录。
- BLOCKED FOR ADOPTION：SmolDocling 权重许可文字冲突，中文任务适配缺实证；框架采用与权重采用应分开。
- UNRUN：全部安装、推理、性能、OCR、浏览器/设备、供应商、MCP 连接、Space 托管与生产验证；本次研究未授权执行这些动作。
- GitHub 公共未认证 API 曾返回 HTTP 错误；随后用已有 `gh` 只读凭据读取公开 release 元数据成功。Docling 老示例 URL 和 HF LICENSE URL 的网页打开失败，已改用有效官方配置/CLI 文档；未据失败页面作肯定结论。
