# Hugging Face 可复用资源与 VisePanda 工程调整研究

**Hugging Face 上有值得 VP 借用的现成组件。当前收益最明确的是评测设计、数据整理、回答人评和材料解析；语义检索模型是有条件的后续候选。** 建议保留现有 TypeScript Harness、Next.js 服务端、SwiftUI 客户端和 Postgres 事实存储，将成熟组件接到已有边界。优先省掉模型加载、批处理、文档转换、通用指标和评审界面的重复工作；VP 的用户权限、证据资格、Trip 确认和任务消费语义仍须由自身合同负责。

品牌输入要求免费基础偏好跨规划使用、按完整服务任务计量、表达温暖直接并给出下一步。这些目标决定资源的取舍：检索模型不能决定偏好是否合法，通用聊天偏好数据不能自动形成 VP 的语气，Agent 框架也不能自动补齐任务账本。资源选择应围绕实际断点，而不是下载量或演示效果。[^1]

## 1. 优先采用清单

以下“采用”是工程建议，不是已安装、已验证或已获商用准入。“现在借方法”可以不新增依赖；模型推理、费用、设备兼容和真实用户验收本次均未运行。

| 优先级 | 现成资源 | 能省掉什么 | 建议落点与限制 |
| --- | --- | --- | --- |
| 现在借方法 | HF LLM-as-a-judge Cookbook、当前 Evaluation Guidebook | 从零设计软质量评测和校准流程 | 在现有 #267 配对报告中加入语气、信息密度和下一步；确定性硬门继续独立 |
| 现在借方法 | LongMemEval、BIPIA | 反复自行发明记忆更新与注入攻击分类 | 为 #199/#195/#206 与 Harness 编写 VP 自有案例；不把外部样本当用户记忆或生产知识 |
| 优先借规划方法 | TravelPlanner、ChinaTravel、Open-Travel | 从零设计多约束行程测试结构 | 借行程完整性、约束与状态检查；ChinaTravel/Open-Travel 默认不进入商业代码或数据管线 |
| 按需采用 | Hugging Face Datasets | 数据集下载、筛选、分割与格式转换 | 独立离线环境导出 JSONL；简单 JSON 文件继续用现有工具，不进入在线请求链 |
| 按需采用 | Gradio；规模更大时评估 Argilla | 自建回答盲评与标注后台 | 先本机读取已有报告；保留人工校准、平局和“都不合格”，不直接上公网 Space |
| 有界试验 | Docling 解析框架 | PDF/文档布局、表格与结构导出的通用代码 | 接 #201 材料候选和校正流程；模型、中文能力、来源位置分别验，不能直接写 Trip |
| 问题驱动试验 | Sentence Transformers + Qwen3/BGE 模型 | embedding、pooling、CrossEncoder、批处理包装 | 可先做有界离线准备；真实集成须满足 #248 激活门；每轮只比较两个候选 |
| 收益明确后再部署 | Text Embeddings Inference（TEI） | 推理服务与动态批处理 | 先确认具体模型支持和净收益，再考虑受控 HTTP 服务；不等于 Qwen 重排已兼容 |
| 可选开发工具 | HF MCP、HF Skills | 资源检索、元数据和 ML 工作流说明 | 只读发现优先；本次未连接或安装，不把社区工具目录当 VP 工具授权表 |
| 暂不替换主干 | smolagents、Lighteval、Evaluate、Transformers.js | 各有现成 Agent、模型预筛、指标或 JS 推理能力 | 有针对性用途再引入；当前不替代 Coordinator、TS Harness 或原生 iOS 产品 |

**建议本轮优先转化为三个准备成果：一份 VP 输出判分规范、一份旅行/记忆/攻击案例映射、一份 Docling 材料转换试验规格。** 前两份先行，Docling规格随后。公开或自有合成数据上的模型加载、输入协议与小型离线对照可作为有界准备；真实语料集成与检索升级仍须满足具体问题证据和 #248 激活条件。这样能够立即利用已有研究，而不把研发目标改成搭建 ML 平台。

## 2. 基线与证据边界

落地更新：PR284/285已合并持久预算预留/dispatch限制及最新实施状态，本报告以下源码观察仍固定于原研究快照，不能作为最新预算缺口结论。当前任务安排与资源采用范围以[HF复用执行计划](../harness/hf-reuse/README.md)为准。

工程检查固定于 `d4eeb084b41f8c82a1794a0f946529bb54e2d5db`；品牌报告固定于 `8ae95a78cdc02a99c3b3b006f4b3fe44a76ac00c`，两者是不同的来源快照。公开资源于 2026-09-10 查询。Hub 的 `lastModified` 是仓库修改时间，不证明模型刚被重训；GitHub `pushed_at` 也不证明维护团队健康或某个主线提交适合生产。[^1][^2]

本次核对了官方文档、发布者模型/数据卡、公共 metadata、上游 LICENSE 与维护说明。未下载权重或数据主体，未安装依赖、执行第三方代码、上传材料、运行模型、连接 MCP 或部署 Space。因此资源性能、实际节省工时、中文 OCR 准确率、Mac 内存和推理成本均为未验证项。

与选型直接相关的代码事实如下：

