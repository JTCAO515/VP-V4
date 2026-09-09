# Hugging Face 复用研究：中英知识检索与重排

研究日期：2026-09-10。仓库读取基线：`d4eeb084`；模型、工具状态为本日在线快照。本文只提出研究结论和候选实验，没有下载权重、安装依赖、执行模型、启用向量服务、修改配置或发布 tracker。

## 结论

**VP 可以复用成熟的 embedding、reranker 和推理服务，但当前应先复用自己的直接读取、别名检索与证据合同。HF 模型不能弥补未授权、未审核或过时的旅游知识。** 品牌蒸馏 B04/B05/B11/B13 要求下一步明确、建议符合偏好、语气直接、英文自然；检索负责找对依据，生成层负责表达，两者应分别验收。

建议把 Sentence Transformers 列为未来离线实验首选，把 TEI 列为实验获益后才评估的服务化候选。模型首轮最多比较两个；不能因为“多语言”“榜单更高”就部署 GPU、第二向量库或替换现有知识链路。

## 1. 先复用仓库已有能力

| 已有位置 | 本次源码观察 | 应采取的动作 |
| --- | --- | --- |
| `lib/server/knowledge/retrieval/lexical/index.ts` | 有受限 qrels、别名/音译归一化、精确匹配和编辑距离、分语言与模式指标；这是闭集 fixture evaluator | 复用数据接口和失败切片，不能宣称已是线上 SQL 检索 |
| `lib/server/knowledge/retrieval/hybrid/index.ts` | 已有 RRF 合并、exact 优先、资格过滤和空证据状态的纯函数 | 不再写第二套融合器；该函数不等于已部署向量索引、请求级权限或模型服务 |
| `docs/program/2026-09-05/INTERFACES.md` | EligibilityReceipt 按 principal、Trip、purpose、field、recipient、region、time 计算；EvidencePack 记录 coverage/conflicts | 所有召回、重排和外发接在该合同内；公共知识与私人偏好分开处理 |
| `docs/VISEPANDA-MASTER-PLAN-2026-09-05.md` | 先结构化 claim/短全文直接读取，再按真实失败升级 exact/alias/拼音/错拼、trigram/英文 FTS、embedding/RRF | 首期保留 Postgres 作为事实与检索存储；不默认引入第二数据库 |

现有 hybrid 函数会在融合时过滤 eligible hits，但仅有 status、expiresAt、licenceAllowed 字段，**不能当作完整的请求级权限实现，也不能证明召回之前已过滤**。未来适配器必须在读取候选和发送模型前执行完整 EligibilityReceipt；重排后、展示前再检查版本与撤权。不能“全库发给 reranker，再过滤输出”。

