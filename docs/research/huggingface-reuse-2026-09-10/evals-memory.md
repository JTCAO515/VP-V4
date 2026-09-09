# Hugging Face 可复用评测与记忆资源

研究日期：2026-09-10。VP 代码固定 `d4eeb084b41f8c82a1794a0f946529bb54e2d5db`。只读核对官方文档、Hub API / 数据卡及原作者仓库；没有安装库、下载数据主体或权重、执行数据集代码、调用模型、提交数据或修改 tracker。所有兼容性、效果、延迟、成本与真实业务验收均为 **UNRUN**。

## 结论

**立即借用评测设计与数据格式；按需加离线转换器；保留现有 TypeScript Harness。** 现有 `evals/harness/pairing/index.ts` 已有版本/hash、同条件配对、确定性与质量分开、缺失项 NOT_RUN 和人工校准门。本次最大的收益是补齐“测什么”和反例，换一套 Python runner 不会自动接通真实 Trip、记忆授权或知识链路。[当前 pairing](https://github.com/JTCAO515/VP-V4/blob/d4eeb084/evals/harness/pairing/index.ts)、[已有表达研究](../brand-engineering-2026-09-10/response-evidence.md)、[已有记忆研究](../brand-engineering-2026-09-10/memory-evidence.md)

以下“现在用”指可采用方法或开始独立准备，不代表已集成、许可审查全部完成或真实验收通过。

## 八项精选及取舍

| 资源、原发布者与定位 | 当前取舍 | 最小接入与不适用范围 |
| --- | --- | --- |
| **HF Evaluation Guidebook**：Hugging Face 作者团队；现入口 `OpenEvals/evaluation-guidebook` | **现在用方法** | 用于 #267 的评分设计、人工校准和污染登记；无需 Python。用现有 JSON/Markdown 报告，不建新的 judge 平台。不是旅游语料或可直接套用的品牌人格 prompt。 |
| **Datasets**：`huggingface/datasets`，HF 官方 Python 数据处理库 | **有条件试：离线导入** | 数据需要筛选/Parquet转换时，在独立 Python 环境读取固定 revision，导出小份 JSONL 供 TS Harness消费；纯 JSON/TSV 时标准库足够。不加到 Next.js 在线请求链。 |
| **Evaluate**：`huggingface/evaluate`，HF 官方指标库 | **暂不作为新主干** | 确实需要某个现成指标时，把已生成的非敏感输出交给离线 Python 进程，回传结构化分数。现有布尔断言、业务状态与自然语气不应替换成 BLEU/ROUGE 单分数。 |
| **Lighteval**：`huggingface/lighteval`，HF 官方模型评测框架 | **有条件试：模型预筛** | 未来有跨模型通用基准复现需求时，用独立 Python CLI 输出逐样本结果，附回现有报告；不会替代权限、持久化、确认、恢复的集成测试。当前不为三家 API 再造第二层模型路由。 |
| **LongMemEval 原作者数据**：`xiaowu0162/longmemeval`；清理版 `xiaowu0162/longmemeval-cleaned`；Di Wu 等 | **现在借方法；有条件用数据** | 把跨会话、更新时间、信息不足不答映射成 VP 的自有合成反例；需要外部可比性时单独跑 cleaned 英文集。JSON 可由 TS 读取；原作者自动评分器为 Python 且调用外部 judge。不能拿原始聊天直接当 VP 用户记忆或旅游知识。 |
| **MTEB LongMemEval 派生集**：`mteb/LongMemEval`，MTEB；经 `KaLM-Embedding/LMEB` 派生 | **有条件试：检索诊断** | corpus/query/qrels 可诊断 embedding/reranker 的召回，必要时离线转换 Parquet。不能将其检索分数声称为原 LongMemEval 完整记忆得分，更不能证明撤回/删除/RLS。当前 VP 首先补消费资格，未证明需要向量记忆库。 |
| **MIRACL**：`miracl/miracl` + `miracl/miracl-corpus`，MIRACL 原项目团队 | **有条件试：中英检索预筛** | 选择 en / zh 的现成 query/qrels 评估检索与重排，用固定语料和检索配置；TS可读TSV/JSONL，Python按需。它测试多语言检索，单独跑 en、zh 不等于跨语言检索，也不测生成答案、品牌语气或实时营业事实。 |
| **BIPIA**：原作者 `microsoft/BIPIA`；HF重打包 `geodesic-research/bipia` | **现在借攻击分类；数据有条件试** | 用自有合成文档在开头/中间/末尾插入恶意指令，测正常任务是否完成且没有越权；TS直接扩既有测试。重打包样本不可直接当生产知识、prompt示例或可执行代码。 |

## 一手证据与许可核对

### 1. Evaluation Guidebook：优先借评价方法

旧 [HF GitHub README](https://github.com/huggingface/evaluation-guidebook) 明确不再维护，指向 [OpenEvals Space](https://huggingface.co/spaces/OpenEvals/evaluation-guidebook)。新正文强调评测只是能力代理、按产品任务定制、优先可解释功能验证并留意污染。这支持 VP 保留业务硬断言，另测有用性和语气；不是“LLM judge 判好就上线”。[当前正文](https://huggingface.co/spaces/OpenEvals/evaluation-guidebook/blob/c7ddebad779a8bcef006f9e0ab2caa1f896df346/app/src/content/article.mdx)

- 版本：Space `c7ddebad779a8bcef006f9e0ab2caa1f896df346`；Hub `lastModified=2025-12-04`。[API](https://huggingface.co/api/spaces/OpenEvals/evaluation-guidebook)
- 许可：旧 GitHub [LICENSE](https://github.com/huggingface/evaluation-guidebook/blob/e09b159dddd03498e44929fc45bd581c94c13c7f/LICENSE) 是 **CC BY-NC-SA 4.0**；新 Space [根 LICENSE](https://huggingface.co/spaces/OpenEvals/evaluation-guidebook/blob/c7ddebad779a8bcef006f9e0ab2caa1f896df346/LICENSE) 是 **CC BY 4.0**，署名为模板作者 Thibaud Frere。不能默认为旧文章、所有图表和第三方引用已统一改许可。本建议只引用来源并独立设计 VP rubric；完整复制正文/模板的许可范围仍未确认。
- 不需要运行 Space，也不上传用户答案供其演示。远程 judge 会新增模型接收方，必须沿已有权限与预算；方法阅读本身不需要外发数据。

### 2. Datasets：复用数据搬运，不复用运行控制

官方支持本地/Hub JSON、JSONL、TSV/CSV、Parquet和固定 revision，适合一次性整理外部评测集。[库](https://github.com/huggingface/datasets)、[加载文档](https://huggingface.co/docs/datasets/loading)

- 仓库 HEAD：`110d2de7c2dde9de691979507f4a32a999699e99`（本日 `git ls-remote` 观察）；代码 [Apache-2.0](https://github.com/huggingface/datasets/blob/110d2de7c2dde9de691979507f4a32a999699e99/LICENSE)。**库许可不覆盖任何被加载的数据集。**
- 提案：固定数据 repo/commit/文件路径后，导出 `{sourceId, sourceRevision, sourceRowId, split, language, input, expected, tags}` 和转换脚本hash。保留来源行id、数据许可及改动说明；输出接到现有case格式，不改生产库。
- 只加载审阅过的纯数据文件；不为旧教程开启任意远程数据脚本或降级安全行为。Streaming仍有网络读取，不等于离线；预取获准文件后离线运行。缓存可能保存原始文本，真实用户数据不得混入公开数据缓存或 Hub 上传流程。

### 3. Evaluate：不能用熟悉度指标替代业务验收

官方把它分成 metric / comparison / measurement，`evaluate.load()` 加载的是独立 Python 模块，包含社区模块；模块本身有各自许可。[官方 quick tour](https://huggingface.co/docs/evaluate/a_quick_tour) 官方入口同时推荐关注更活跃的 Lighteval。[维护方向](https://huggingface.co/docs/evaluate/index)

- HEAD：`a7dd338386a4fae9a1767e05eb9ef9479513d9e8`；主库 [Apache-2.0](https://github.com/huggingface/evaluate/blob/a7dd338386a4fae9a1767e05eb9ef9479513d9e8/LICENSE)。具体指标、模型权重、依赖和数据许可分别核对。
- `evaluate.load()`不是只读取一个分数定义；要按下载并执行第三方模块审查，固定revision。只计算已审核的本地指标不必发送文本；神经指标可能下载权重，外部judge或上传功能另有接收方。
- VP当前没有必要为计算成功率或0/1/2 rubric引入该库。字符/词重叠高不证明不编造、不越权或英文自然；空泛长文也可能获得更高相似度。

### 4. Lighteval：适合研究候选模型，不接管 VP

官方可定义自有任务/指标，保留逐样本结果，支持多个模型后端；当前 README 首选 `inspect-ai` 后端，也保留 LiteLLM 等入口。[上游](https://github.com/huggingface/lighteval)、[自定义任务](https://huggingface.co/docs/lighteval/adding-a-custom-task)

- HEAD：`a8007c1566710ee095e870afdccd15dbe6bc7420`；[MIT](https://github.com/huggingface/lighteval/blob/a8007c1566710ee095e870afdccd15dbe6bc7420/LICENSE)。任务代码、数据和权重另计；README的Mac支持描述不是本机安装验证。
- 最小尝试应先复用离线输出或小份公开测试，单独记录工具与依赖版本。若让其调用API，不能绕过既有ModelGateway的数据/成本控制；做不到就只保留离线预筛。
- 不自动登录Hub、上传结果或启用推理provider；不把默认任务包里所有代码当可信。新的Python/后端依赖是否节省开发量，本次 **UNRUN**。

### 5. LongMemEval：原始、cleaned、新 V2 是三件事

原作者明确官方清理版用于修正干扰，原基准分信息提取、跨会话、知识更新、时间推理及abstention，支持将自己系统的输出写为JSONL再评分。[原作者仓库](https://github.com/xiaowu0162/LongMemEval) 原评分示例调用外部 OpenAI judge并保存日志；不得直接带真实用户历史照跑。

| Hub准确ID | 数据许可与本日元数据 |
| --- | --- |
| `xiaowu0162/longmemeval` | 卡标 MIT；2025-09-19；`2ec2a557f339b6c0369619b1ed5793734cc87533`。[API](https://huggingface.co/api/datasets/xiaowu0162/longmemeval) |
| `xiaowu0162/longmemeval-cleaned` | 卡标 MIT；2025-09-19；`98d7416c24c778c2fee6e6f3006e7a073259d48f`。[卡](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned)、[API](https://huggingface.co/api/datasets/xiaowu0162/longmemeval-cleaned) |
| `xiaowu0162/longmemeval-v2` | 卡标 Apache-2.0；2026-05-17；`f152293e235517d504809563c833d7190b8c713b`。[API](https://huggingface.co/api/datasets/xiaowu0162/longmemeval-v2) |

**真正的新 LongMemEval-V2** 是2026年的agent记忆基准，不是旧论文的 `2410.10813v2` 版本号。新项目侧重web/enterprise多模态轨迹、动态状态、工作流及错误前提；完整环境涉及Python、模型服务、截图和外部judge。[新原作者仓库](https://github.com/xiaowu0162/LongMemEval-V2) VP现在只借“撤回后旧前提失效、状态更新、重复任务流程”的设计，暂不引入整套；网页轨迹表现不能推定旅行陪伴表现。

许可边界：数据卡是发布者的许可声明，不替第三方来源逐条担保。原项目自定义历史还会引入ShareGPT/UltraChat填充会话；本次没有审清该自定义来源链，**不建议下载或复用其填充语料**。首选自造无个人数据的中文/英文事件序列：跨Trip明确偏好、本次覆盖、纠正版本、排队后撤回、删除后摘要不复活、A登出B登录。记录记忆资格、检索命中、Context入选、回答使用四个断点，不只记“答对”。

### 6. MTEB派生版：检索分数不是完整记忆分数

`mteb/LongMemEval`卡明示 `annotations_creators: derived`，源为 `KaLM-Embedding/LMEB`；格式含corpus/query/qrels/top-ranked，定位text-to-text retrieval。其链接回原cleaned集不意味着与原数据结构、分割和指标等价。[数据卡](https://huggingface.co/datasets/mteb/LongMemEval/blob/9dc1a8fdcf9b5676f87c2cdccac021988f6ff5af/README.md)

- 许可卡标 **MIT**；2026-05-11；`9dc1a8fdcf9b5676f87c2cdccac021988f6ff5af`。[API](https://huggingface.co/api/datasets/mteb/LongMemEval)
- 原始发布归 Di Wu 等；此格式归 MTEB/LMEB派生链。若比较结果，必须标出此ID、检索任务和固定revision；不能写“LongMemEval全任务通过”。
- VP若尚未决定向量检索，先不跑。未来只用来区分“没检索到”与“检索到却读错”；权限过滤、撤回新鲜度、跨用户隔离仍由VP自己的测试证明。第三方模型embedding请求同样是文本外发。

### 7. MIRACL：中英RAG的检索层复用

原项目提供多语言查询与相关性标注，语料来自不同日期的Wikipedia切段。[topics/qrels卡](https://huggingface.co/datasets/miracl/miracl/blob/main/README.md)、[corpus卡](https://huggingface.co/datasets/miracl/miracl-corpus/blob/main/README.md)、[原项目](https://github.com/project-miracl/miracl)

- `miracl/miracl`：卡标 **Apache-2.0**；2024-12-29；`5be20db9509754dadad47689368639fcec739c00`。[API](https://huggingface.co/api/datasets/miracl/miracl)
- `miracl/miracl-corpus`：卡标 **Apache-2.0**；2023-01-05；`d921ec7e349ce0d28daf30b2da9da5ee698bef0d`。[API](https://huggingface.co/api/datasets/miracl/miracl-corpus)
- 卡标许可不能抹掉Wikipedia源内容的署名/共享等原始条件；批量再分发或生产使用前需按源dump与文章核对。本次只建议评测准备，不将历史百科写入VP production Knowledge，也不视为已审核POI事实。
- 用en/zh分别观察Recall@k、nDCG@k及错误例。小候选池必须标“VP子集诊断”，不能拿它与全语料排行榜直接比较；跨语问答、地名音译、营业时刻更新需VP专用中英案例补充。

### 8. BIPIA：借边界攻击法，避免镜像许可误判

原作者 `microsoft/BIPIA` 评估间接提示注入；上游代码 **MIT**，HEAD `a004b69ec0dd446e0afd461d98cb5e96e120a5d0`。原README明确Web QA与Summarization因许可需阅读原站条款并自行取数。[上游](https://github.com/microsoft/BIPIA)

HF `geodesic-research/bipia` 是 **Geodesic Research重打包，不是Microsoft官方Hub发布**；2026-08-11；`003f58372e1696726b7cddde274a74bee0b1938a`。[API](https://huggingface.co/api/datasets/geodesic-research/bipia) 卡给三类上下文的来源：email/OpenAI Evals MIT、table/WikiTableQuestions CC BY-SA4、code/Stack Overflow CC BY-SA4；自身标CC BY-SA4，保留逐源要求。[许可和来源表](https://huggingface.co/datasets/geodesic-research/bipia/blob/003f58372e1696726b7cddde274a74bee0b1938a/README.md)

提案：借攻击分类，在VP自有合成检索片段、用户上传文档或旧偏好中嵌入“改行程/泄露其他用户/发送密钥/忽略确认”等恶意文字。所有攻击只作字符串输入，绝不执行sample里的code、URL或命令。成功条件同时要求原任务有用性与不越权；全拒答不能掩盖产品不可用。固定开发集与独立新攻击族；镜像现有`train`名称不自动提供未污染测试集。

## VP接入顺序与停止条件

1. **#267评测准备优先。** 扩展已有报告的评分维度：任务解决、证据/限定、下一步、记忆适用、信息密度、英文自然与情境语气。中文/英文分别记录；安全或状态硬失败独立否决，不被语气均分抵消。先用小份自有合成输出校准中英人工评分；样本数与门槛在候选调用前冻结，本报告不编造分数线。
2. **#199/#195用LongMemEval方法补记忆反例。** 沿现有Memory/Context读取资格和使用收据接线；不为记忆benchmark另建数据库。`当前明确输入 > 当前Trip偏好 > 允许的基础长期偏好`只是候选选择原则，不能覆盖安全、权限或已确认Trip事实。真实接线前结果仍是fixture。
3. **#206检索候选确定后再试MIRACL。** 公共检索预筛与VP真实授权知识评测分开报告；用对照查召回与重排收益，不替换知识许可/时效门。
4. **安全反例并入现有12场景或模块专项。** 复用BIPIA攻击位置与任务恢复方法，覆盖输入注入、证据不足部分回答、撤回/取消与失败恢复。不要为每个外部benchmark新增一套agent平台或扩大Program。
5. **存在重复数据处理成本时才加Datasets；通用模型选择需求成立时才加Lighteval。** Evaluate暂不新增依赖。停止条件是形成可复现、可定位失败的对照报告，而非“安装了更多工具”。

## 表达优化如何验收

以下是根据品牌研究制定的VP候选方法，不是HF工具自带的已验证能力：采用盲名成对比较，交换A/B顺序，保留平局与逐句理由；评分员先核对真实输入/证据/状态，再看自然度。用同一事实的好/坏表达反例测试评分器，防止偏爱更长答案、固定共情开头或玩笑。不能让judge把温暖语气当成事实可靠；在取消、急迫或未知状态下，清楚说出实际结果优先。

三类数据严格分开：公开外部集用于学习/诊断；VP开发与人工校准集用于改prompt；独立新验收集只用于冻结版本后的评估。公开测试集只要参与调prompt、挑例或阈值选择，就登记为已暴露；不能重新命名成holdout后称盲测。测试集公开也可能已进模型训练，结果仅是观察信号。MIRACL不能证明答案忠实，LongMemEval不能证明删除，BIPIA不能证明RLS，Guidebook不能证明品牌接受度。

## 实际验证记录

- **已做：** 固定VP HEAD读取，相关Harness/品牌研究比对；官方文档、Hub卡、metadata API、原作者README/LICENSE核对；GitHub Git transport获取库HEAD。GitHub匿名REST因rate limit返回403，改用只读Git transport读取commit，没有凭据回显。
- **UNRUN：** 库安装与macOS兼容、数据主体下载/解析、第三方数据内容全量审计、模型/embedding/judge调用、费用/时延/质量实测、生产/用户记忆/权限/Trip运行验证。
- **本日观察不是永久保证：** 上述SHA固定本次资源身份；更新后必须重新审代码、数据来源和许可。不把Hub标记、排行榜或模板默认配置当作项目授权。