| VP 当前事实 | 工程含义 |
| --- | --- |
| 已有 `evals/harness/pairing/index.ts`，记录版本、配对、硬检查、质量与未运行项 | 复用这套报告；不为了外部 benchmark 重写 Harness |
| lexical/hybrid 目录已有闭集评测及 RRF 等纯函数 | 有可复用算法，不代表线上检索已接通；不要再造融合器 |
| 现有 hybrid 的资格字段仅覆盖部分状态/时效/许可 | 不能把它当完整的 principal/Trip/purpose/recipient 请求级授权，更不能先外发全库再过滤 |
| Memory 有存储和管理入口，但真实 Context 消费接线仍缺；Profile 已保存部分偏好 | 首先补唯一权威源、适用性、版本和消费者；向量记忆库不能解决这些缺口 |
| prompt 目录主要登记版本/digest，输出 schema 主要检查结构 | 表达优化需要实际 prompt 内容、真实生成调用和事实/状态校验；结构正确不代表语气或事实正确 |
| Turn、Trip、RLS 有现有合同与部分持久化；预算/worker 仍有准备与内存实现 | 框架替换不能视为持久执行、消费结算或恢复验收 |

上述证据的路径和行号见 [记忆核对](brand-engineering-2026-09-10/memory-evidence.md)、[任务计量核对](brand-engineering-2026-09-10/service-task-evidence.md)、[输出核对](brand-engineering-2026-09-10/response-evidence.md)。本次不覆盖其他开发任务中未合并的实现。

## 3. 最接近 VP 的旅行规划项目

### 3.1 TravelPlanner：优先借行程测试结构

