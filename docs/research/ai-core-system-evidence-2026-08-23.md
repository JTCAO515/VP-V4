# VisePanda AI Core 第四轮整体复核证据底稿

- 核验日期：2026-08-23（Asia/Shanghai）
- 适用仓库：`JTCAO515/VP-V4@2dec7b0`
- 历史参考：`JTCAO515/VP-Final@b5ef081`
- 状态：**一手资料与仓库证据；不代表任何运行能力、外部合同或产品发布已完成**
- 配套输入：[模型层规划](../model-layer-plan.md)、[外部数据规划](../external-data-chatbot-plan.md)、[知识/RAG/Explore 规划](../knowledge-rag-explore-plan.md)

---

## 1. 本轮重点结论

1. DeepSeek 已于 2026-08-21 在官方 API 上线视觉实验模型 `deepseek-v4-flash-vision-exp`；基础 `deepseek-v4-flash` 仍是文本路由。二者必须作为不同 model capability 注册，不能只看“V4 Flash”产品名。
2. Vision Exp 支持 JPEG/PNG/GIF/WebP、OpenAI Chat Completions、Responses API 与 Anthropic API 图片输入；官方仍明确标记 experimental。
3. Vision Exp 会按尺寸把图片转为 token，大图缩小到约 800×800，每图上限约 384 token。它适合截图理解和通用视觉 eval，但不能未经对测就替代面向小字、金额、地址和版面的专用 OCR。
4. DeepSeek 视觉上线改变的是“视觉候选池”，没有改变 STT/TTS/专用机器翻译需求；Qwen Audio、Qwen-MT 和专业 OCR 仍需保留。
5. 三轮规划的核心边界一致：模型只提出 `TripProposal`，确定性服务只在用户确认后应用 `TripPatch`；外部数据和知识事实都必须通过许可、资格、版本和 freshness 门。
6. VP-V4 当前仍只有 Next.js 落地页；旧 VP-Final 的领域契约可参考，但旧 monorepo、服务层和 Explore 不应整体复制。
7. 新系统首发应采用一个 Next.js 模块化单体 + Supabase Postgres/Storage/RLS/pgvector/Queues，而不是立即恢复旧多应用 monorepo或拆微服务。

---

## 2. DeepSeek 多模态纠正

### 2.1 官方发布事实

DeepSeek API Change Log 的 2026-08-21 条目写明：

- 新模型名：`DeepSeek-V4-Flash-Vision-Exp`；
- API 参数：`model='deepseek-v4-flash-vision-exp'`；
- 定位：multimodal vision understanding model；
- 纯文本能力官方称与正式 `DeepSeek-V4-Flash` 相当；
- 官方状态：experimental。

来源：