在线 [#248 / VPJ-50](https://github.com/JTCAO515/VP-V4/issues/248) 仍 OPEN，依赖 #206 和 #207，且明定需要 VPJ-47 的需求、成本、责任证据及 JT 明确开启。依赖关闭不自动激活。当前可以在 #205/#206 整理合法语料、失败原因和 qrels，不能据本研究提前上线混合检索。

## 2. 五个模型的核验结果

参数是卡片或 API 的公开元数据，不是本机测量；context 上限不是建议默认输入长度，也不是内存或延迟保证。所有模型本日 API 均为 `gated=false`、`disabled=false`；公开下载不等于无限制商用。

| 精确模型 ID / 维护者 | 许可与适用判断 | 架构、大小、输入要点 | VP 判断 |
| --- | --- | --- | --- |
| [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) / Qwen | 模型卡 Apache-2.0 | 595,776,512 参数、BF16；Qwen3 decoder，28 层；100+ 语言，32K，32–1024 可选维度。query 使用 instruction，document 不加同样 instruction；按官方方式 pooling/normalize | 中英语义召回第一候选；先固定 1024 维，避免同时改维度与模型导致归因不清 |
| [Qwen/Qwen3-Reranker-0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B) / Qwen | 模型卡 Apache-2.0 | 同为 595,776,512 参数、BF16，decoder；卡片支持 100+ 语言、32K。使用 instruction/query/document 模板和 yes/no logits；不是普通 embedding | 有明确任务指令时的重排候选；不要复制旧教程手写第二套 logits 包装，先验证最新 CrossEncoder 支持 |
| [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) / 北京智源研究院 BAAI | 模型卡 MIT | XLM-RoBERTa encoder，约 0.6B、24 层；1024 维、8192 tokens、100+ 语言；dense/sparse/multi-vector 三能力；查询不必加 instruction | 语义召回对照。首轮只测 dense，不能把卡片的 sparse/ColBERT 能力理解为任意推理后端都会输出这些结果 |
| [BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) / BAAI | 此精确模型的卡片为 Apache-2.0，不应因 bge-m3 是 MIT 就照抄许可 | 567,755,777 参数，API 权重 F32；XLM-RoBERTa sequence classifier；中英/多语言 query-document 对输出相关性分数。示例按短输入运行，config 位置容量为 8194，不能据此宣称 VP 已验证 8192 长文重排 | 不需改变首阶段检索的重排首选；相关性分数不是“事实真实概率” |
| [jinaai/jina-reranker-v2-base-multilingual](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual) / Jina AI | CC-BY-NC-4.0；卡片限定研究/评估，商业使用转向其 API/市场服务 | 278,437,633 参数、BF16，定制 XLM-RoBERTa，1024 context、长文滑窗；多语言；提供 ONNX/JS 路径，Python 示例要求 `trust_remote_code=True` | 有吸引力但不作为 VP 免费商用替代。API 另有成本、接收方、地区与保留条款，本次未采购或授权 |

上述卡片未给出可用于 VP 的旅游知识覆盖保证。MIT/Apache 标签仅是模型许可线索，接入前仍要固定权重/代码版本、保留必要声明并核训练数据与使用限制；不得把模型许可转用为酒店、地图、原文和用户材料许可。

### 可复查版本

以下通过 HF `/api/models/{id}` 读取 `sha` 与 `lastModified`，并只读取该 revision 的 config/文件清单；未下载权重。日期是仓库最后修改时间，不等于模型重训时间。

| 模型 | 固定 revision / 文件页 | lastModified（UTC） |
| --- | --- | --- |
| Qwen3-Embedding-0.6B | [97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/tree/97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3) | 2026-04-20 02:45:58 |
| Qwen3-Reranker-0.6B | [e61197ed45024b0ed8a2d74b80b4d909f1255473](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B/tree/e61197ed45024b0ed8a2d74b80b4d909f1255473) | 2026-04-16 08:55:59 |
| bge-m3 | [5617a9f61b028005a4858fdac845db406aefb181](https://huggingface.co/BAAI/bge-m3/tree/5617a9f61b028005a4858fdac845db406aefb181) | 2024-07-03 14:50:10 |
| bge-reranker-v2-m3 | [953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e](https://huggingface.co/BAAI/bge-reranker-v2-m3/tree/953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e) | 2024-06-24 14:08:45 |
| Jina v2 multilingual | [9cfeff2df7d40d1b78e75e5e9cebec92a99813c9](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual/tree/9cfeff2df7d40d1b78e75e5e9cebec92a99813c9) | 2025-10-21 05:59:46 |

注意三处资料陷阱：Qwen embedding 卡片的 CPU/GPU TEI 示例镜像标签与描述疑似对调，应以 TEI 对应版本官方说明为准；Qwen reranker 卡片为 32K，而 config `max_position_embeddings=40960`，本研究保守按 32K；bge-m3 该 revision 的权重清单为 PyTorch `.bin` 与 ONNX，未见 safetensors，不能因为同系列模型有就声称它也有。未来先核加载器安全方式，避免未经审查的远端代码或任意反序列化。

## 3. 可省掉的工程：加载、pooling、批处理与服务协议

| 轮子 | 可直接复用 | VP 接入与边界 |
| --- | --- | --- |
| [Sentence Transformers](https://github.com/huggingface/sentence-transformers) | Apache-2.0；embedding 的 encode/similarity、CrossEncoder 的 predict/rank、固定 revision，减少自写 pooling/排序代码 | 离线 Python 实验首选。研究工具与 Next.js runtime 分离；不为跑一个评测改应用语言或把 Python 模型塞进请求函数 |
| [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) | Apache-2.0；已有 HTTP `/embed`、`/v1/embeddings`、`/rerank`，可用 server-side fetch 调用；服务端负责 batching | 只有实验显示净收益再比较部署。Next.js 保存受控服务地址、超时、取消、输入限额、model/index revision，不把密钥或私有知识送前端。无需为了 HTTP 调用另加大框架 |

Sentence Transformers 的 [API](https://sbert.net/docs/package_reference/sentence_transformer/model.html) 支持 `revision`、`trust_remote_code` 和 CPU/CUDA/MPS 设备选择；其 [CrossEncoder 文档](https://www.sbert.net/docs/cross_encoder/usage/custom_models.html) 明确覆盖 Qwen decoder + LogitScore。应锁定实际试验版本再 smoke test；不能用旧版本号加一段当前示例就声称兼容。

TEI [支持列表](https://huggingface.co/docs/text-embeddings-inference/supported_models) 明确列 Qwen3 embedding 和 XLM-RoBERTa， [Quick Tour](https://huggingface.co/docs/text-embeddings-inference/quick_tour) 有 BGE reranker HTTP 示例。**本次没有获得 Qwen3-Reranker-0.6B 在 TEI 某固定版本上的运行证据，不能由“支持 Qwen3 embedding”推导为“支持其 reranker”。** 第一轮 Qwen reranker 使用已文档化的 Sentence Transformers/Transformers 路径。

工具源码快照：TEI [e2e051afda1dbc8993979feae5f061eba80900d3](https://github.com/huggingface/text-embeddings-inference/tree/e2e051afda1dbc8993979feae5f061eba80900d3)，2026-09-08 07:37:47 UTC；Sentence Transformers [3e26339ab6365d27b360b15ab90284ad6ee4fa94](https://github.com/huggingface/sentence-transformers/tree/3e26339ab6365d27b360b15ab90284ad6ee4fa94)，2026-09-08 10:45:08 UTC。来自 GitHub API，不表示这些 main SHA 已是经过 VP 验证的稳定发行版；实施时另锁 release/容器 digest。

设备方面，TEI 还有 [Apple Metal 本机路线](https://huggingface.co/docs/text-embeddings-inference/local_metal)，但存在该路线不等于上述全部模型都能在当前 Mac 达到交互延迟。CPU、小批次、截断策略与 Metal/CUDA 的实际 RAM、VRAM、速度、冷启动均 UNRUN；本文不提出 GPU 采购或每请求成本数字。

## 4. 最小实验：按失败类型选两个候选

这是一份候选试验规格，不是产品升级授权。按 ADR-0024，明确契约和范围后，可先用公开或自有合成数据做有界加载、输入协议与小型离线对照；这些准备不代表 #248 激活或产品收益。使用真实知识链路的集成、升级和 #248 验收仍保留原激活门，先在 #205/#206 的已许可、已审核、仍有效语料中产生 qrels，记录权限版本和语料 revision。不能用模型自己生成的答案同时当正确答案，不得把审核前研究目录整包作为模型知识库。

1. **诊断 baseline**：区分“答案不在合法语料”“实体别名漏了”“候选集中已有答案但排名差”“英文提问/中文证据语义召回失败”。前两类分别补内容/别名，不部署新模型。
2. **若主要是排名差**：C0 是现有直接/词法 baseline；C1 用 `BAAI/bge-reranker-v2-m3`；C2 用 `Qwen/Qwen3-Reranker-0.6B`。每条 query 对同一份至多 20 个 eligible candidates 重排。固定生成模型和提示词，先验收排名再观察最终答案，避免归因混淆。
3. **若主要是召回缺失**：改为只比较 `Qwen/Qwen3-Embedding-0.6B` 与 `BAAI/bge-m3` 的 dense 向量，均 1024 维，与同一 exact/alias baseline 对比；第一轮不同时加 reranker、稀疏头、ColBERT 或新向量库。小评测集可离线直接算相似度，取得证据后再考虑 Postgres 索引。

首轮建议人工标注 60 个 query（zh/en 各半）用于发现问题，不视为发布样本量：实体/别名、跨语种、用户约束、时间/例外、矛盾/撤权、无答案各 10 条，另设独立 holdout 后验收。测试文本优先合成且不含个人资料；事实 qrels 必须来自有依据的审定内容。按请求资格预过滤，故意放入“高度相关但过期/无许可/其他用户所有”的诱饵，证明它们在模型输入中也不存在。

### 采用与停止规则（建议在试验前冻结）

- 采用须同时满足：两种语言的目标失败切片改善；Recall@20、nDCG@5、无答案处理与 claim coverage 不出现不可接受回退；候选到 EvidencePack 的来源/版本绑定保持有效；总延迟和成本落在已有任务预算内。
- 可用作首轮筛选建议的门槛：目标切片 nDCG@5 比 baseline 绝对提高至少 0.05，整体不下降，权限泄漏/过期事实被误当有效证据为 0。该数值是待冻结的实验标准，并非项目已接受门禁，也不是模型预计提升。小样本“无回退”不能替代 holdout 与真实任务验收。
- 如果修好别名后收益消失、证据本来不存在、只提升平均榜单而 zh/en/无答案切片退步，停止。若部署或运行成本超预算、许可不清、版本不能固定、撤权无法立即生效，也停止，并保留直接 lookup 回退。
- 权限不通过须直接拒绝/部分回答；不要退回发送更大上下文给另一家模型。reranker 高分只说明相关，不能推翻时效、例外、反证或人工审核。

## 5. 对品牌表达优化的直接作用

检索不是拟人化或文风训练器。品牌 B11 的温暖、直接、专业应在 #195/#206 的输出合同和 Harness 中验证；从检索输入起只取完成任务所需证据与明确相关偏好，保留 uncertainty、reason、next step 的信息，不让检索器为营造温暖而塞入无关记忆。

例：用户问“我有点累，今晚怎么调整”，检索应支持已确认晚餐、当前允许使用的步行偏好、可靠交通信息和仍可行备选；当证据不足时输出核实方法。不要靠 embedding 相似度暗中覆盖用户当次指令，也不要说已经联系、预订或保证营业。输出最终质量需要单独检查“下一步是否可做、是否引用正确偏好、英文是否原生自然、是否过度承诺”，不是只看检索分数。

## 6. 验证与未运行项

- PASS：读取 AGENTS、CONTEXT、工作流、现有 lexical/hybrid 源码、Knowledge 接口与 VPJ-15/16/17/50 执行条目；读取在线 #248；核验五张模型卡、HF metadata/config/文件清单、工具官方文档及 GitHub metadata。
- 已知局限：GitHub 未认证 API 查询曾触发限流，后以既有 `gh api` 只读完成工具 SHA/许可核验。卡片/元数据未提供完整商业服务条款；公开榜单均未当 VP 结果。两份固定 revision config 页面在网页工具读取失败，但原始公开 config 的只读 HTTP 获取成功。
- UNRUN：模型加载和 embedding/rerank 推理、权重扫描、安装兼容性、中文/英文 qrels 基准、Mac/CPU/GPU 资源与延迟、TEI 具体模型兼容、线上服务、真实 RLS/撤权、费用、商业采购、CI 和产品验收。此报告不关闭 #248 或任何运行 Issue。