[osunlp/TravelPlanner](https://huggingface.co/datasets/osunlp/TravelPlanner) 由 OSU NLP Group 发布，数据卡标 CC BY 4.0。它要求根据工具与参考信息安排交通、用餐、景点和住宿，按约束复杂度组织测试。当前卡片和可见样本以英文、美国城市与历史日期为主，不能拿其中的价格、地点或行程当中国实时服务依据。[^3]

对 VP 最有用的是将“计划看上去不错”拆成可检查条件：天数、地点归属、衔接、预算口径、用户必留项目及输出完整性。可以把自身的 `TripProposal` 投影成测试输入，再以 VP 的独立 oracle 检查最终 Trip。不要为了兼容 benchmark 改写正式领域 schema；原项目评分通过也不包含 VP 的用户确认和跨账号隔离。

**建议：**先借测试组织方法。若需要外部可比性，再对固定 revision 的数据进行来源/许可核对并抽取隔离子集；报告中单列外部基准结果。初次不引入其整套 Agent、模型微调或沙箱数据服务。

### 3.2 ChinaTravel：与业务最接近，但使用限制也最需要看清

[LAMDA-NeSy/ChinaTravel](https://huggingface.co/datasets/LAMDA-NeSy/ChinaTravel) 包含中英文查询和中国城市的多 POI 规划约束。其字段含 `hard_logic_py`，配套 [Space](https://huggingface.co/spaces/LAMDA-NeSy/ChinaTravel) 提供规划评价方法；数据和 Space 的卡片均标 **CC BY-NC-SA 4.0**。[^4]

它适合启发 #219/#265 的预算、日程、用餐、实体与硬约束评测。对 VP 的迁移应保留有限的确定性检查，例如“晚餐 ID/地点/时间未变化”“所有活动属于正确日期”“主要步行指标按同口径减少”。**不要执行从数据集或模型输出取得的任意 Python/DSL。** 其网页称评估在浏览器运行，本次没有执行或独立审计网页，不能据此证明任何上传材料绝不外发。

**建议：**作为公开方法与结构参考。默认不将其数据、评估器或 Space 代码复制进 VP 商业开发管线；需要实际运行、改编或分发时，先核清许可范围。“仅内部”“仅测试”不自动等于非商业使用。

### 3.3 Open-Travel：可以借五类任务划分

[Alibaba-NLP/Open-Travel](https://huggingface.co/datasets/Alibaba-NLP/Open-Travel) 将附近地点查找、带途经点路线、交通方式比较、单日与多日计划作为不同子任务，并强调预算、时间窗、同行人和偏好等约束。数据许可为 **CC BY-NC 4.0**。[^5]

对 VP 的借鉴是把复杂旅行请求拆成可验证成果，减少一个 prompt 同时承担所有目标。这里的任务分类可以帮助定义 Q37 的服务范围，但不提供 VP 的扣次合同，也不证明取得了真实地图、酒店或数据权利。首期不应为每个分类再建一个独立 Agent 服务。

### 3.4 三者都不能替代的内容

这些项目主要测计划与工具使用，不能直接覆盖：免费偏好跨 Trip、同一目标多轮澄清不多扣、撤回后的排队任务、明确 Proposal 确认、已提交后取消、真人尚未接单、英文表达是否直接体贴。它们最有价值的作用是补充测试设计；VP 仍需用自己的授权场景验证完整用户路径。

## 4. 记忆与评测：复用数据方法，保留业务 Harness

### 4.1 LongMemEval 需要分清版本和任务

原作者的 `xiaowu0162/longmemeval-cleaned` 是长期记忆基准的清理版，卡片标 MIT。`mteb/LongMemEval` 是经过 LMEB 的检索派生格式；其 corpus/query/qrels 得分不能称为原基准的完整记忆能力。2026 年还出现了真正的 `xiaowu0162/longmemeval-v2`，它与旧论文 URL 中的 `v2` 修订号不同，侧重更复杂的动态 Agent 记忆。[^6]

VP 现在可借信息更新、时间适用、跨会话与“不知道时不编造”的测试思想。使用自有合成事件序列验证四个断点：记忆是否有资格、是否被选入上下文、是否正确影响答案、撤回后是否停止未来使用。单纯“检索命中”不够；“用户纠正慢节奏”也不应导致擅改已确认行程。

外部数据只用于独立诊断。第三方填充聊天和派生集各有来源链，不整包混入 VP 产品记忆或品牌调优数据。无需为跑基准新建通用画像表或向量数据库。

### 4.2 Datasets 值得复用在离线边界

[Datasets](https://huggingface.co/docs/datasets/loading) 是 Apache-2.0 的 Python 数据处理库，支持常见表格格式、固定数据 revision 等。库许可不覆盖其加载的数据；网络 streaming 也不等于离线。[^7]

最小接法是：获准外部文件 → 固定版本的离线转换 → 小份 JSONL → 现有 TS case schema。记录资源 ID、revision、原行 ID、split、language、来源条件和转换版本。只为简单 JSON 读取不必增加 Python；当重复进行 Parquet、筛选或分割时再使用库。

### 4.3 Lighteval 与 Evaluate 的位置

[Lighteval](https://huggingface.co/docs/lighteval/main/index) 适合通用模型预筛、外部任务复现及逐样本分析，当前源码为 MIT；[Evaluate](https://huggingface.co/docs/evaluate/index) 是 Apache-2.0 指标库，具体加载模块另有代码和许可。Evaluate 的入口同时提示关注 Lighteval 的维护方向。[^8]

两者均不能自动验证 VP 的 Trip 确认、RLS、费用对账或实际恢复。现阶段保留 TS Harness；有通用模型预筛需要时，在独立研究环境跑 Lighteval并回传报告。不得绕过现有 ModelGateway 给三家 API 再加一套无预算的调用入口，也不把 `evaluate.load()` 当成纯数据读取。

### 4.4 MIRACL 与 BIPIA 的正确用途

[MIRACL](https://huggingface.co/datasets/miracl/miracl) 可用于 en/zh 检索预筛；两种语言各自测试并不等于跨语言检索。语料源于历史 Wikipedia，卡片 Apache-2.0 标签不能抹掉来源内容条件，也不提供实时中国旅行事实。[^9]

[BIPIA](https://github.com/microsoft/BIPIA) 提供间接提示注入的评测思路。HF 上的 `geodesic-research/bipia` 是重打包，非微软官方 Hub 发布；不同上下文来源不能被一个总标签替代。VP 先借攻击位置和任务类别，在自有材料中加入只作为字符串处理的恶意指令，同时检查安全和正常任务有用性。[^10]

## 5. 输出语气与内容：HF 能帮助评测，不能代写品牌判断

最值得现在借用的是 [LLM-as-a-judge Cookbook](https://huggingface.co/learn/cookbook/llm_judge) 的明确量表、结构化判分和校准方法。旧 `huggingface/evaluation-guidebook` 已声明不再维护，当前入口在 [OpenEvals/evaluation-guidebook](https://huggingface.co/spaces/OpenEvals/evaluation-guidebook)。教程中的模型名称、调用方式与玩笑型提示不应原样搬进 VP。[^11]

### 5.1 建议将内容和语气拆成七个可观察维度

这是依据 VP 品牌输入提出的判分候选，不是 HF 自带的品牌模型，也不是已批准的发布阈值。

| 维度 | 正向证据 | 典型失败 |
| --- | --- | --- |
| 回应目标 | 先给适合当前请求的成果或最有价值的问题 | 大段背景知识、反复问已知信息 |
| 事实与限定 | 结论与证据/适用条件一致，未知影响明确 | 相关资料被写成已确认的当前事实 |
| 下一步 | 告诉游客可以采取的动作和所需条件 | 只有“建议核实”，不给核实对象或途径 |
| 记忆适用 | 相关的明确偏好影响选择，当前要求得到尊重 | 硬提过去、猜测画像、旧偏好覆盖当前指令 |
| 信息密度 | 根据任务风险、复杂度和偏好展开 | 简单问题长篇大论；复杂变更省略关键约束 |
| 英文自然度 | 为普通国际游客直接创作，中文表达对应 | 翻译腔、官样措辞、堆砌专业术语 |
| 情境语气 | 温暖、沉着、有分寸；幽默可以为零 | 每轮固定共情、装熟、紧急场景开玩笑 |

硬失败应独立否决：虚构已联系/已预订/已退款、未确认写 Trip、泄露他人信息、撤回后继续使用资料、无接单/处理回执却宣称真人已接手处理。这些不能被较高的语气平均分抵消。正常可答问题的过度拒绝也须记为失败。

**最小实现建议：**复用现有 prompt 版本与 #195/#206 输出路径，生成前提供允许事实、实际状态、当前任务与相关偏好；生成后检查事实/动作绑定，再由客户端显示已确认状态。表达优化不应增加一个无约束的第二模型润色阶段，避免把原本谨慎的结论改成确定承诺。

### 5.2 一个可直接用于人评的例子

假设输入只表明游客疲惫、晚餐已确认，系统尚无可核实的新路线：

- 不合格：“放心，我已经帮你安排好了最轻松的路线，今晚肯定不会赶。”
- 英文候选：“Let's keep your confirmed dinner. We can look at shortening the afternoon, but I haven't verified a new route yet. Would you rather skip one stop or consider a taxi?”
- 中文对应：“已确认的晚餐先保留。下午可以考虑缩短安排，但新路线还没核实。你更愿意少去一站，还是考虑打车？”

这里优化的是信息顺序与表达，未宣称有出租车、路线更短或已经修改 Trip。是否适合追问、能否直接给候选，还应根据实际已知信息判分。更多正常、冲突、未知、取消和真人状态样例见 [表达研究附件](brand-engineering-2026-09-10/response-evidence.md)。

### 5.3 标注与合成数据工具怎么选

少量样本先用现有 Markdown/JSON 报告。需要隐藏模型身份、随机顺序和保存反馈时，Gradio 的现成组件可减少界面工作；多人分工标注、复核和数据管理成为持续需求后，再评估 Argilla。Argilla 为 Apache-2.0，但其当前 README 招募维护者，近期提交时间不能替代维护能力判断。[^12]

Distilabel 能组织合成数据和 AI feedback，代码 Apache-2.0；上游已说明原作者转向其他项目、由社区继续维护。当前 VP 案例量较小，不建议先引入它搭大规模合成流水线；后续确有重复成本，再评估固定 release 与依赖，而不是跟随教程批量上传数据。[^13]

`HuggingFaceH4/ultrafeedback_binarized` 的卡片标 MIT，属于英文通用偏好数据。它可以帮助理解 chosen/rejected 数据结构，但不包含 VP 的品牌、任务收费、证据与确认规则。**当前先做场景样例、提示词与判分，暂不以微调或 DPO 作为改善语气的前提。** 数据卡标签也不能免去混合来源审查。[^14]

盲评需要交换 A/B 位置，允许平局与两者都失败；由人工校准 judge。开发/校准集、公开外部集和独立验收集分开；公开测试一旦用于调 prompt、挑阈值或找最佳候选，就不再是未暴露的验收集。

## 6. 中英检索模型：现成实现足够，先证明需求

### 6.1 首轮候选

| 模型 | 模型卡许可 | 可解决的问题 | 选择理由与限制 |
| --- | --- | --- | --- |
| `Qwen/Qwen3-Embedding-0.6B` | Apache-2.0 | 中英语义召回 | 小规格 Qwen embedding，支持指令与可调维度；query/document 输入方式需按卡使用 |
| `BAAI/bge-m3` | MIT | 多语言召回对照 | dense/sparse/multi-vector 是不同能力；首轮只测 dense，后端未必提供全部输出 |
| `BAAI/bge-reranker-v2-m3` | Apache-2.0 | 候选已有正确材料但排序差 | query-document 对重排，相关性分数不是事实真值 |
| `Qwen/Qwen3-Reranker-0.6B` | Apache-2.0 | 指令化重排对照 | 与 embedding 是不同模型/输入协议；不要误用 embedding 端点 |
| `jinaai/jina-reranker-v2-base-multilingual` | CC BY-NC 4.0 | 多语言重排 | 不作为 VP 免费商用替代；改用其 API 又会新增服务条款、成本和接收方 |

规格、固定 revision、更新时间与输入陷阱见 [检索专项](huggingface-reuse-2026-09-10/retrieval.md)。这些许可均按精确模型核验，不按品牌或模型家族推断。[^15]

### 6.2 使用现有库而不是手写模型包装

Sentence Transformers 提供 embedding 与 CrossEncoder 入口，适合先在独立 Python 环境验证加载、批处理与排序。TEI 提供 HTTP embedding/rerank 服务，适合有收益后进行服务化；二者代码均 Apache-2.0。Next.js 可以调用受控服务，不需要把 Python 权重加载放进页面请求，更不需要让前端持有服务密钥。[^16]

TEI 文档支持 Qwen3 embedding，并有 BGE 重排路线；本次未取得某固定版本兼容 Qwen3 reranker 的运行证据。因此不能由同系列名称推定兼容。模型卡示例与具体库版本也可能不一致，实施前需固定库版本和模型 revision 做 smoke test。

### 6.3 按失败类型只做一项对照

现有顺序仍是：合法语料与直接读取 → exact/alias 等简单检索 → 有失败证据才升级。#248 还明确要求真实需求/成本/责任证据与 JT 激活，不因出现新模型就自动开启。[^17]

| 已观察的问题 | 首个动作 | 不应做的动作 |
| --- | --- | --- |
| 合法语料中没有答案 | 补来源、审查与覆盖，或提供诚实替代 | 用 embedding 制造“知识已经存在” |
| 地名/拼音/别名没对上 | 补身份与 alias 规则 | 立即自托管大模型 |
| 正确证据已在候选池但排名差 | 固定候选池，对比 BGE 与 Qwen 重排 | 同时换索引、生成模型和 prompt |
| 确有跨语语义召回缺失 | 对比 Qwen embedding 与 bge-m3 dense | 同时加稀疏头、RRF、重排和第二数据库 |

试验前固定样本、语料、权限、版本和预算，记录 Recall/nDCG、必要 claim coverage、无答案处理、各语言结果与延迟。相关但过期、无许可、其他用户所有的材料，应证明在模型输入中就不存在。质量容差与成本上限先确定；没有实测就不承诺提升比例、内存需求或响应时间。

## 7. 材料解析与端侧运行

### 7.1 Docling 值得试，模型需单独选

Docling 的 MIT 框架提供文档布局、表格、OCR 与 JSON/Markdown 导出，可减少 #201 材料输入或内容 Ops 的通用解析工作。解析结果仍是候选，必须保留原文件 ID、页码/位置、完整性及用户校正，再进入规划或知识审查。它不能验证票据真实性或自动确认 Trip。[^18]

首轮建议只覆盖实际需要的文件类型与中英合成材料，测日期/时区、金额币种、姓名、小字和折行；加入缺页、OCR错误、重复文件与恶意指令。确认中文表现和来源位置可用后才扩格式，不一次承诺全部 PDF/URL/截图支持。

当前 `docling-project/SmolDocling-256M-preview` 的 metadata 标 CDLA-Permissive-2.0，正文 Model Summary 写 Apache-2.0，语言只标 `en`。**许可证信息冲突尚未澄清，不能将其推荐为已经准入的中文生产 OCR。** 可独立试 Docling 的其他经核实路径；框架和模型采用是两个决定。[^19]

### 7.2 Transformers.js 适合特定 Web/Node 实验

Transformers.js 为 Apache-2.0，支持 JavaScript 环境的模型推理。它可以用于将来有明确指标的本地小模型、检索或分类；不直接解决 SwiftUI 原生推理。即使本地计算，权重下载、缓存、遥测和页面外发仍要分别核查。[^20]

VP 的完整产品是 iOS，当前没有充分理由仅为 Web Studio 添加大权重和额外推理运行时。需要时先隔离 Worker，测首次下载、真实内存、取消、网络与回退，再决定是否值得接入。

## 8. Agent、插件和类似方案：借用哪一层

### 8.1 smolagents 的方法值得参考

smolagents 官方强调减少不必要的模型决策与回合，将确定逻辑放进工具。这与 VP 的受控工具方向一致：一次返回完成当前任务必需的地点、时间、路线与来源状态，避免模型自己多轮拼接。各数据源的权限与失败仍须分别保留。[^21]

`CodeAgent` 会生成并执行代码；`ToolCallingAgent` 更接近结构化工具调用，但二者都不提供 VP 的 RLS、Proposal确认或消费账本。当前不建议替换 Coordinator。只有现有工具循环的瓶颈得到实测证明，才以相同只读合成任务做隔离框架对照。

### 8.2 HF MCP 与 Skills 可以减少开发期检索工作

HF 官方提供 MCP 与 `huggingface/skills`；可选技能包括数据查看、论文读取、工具脚本和社区评测等。当前 Skills 仓库为 Apache-2.0。对 VP 最适合先考虑 `huggingface-datasets`、`huggingface-papers` 等资源发现说明；训练、Jobs、发布类工作流不属于本轮需要。[^22]

这些是经过官方文档核验的可选接入，安装和连接尚未执行。未来连接优先只读搜索与元数据；社区 Space、模型推理、云 Jobs 和上传均需分别确定操作范围。

### 8.3 公开 Space 适合作为参考，不是默认服务依赖

Gradio Space 可被包装成 API 或 MCP 工具，但其维护者、代码、模型、网络去向和许可各不相同。公开可调用不证明稳定、可商用或符合 VP 的数据要求；免费的托管资源还可能休眠。内部人评优先本机，不将旅客照片、行程或凭据上传到随机 Demo。[^23]

## 9. 最小接入结构

复用应集中在叶子组件与离线工具层。建议保持下列数据方向，所有新名称仅为说明，不新增独立平台：

```text
开发与评测侧
HF 方法 / 获准数据 / 版本元数据
  → 必要时用 Datasets 做离线转换
  → VP 自有案例 + 现有 TS Harness
  → 配对 JSON / Markdown
  → 必要时 Gradio / Argilla 人评

产品侧
获准用户输入 → 现有身份 / Turn / Context / 预算
  → 直接知识读取 / 受控检索
  → [有证据后才接 embedding / reranker]
  → Evidence + 实际任务状态 → VP 表达策略 → 真实客户端

材料侧
获准材料 → Docling 等受限解析 → 可校正候选
  → 用户校正 / 来源资格 → 现有 TripProposal / 知识审核
```

外部模型只返回向量、相关性或抽取结果；它们不拥有用户身份、最终事实状态、消费结算或 Trip writer。不同进程并不自动提供隔离，权限、超时、取消、输入限额和回执仍须在调用边界落实。

## 10. 对当前工程计划的具体调整

以下沿用既有 Issue 身份，是建议的验收差异，未写入 tracker，也未改变原生依赖。

| 工作面 | 建议调整 | 可复用资源 | 保留的验收 |
| --- | --- | --- | --- |
| #195 / #206 输出 | 把允许事实、实际状态与表达规范接入真实 producer；结果先说明帮助和下一步 | HF judge 方法、Gradio 人评组件 | 正常任务有用；不夸大事实/状态；英文与中文分别校准 |
| #267 / #268 Harness | 增加逐维语气和内容评分、A/B位置交换、两者都失败与污染记录 | Cookbook、Guidebook、必要时 Datasets | 硬安全/确认/恢复门不能被软分替代；真实运行仍需原依赖 |
| #199 / #190 / #195 记忆 | 复用已有 Memory/Profile，明确字段权威源、scope/revision、纠正与撤回，接实际消费者 | LongMemEval 的更新与跨会话方法 | Free基础偏好跨Trip可用；撤回、删除、换账号不能复活旧上下文 |
| #194 / #195 / #227 任务计量 | 明确一项服务目标关联多个Turn/attempt；用户任务额度与内部成本分账 | 通用库不替代领域合同，HF仅辅助评测 | 澄清/系统修复不多扣；并发、未知费用、取消/完成竞态有真实证据 |
| #197 / #198 / #219 / #265 计划 | 用独立约束和最终状态验证，不只评分生成文字 | TravelPlanner方法；ChinaTravel/Open-Travel结构参考 | 晚餐约束、主要步行指标、准确版本确认、重载一致 |
| #201 材料 | 做单一格式、可取消、可校正、有来源位置的解析片段 | Docling | 解析不代表供应商核验；未确认不写Trip |
| #205 / #206 / #248 知识 | 先合法内容和qrels，按失败类型决定重排或召回 | MIRACL、Sentence Transformers、Qwen/BGE | #248激活门、请求资格、时效与真实来源保留 |
| 开发工具 | 按需使用只读HF检索与资源元数据，不新增全局工程体系 | HF MCP / Skills | 独立审阅、必需CI、凭据和外发边界保持 |

Q36 和 Q37 的细节仍必须在 VP 中设计。尤其不能把旧 Ask 数字直接换成同样数量的完整服务任务，也不能把生成更长的答案当作付费价值。任务的 partial、完成后修改范围、等待 TTL 和跨期续作规则需要先明确，再实现唯一扣次路径；这些问题没有可以直接下载的通用答案。相关分析见 [服务任务附件](brand-engineering-2026-09-10/service-task-evidence.md)。

## 11. 建议的实施顺序与停止条件

**第一步：不新增运行框架，先完成两份可审查规格。** 一份是资源登记与来源条件，一份是 VP 输出/记忆/旅行测试的映射。复用已存在的12场景与模块专项，不为了外部benchmark重新扩出一套庞大任务队列。

**第二步：优先做回答质量的最小闭环。** 在现有 #267 准备范围内，用少量自有中英案例区分事实正确、状态正确、有用性与语气。候选调用前固定样本、判分和费用上限；真实 judge 调用必须经过已有获准路径。人工判分与现有报告可先行，只有实际界面瓶颈才加 Gradio/Argilla。

**第三步：为材料输入做一个可放弃的 Docling spike。** 成功条件是所选格式关键字段正确、来源位置保留、错误能被用户校正，且无未授权远程服务/插件；达不到就保留既有输入路线，不把解析工程变成首发全部格式支持。

**第四步：将有界离线准备与正式检索升级分开。** 按 ADR-0024，可以在已明确契约、公开或自有合成数据上先验证加载、输入格式和小型对照，每轮两个模型以内、只改一项变量。这不代表 #248 已激活或产品已有收益。真实知识集成、检索升级及该 Issue 验收仍须需求/成本/责任证据与 JT 开启；取得质量、资源、许可和权限结果后才决定是否服务化。

**第五步：仅在明确重复成本出现时引入更大的工具。** 批量数据加工再评估 Datasets/Distilabel，通用模型预筛再评估 Lighteval，持续多人标注再评估 Argilla。达到“可定位失败并支持下一步决策”即停止；不以安装数量、排行榜分数或公共Space演示作为进度。

收益只在以下条件同时成立时采纳：目标失败切片改善，正常任务不退化，权限/确认硬门通过，额外运行与维护成本在预算内，版本和许可可固定。当前没有 VP 实测，因此本报告不填写节省百分比、模型性能排名或精确交付日期。

## 12. 使用前必须核对的资源条件

这些条件来自本次候选的具体风险，不另建一套产品权限系统：

1. **分开登记库、权重、数据与服务条款。** HF上的许可标签是起点；同一家族、Space或教程的许可不能互相代替。卡片矛盾、来源缺失或 NC 限制未解决时不进入商业管线。
2. **固定版本再读取/执行。** repo、revision、文件路径、摘要、许可证据、依赖/容器版本与采用范围应可追。HF 的扫描不是绝对安全保证；优先安全权重格式，远程代码和 pickle 等加载路径单独审查。[^24]
3. **没有把“运行本地”误写成“无外发”。** 初次模型下载、指标加载、自动judge、遥测和公网分享分别检查；真实材料不默认进入公共缓存、结果上传或社区工具。
4. **HF并不是现有API授权的自动延伸。** Inference Providers、Endpoints、Spaces、Jobs或另一模型接收方都可能产生新的成本与数据流，不从现有DeepSeek/Qwen/GLM密钥推导授权。
5. **许可证检查与性能验证分开。** 许可较宽不代表中文可用，卡片支持某架构不代表当前设备/库版本通过，检索相关不代表事实有效。每个候选都有单独的采用与回退依据。

## 13. 当前不建议做的事情

- 用 smolagents 重写 VP Coordinator，或让 CodeAgent 直接操作业务数据库、Trip 和外部交易。
- 为了“有记忆”新增通用向量画像库，绕过既有 Memory/Profile 的权限与纠正问题。
- 用旅游数据集补成未经审核的生产 POI、营业、票价、政策或库存。
- 复制 HF RAG Cookbook 的全部 LangChain/FAISS/重排/模型依赖，跳过现有直接读取基线。
- 将 Jina NC 权重、ChinaTravel、Open-Travel 或许可冲突的 SmolDocling 默认为可直接商用。
- 直接微调通用“友好回答”数据来塑造 VP，人为强化讨好、长回答或虚构亲密感。
- 为改善语气引入无约束二次润色，让已有不确定性、拒绝或实际动作状态被覆盖。
- 让公共 leaderboard、参考题或被调优看过的holdout承担正式产品验收。

## 14. 来源、版本与交付附件

详细候选证据：[评测与记忆](huggingface-reuse-2026-09-10/evals-memory.md)、[中英检索](huggingface-reuse-2026-09-10/retrieval.md)、[工具与解析](huggingface-reuse-2026-09-10/tools-agents.md)。公开元数据快照：[工具](huggingface-reuse-2026-09-10/tool-metadata.json)、[旅行与语气数据](huggingface-reuse-2026-09-10/travel-style-metadata.json)。

### 重点资源固定快照

| 资源 | revision（短写；完整值见附件/链接） | 本日观察 |
| --- | --- | --- |
| HF Cookbook | `3485bbd3` | Apache-2.0；最后推送2026-09-09 |
| HF Skills | `97862b0f` | Apache-2.0；最后推送2026-09-08，不等于提交创作日期 |
| 原 Evaluation Guidebook | `e09b159d` | README声明不再维护，旧许可CC BY-NC-SA4；当前入口另列 |
| TravelPlanner | `8736504e` | 2024-07-14，卡标CC BY4、英文 |
| ChinaTravel dataset | `44d5dbf3` | 2026-08-20，卡标CC BY-NC-SA4、中英 |
| Open-Travel | `b997227f` | 2026-01-16，CC BY-NC4、中文 |
| Qwen3 Embedding / Reranker 0.6B | `97b0c614` / `e61197ed` | 各自Apache-2.0，具体输入方式不同 |
| bge-m3 / bge-reranker-v2-m3 | `5617a9f6` / `953dc6f6` | 前者MIT、后者Apache-2.0 |
| SmolDocling-256M-preview | `ce51f56c` | 模型卡metadata/正文许可冲突，未准入 |
| Argilla / Distilabel | `5338519a` / `313fac85` | 各为Apache-2.0，均有维护交接/招募提示 |

不同文档分支、Hub卡和 README 的冲突均按上述范围保留，没有借信息缺失推定兼容、许可或性能。采用前需再次核对相应固定版本的安全修复与授权范围。

### 一手来源

[^1]: VisePanda，[品牌定位蒸馏 Q1–Q38](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md)，2026-09-10。Q36/Q37为新接受方向，Q38保持未决。
[^2]: VisePanda，[固定工程基线](https://github.com/JTCAO515/VP-V4/tree/d4eeb084b41f8c82a1794a0f946529bb54e2d5db)、[接口合同](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/program/2026-09-05/INTERFACES.md)、[Harness](https://github.com/JTCAO515/VP-V4/tree/d4eeb084/evals/harness)。2026-09-10读取；研发状态见对应固定证据，不外推当前未合并代码。
[^3]: OSU NLP Group，[TravelPlanner 数据卡](https://huggingface.co/datasets/osunlp/TravelPlanner/blob/8736504ecfc31b7f8b7e40122873c337e83fff7c/README.md)、[原作者项目](https://github.com/OSU-NLP-Group/TravelPlanner)。2026-09-10核对；数据卡CC BY4。
[^4]: LAMDA-NeSy/NJU-IRP，[ChinaTravel 数据卡](https://huggingface.co/datasets/LAMDA-NeSy/ChinaTravel/blob/44d5dbf3bba26bdf9a212c3e76d3242b67f0d349/README.md)、[评估Space说明](https://huggingface.co/spaces/LAMDA-NeSy/ChinaTravel/blob/5eef81910a414308e0496ee0d83c1a3622655430/README.md)。2026-09-10核对；卡标CC BY-NC-SA4。
[^5]: Alibaba-NLP，[Open-Travel](https://huggingface.co/datasets/Alibaba-NLP/Open-Travel)、[固定LICENSE](https://huggingface.co/datasets/Alibaba-NLP/Open-Travel/blob/b997227fb474eb578b7b951694fd4a6bf751bafa/LICENSE)。2026-09-10核对。
[^6]: Di Wu 等，[LongMemEval原项目](https://github.com/xiaowu0162/LongMemEval)、[cleaned数据](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned)、[MTEB派生集](https://huggingface.co/datasets/mteb/LongMemEval)、[新LongMemEval-V2](https://huggingface.co/datasets/xiaowu0162/longmemeval-v2)。2026-09-10核对；版本与许可链见评测专项。
[^7]: Hugging Face，[Datasets加载文档](https://huggingface.co/docs/datasets/loading)、[源码与许可](https://github.com/huggingface/datasets)。滚动文档，2026-09-10核对。
[^8]: Hugging Face，[Lighteval](https://huggingface.co/docs/lighteval/main/index)、[Lighteval LICENSE](https://github.com/huggingface/lighteval/blob/a8007c1566710ee095e870afdccd15dbe6bc7420/LICENSE)、[Evaluate](https://huggingface.co/docs/evaluate/index)、[Evaluate Quick Tour](https://huggingface.co/docs/evaluate/a_quick_tour)。2026-09-10核对。
[^9]: MIRACL，[query/qrels](https://huggingface.co/datasets/miracl/miracl)、[corpus](https://huggingface.co/datasets/miracl/miracl-corpus)、[原作者项目](https://github.com/project-miracl/miracl)。2026-09-10核对；历史Wikipedia来源条件另核。
[^10]: Microsoft，[BIPIA](https://github.com/microsoft/BIPIA)；Geodesic Research，[HF重打包来源表](https://huggingface.co/datasets/geodesic-research/bipia/blob/003f58372e1696726b7cddde274a74bee0b1938a/README.md)。2026-09-10核对。
[^11]: Aymeric Roucher/Hugging Face，[LLM-as-a-judge Cookbook](https://huggingface.co/learn/cookbook/llm_judge)；[旧Guidebook维护说明](https://github.com/huggingface/evaluation-guidebook)、[当前OpenEvals入口](https://huggingface.co/spaces/OpenEvals/evaluation-guidebook)。2026-09-10核对；旧正文与新模板许可不能混用。
[^12]: Gradio，[ChatInterface](https://www.gradio.app/docs/gradio/chatinterface)；Argilla，[标注文档](https://docs.argilla.io/latest/how_to_guides/annotate/)、[固定维护说明](https://github.com/argilla-io/argilla/blob/5338519accb13ae422f8bf9c0642651c249c49af/README.md)。2026-09-10核对。
[^13]: Hugging Face，[Distilabel概览](https://huggingface.co/docs/hub/datasets-distilabel)；Argilla，[固定维护说明](https://github.com/argilla-io/distilabel/blob/313fac85b1a2472dd88db1a31c2b754599f46476/README.md)。2026-09-10核对。
[^14]: Hugging Face H4，[UltraFeedback binarized](https://huggingface.co/datasets/HuggingFaceH4/ultrafeedback_binarized)。Hub卡MIT、英文；固定revision `3949bf5f8c17c394422ccfab0c31ea9c20bdeb85`，2026-09-10核对。
[^15]: 发布者模型卡：[Qwen3 Embedding 0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)、[Qwen3 Reranker 0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B)、[bge-m3](https://huggingface.co/BAAI/bge-m3)、[bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)、[Jina v2 multilingual](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual)。2026-09-10核对；固定revision见检索专项。
[^16]: Hugging Face/Sentence Transformers，[模型API](https://sbert.net/docs/package_reference/sentence_transformer/model.html)、[Qwen CrossEncoder支持](https://www.sbert.net/docs/cross_encoder/usage/custom_models.html)、[TEI支持模型](https://huggingface.co/docs/text-embeddings-inference/supported_models)、[TEI Quick Tour](https://huggingface.co/docs/text-embeddings-inference/quick_tour)。2026-09-10核对，兼容性未实跑。
[^17]: VisePanda，[VPJ-50 #248](https://github.com/JTCAO515/VP-V4/issues/248)、[固定主规划](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。2026-09-10读取，公开资源不解除激活门。
[^18]: Docling，[官方仓库](https://github.com/docling-project/docling)、[高级配置](https://docling-project.github.io/docling/usage/advanced_options/)、[Pipeline配置](https://docling-project.github.io/docling/reference/pipeline_options/)。2026-09-10核对；框架MIT，模型另审。
[^19]: Docling，[SmolDocling固定模型卡](https://huggingface.co/docling-project/SmolDocling-256M-preview/blob/ce51f56c4ebe36e0b1c3a55f67b261ba22a50bf8/README.md)、[Hub metadata](https://huggingface.co/api/models/docling-project/SmolDocling-256M-preview)。2026-09-10核对。
[^20]: Hugging Face，[Transformers.js](https://huggingface.co/docs/transformers.js/en/index)、[Next.js教程](https://huggingface.co/docs/transformers.js/tutorials/next)。2026-09-10核对；库Apache-2.0，权重和设备另验。
[^21]: Hugging Face，[Building good agents](https://huggingface.co/docs/smolagents/tutorials/building_good_agents)、[安全代码执行](https://huggingface.co/docs/smolagents/tutorials/secure_code_execution)、[smolagents](https://github.com/huggingface/smolagents)。2026-09-10核对，代码Apache-2.0。
[^22]: Hugging Face，[MCP官方说明](https://huggingface.co/docs/hub/en/agents-mcp)、[Agents概览](https://huggingface.co/docs/hub/en/agents-overview)、[固定Skills](https://github.com/huggingface/skills/tree/97862b0fcc89c850fdd00c82ede1e62d3c930a6d)。2026-09-10核对；非本次已安装插件。
[^23]: Hugging Face，[Spaces概览](https://huggingface.co/docs/hub/spaces-overview)、[Spaces as MCP servers](https://huggingface.co/docs/hub/spaces-mcp-servers)。2026-09-10核对；服务、社区源码与权重许可分开。
[^24]: Hugging Face，[Pickle Scanning](https://huggingface.co/docs/hub/security-pickle)、[模型远程代码与版本](https://huggingface.co/docs/transformers/en/custom_models)。2026-09-10核对；扫描不替代来源与执行隔离审查。