- [DeepSeek API Change Log](https://api-docs.deepseek.com/updates/)
- [DeepSeek Vision Guide](https://api-docs.deepseek.com/guides/vision)
- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

### 2.2 API 能力与限制

| 项目 | 官方当前值 | 工程含义 |
| --- | --- | --- |
| Vision model ID | `deepseek-v4-flash-vision-exp` | 与文本 `deepseek-v4-flash` 分开注册 |
| 图片格式 | JPEG、PNG、GIF、WebP | 服务端仍需 magic/MIME/恶意文件检查 |
| 输入方式 | base64、外部 URL、Files API `file_id` | 旅行者私图优先短 TTL upload；不默认公开 URL |
| OpenAI 协议 | `image_url` / Responses `input_image` | adapter 必须做 vision conformance |
| Anthropic 协议 | `image` block | 不能假设两种协议字段完全相同 |
| 单 inline/URL 图片 | 最大 32 MiB | 产品应设更低移动端上限 |
| Files API 图片 | 最大 64 MiB | Files API retention/删除需另验 |
| 每请求图片数 | 最大 600 | VisePanda 不应暴露如此高的业务上限 |
| 图像维度 | 单边最多 8192 px；15 图以上降至 4096 | 入口限制与压缩策略必须确定性 |
| 图像 token | 每图约上限 384；大图约缩至 800×800 像素量 | 细小文字 OCR 可能丢失，需专用 OCR 对照 |
| 图片消息角色 | 仅 user；system/assistant 图片返回 400 | provider adapter 要前置拒绝非法 envelope |
| 正式状态 | experimental | 只能 shadow/canary/feature flag |

### 2.3 当前价格快照

2026-08-23 官方英文价格页把 Vision Exp 与 Flash 列为相同 token 单价和 2500 concurrency；图片 token 与文字 input token 一起计费。价格存在峰谷时段并会变化，因此只能进入 versioned price registry，不能写死为长期预算。

### 2.4 对 VisePanda 的裁决

- `grounded_answer`、`turn_plan` 继续使用文本 `deepseek-v4-flash`；
- `vision_candidate` 让 Vision Exp 与 Qwen 3.7 Plus 同集对测；
- `ocr_translation` 继续以 Qwen 3.5 OCR 为专用基线，Vision Exp 作为 shadow challenger；
- POI 识别是可选项，可较早开放小流量 canary；
- 菜单金额、地址、站名、过敏词的 OCR 是必选高风险路径，Vision Exp 未通过 fixture 前不能替换；
- 不调用用户密钥做本轮验证，真实账户可用性、账单、region、retention 均保持未验证。

---

## 3. 当前仓库与历史实现证据

### 3.1 VP-V4 当前状态

- `main` 与 `origin/main` 均为 `2dec7b0`；
- Next.js 16.2.6、React 19.2.6、strict TypeScript 5.9.3、Tailwind 4.2.1；
- 只有公开落地页、组件、本地多语 copy 和静态测试；
- 不存在 Supabase client、migration、Auth、Chat API、Trip 状态、RAG、Explore、模型 adapter、外部 API 或多媒体 runtime。

### 3.2 VP-Final 可复用不变量

- `TripPatch` 为判别联合并由纯函数应用；
- versioned Trip service 已证明乐观版本和 patch audit 的价值；
- model router、knowledge eligibility、Fact evidence/review/expiry、Content AI private Change Set、bulk import dry-run/idempotency、Explore eligible projection 都有可复用思路；
- 旧实现同时暴露过度扩张：四个 apps、多个 packages、静态/动态详情分裂、POI identity 与 Fact import 耦合、provider 能力与产品 promise 容易混淆。

结论：复用 invariants、schema tests 和 failure fixtures；不复制整个目录结构或 runtime service。

---

## 4. 三轮研究一致性复核

| 主题 | 统一结论 | 需要在总报告中消除的歧义 |
| --- | --- | --- |
| Chatbot/Canvas | AI 只提案，用户确认，确定性 Patch | `Copilot` 仅内部名，产品统一 VisePanda Chatbot |
| 模型组合 | 任务路由，不做四模型投票 | DeepSeek Vision Exp 新增视觉 lane；基础 Flash 仍文本 |
| 多模态 | OCR->MT、ASR->MT->TTS 分段可测 | 通用 VLM 不等于专业 OCR/语音翻译 |
| 外部数据 | Evidence/Observation/Artifact 分层 | provider payload 不自动变 Fact 或 Trip 数据 |
| 航空 | 购买不做，schedule/status 要做 licensed benchmark | trial 数据不能对外展示 |
| 铁路 | 不做 12306 爬虫 | 用户票据导入和官方 recheck 是主路径 |
| POI 导入 | Imported Candidate，不是 generated POI | identity review 与 Fact review 分离 |
| RAG | Postgres hybrid、exact-first、RLS | embedding 是投影，不是真理或资格 |
| Explore | city-first、同知识库、exact POI ID | 热门城市是 editorial overlay，不是第二数据库 |

---

## 5. 软件平台一手资料复核

### 5.1 Next.js 与 AI SDK

- Next.js App Router Route Handlers 使用 Web Request/Response，可承载 BFF 与流式响应；不需要在首发另建 Express 服务。[Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- Vercel AI SDK 提供 `streamText`、tool input validation、provider registry、OpenAI-compatible provider 与 telemetry hooks。[AI SDK Core](https://ai-sdk.dev/docs/reference/ai-sdk-core)、[OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- 这些库只能统一 transport ergonomics，不能抹平 DeepSeek strict schema、Qwen region、视觉 content block、usage、cache 和错误语义差异；VisePanda 必须保留自己的 provider adapter/conformance suite。
- 本轮是报告任务，没有安装 `ai` 包，也没有把 AI SDK 写成已采用依赖。

### 5.2 Supabase/Postgres

- Supabase 官方 hybrid search 使用 Postgres FTS + pgvector，再以 RRF 合并；RAG 查询可继续受 RLS。[Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)、[RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- Supabase Queues 基于 `pgmq`，支持持久消息、visibility timeout、重试/归档；官方 automatic embeddings 示例使用 trigger + pgmq + Edge Function + pg_cron。[Queues](https://supabase.com/docs/guides/queues)、[Automatic Embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- 2026-08 当前变更：extension version pin 会被忽略；新表不再默认暴露 Data API；self-hosted/管理 API 另有 breaking changes。[Supabase Changelog](https://supabase.com/changelog.md)
- VisePanda 应把 queues 保持 private；公开表/视图需要显式 GRANT、RLS 和 `security_invoker`，不能用 `SECURITY DEFINER` 修权限错误。

### 5.3 安全与可观测

- OWASP 把 prompt injection 与 excessive agency 列为 LLM 应用核心风险；最小工具、最小权限、独立验证高影响动作与人工确认是直接缓解措施。[OWASP GenAI Top 10](https://genai.owasp.org/initiatives/top-10-for-llm-and-genai/)
- OpenTelemetry 已有 GenAI semantic conventions，但当前仍演进；内部 trace contract 应稳定，OTel mapping 可以版本化。[OpenTelemetry semantic convention versioning](https://opentelemetry.io/docs/specs/semconv/configuration/version-selection/)
- Google SRE 建议从用户关心的行为定义 SLI/SLO，并以 error budget 控制发布节奏；在真实遥测前只能标 proposed target。[Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)

---

## 6. 外部数据复核增量

- 12306 英文条款当前仍禁止用未经认可的 robot/spider/crawler 访问或登录；周期性自爬不是可接受方案。[12306 Terms](https://www.12306.cn/en/rule.html)
- Cirium 当前仍提供按航班的 scheduled/estimated/actual、terminal、gate、cancel 等状态接口，并转向统一 Sky API/Developer Studio；生产 rights 和中国覆盖仍需 trial/合同实测。[Cirium Flight Status](https://developer.flightstats.com/api-docs/flightstatus/v2/flight)、[Developer Center](https://developer.flightstats.com/)
- 外部数据三轮结论未因本轮模型变化而改变：license registry 先于 adapter；不能用更强 VLM 绕开显示、缓存、翻译、TTS、LLM 和持久化权利。

---

## 7. 未验证事项

- 用户 DeepSeek 账号是否已获得 Vision Exp、真实限流与账单；
- DeepSeek Vision Exp 对五语菜单/站牌/票据/POI 的实际准确率；
- DeepSeek Files API 的业务 retention、删除完成时间与数据处理合同；
- AI SDK 对 DeepSeek Responses/vision/strict tool 的完整兼容；
- Qwen Beijing/Singapore 的最终 production region、DPA、延迟和五语质量；
- Supabase project、RLS、Queues、pgvector、backups 和 preview branching 的真实配置；
- 航空 provider 的中国覆盖和合同权利；
- OSM derivative database、地图 tiles、媒体和 POI 商业许可；
- 所有 proposed SLO、模型质量阈值和工期估算。

本轮没有读取 API key、调用付费模型、导入 POI、创建云资源或改变生产状态。
