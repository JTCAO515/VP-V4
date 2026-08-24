# VisePanda AI Core 深度优化增量证据底稿

> 核验日期：2026-08-23（Asia/Shanghai）  
> 研究范围：DeepSeek/Qwen/Kimi/GLM、必选多模态、Next.js/Vercel、Supabase/Postgres/RAG/Queues、外部数据许可  
> 对照对象：[AI Core 整体研究报告](../ai-core-integrated-research-report.md)与[软件工程开发、交付与验收报告](../ai-core-engineering-development-acceptance-report.md)  
> 证据边界：只使用供应商官方文档、官方条款、上游项目源码/文档和正式规范；没有进行付费 API、账号权限、真实网络或生产负载测试。

## 0. 读法与证据等级

本文严格区分：

- **事实**：一手资料当前明确写明的能力、限制、状态或条款；
- **工程推论**：由事实推导出的 VisePanda 设计建议，不是供应商承诺；
- **待实测**：仅靠文档不能证明，必须使用用户账号、固定 fixture、真实设备或合同确认；
- **待合同**：公开条款不足以授权 production 使用，必须以实际商业协议、DPA、订单或书面许可为准。

供应商自己的 benchmark、营销性质量描述只证明其做过该声明，不作为 VisePanda 质量结论。本文不把多模型输出当投票，也不把“OpenAI-compatible”理解为协议、语义和错误行为完全等价。

## 1. 会改变主报告的最高优先级增量

| 优先级 | 当前报告中的表达或缺口 | 一手资料增量 | 应作出的工程修订 |
| --- | --- | --- | --- |
| P0 | `deepseek-v4-flash` 作为稳定高频主力 | Flash-0731 官方仍称 **public beta**；Pro-0813 是 GA；Vision Exp 是 experimental | 可以保留 Flash 为首选候选，但必须标 `beta`、feature flag、自动熔断和可回滚；不能以“上线”推导“稳定” |
| P0 | 普通问答强调 DeepSeek 速度/成本，但未冻结 thinking | DeepSeek V4 thinking 默认开启且默认 effort=`high` | 普通 grounded answer 必须显式 `thinking.type=disabled`；复杂 critique 才按 eval 开 `high/max` |
| P0 | DeepSeek Pro 可作 strict tool 回退 | strict tool 仍需 `/beta` endpoint，且只支持 JSON Schema 子集 | 关键 Trip schema 的 production 主路仍应是经验证的 Qwen strict schema；DeepSeek strict 只能先作为 beta conformance lane |
| P0 | 图片可以走 DeepSeek Files API，retention 待确认 | Files API 未传 `expires_after` 时会**永久保存**；可设 1 小时到 30 天，并支持删除 | 一次性旅客图片默认不用 Files API；若复用，必须显式短 TTL、删除和 deletion receipt |
| P0 | 语音翻译只有 `ASR → MT → TTS` | Qwen 已有 `qwen3.5-livetranslate-flash-realtime`：北京/新加坡、60 语种、五个 VisePanda 语言均支持音频+文本、支持 manual push-to-talk | 保留可解释分段链作为 baseline，同时新增端到端 LiveTranslate challenger；不得在没有同集评测前直接替换 |
| P0 | `qwen3.5-ocr`、Qwen Audio 3.0 TTS 可待 region 决定后使用 | 官方目录目前只在北京列 Qwen-OCR；Qwen Audio 3.0 TTS 明确仅北京；Qwen3-TTS 才列新加坡 | region 是模型选择的前置合同，不是部署尾项；新加坡方案必须换 TTS 并重新选 OCR baseline |
| P0 | 媒体经过 Next.js 模块化单体上传 | Vercel Function 入站/出站 payload 上限 4.5 MB；Server Action 默认 body 1 MB | 浏览器直接向私有 Storage 使用签名上传/TUS；Next.js 只签发凭据和登记 job，不代理大文件 |
| P0 | Supabase Queue 有 retry/dead-letter | `pgmq` 只保证 visibility window 内单次投递；超时会重新可见；archive 是显式动作 | 消费者必须幂等；最大重试、毒消息判定和 DLQ/隔离队列由应用显式实现，不能把 archive 叫成自动 DLQ |
| P1 | Kimi/GLM 只笼统写 eval-only | Kimi 当前旗舰为 K3，K2.5/Moonshot V1 已进入 8 月 31 日全平台 sunset；GLM 当前最新为 5.3 | 离线候选更新为 Kimi K3、GLM-5.3；两者 always-thinking，更适合异步 critique，不适合普通低延迟路由 |
| P1 | Postgres FTS 被视为五语 lexical baseline | Supabase 明确说明原生 Postgres FTS 主要适用于字母/数字语言，PGroonga 才是更广多语方案 | 对中文、阿拉伯语建立 lexical qrels；比较 alias/`pg_trgm`/native FTS/PGroonga，不能假设一种 tokenizer 覆盖五语 |
| P1 | Data License Registry 已覆盖主要动作 | FlightAware 禁止未经许可与另一实时航班数据源拼接/backfill；OSM 有 share-alike；Google/高德限制缓存和衍生使用 | Registry 增加 `combine/backfill`、`derivativeDatabase`、`shareAlike`、`trialVisibility`、`purgeOnEnd`、`sourceAttribution` |

## 2. DeepSeek V4：正式、Beta 与实验能力必须拆开

### 2.1 当前生命周期与真实 API 型号

| API model | 当前底层版本 | 官方状态 | 文档明确能力 | VisePanda 结论 |
| --- | --- | --- | --- | --- |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813 | GA | text、thinking/non-thinking、JSON、tools、Responses、Anthropic | 复杂异步任务的稳定性候选；仍须旅行域 eval |
| `deepseek-v4-flash` | DeepSeek-V4-Flash-0731 | public beta | text、thinking/non-thinking、JSON、tools、Responses、Anthropic | 高频文本首选候选，但不能标为 GA/stable |
| `deepseek-v4-flash-vision-exp` | DeepSeek-V4-Flash-Vision-Exp | experimental | text + image、JSON、tools、Responses、Anthropic | shadow/canary；不能承担必选 OCR 单点责任 |

**事实。** DeepSeek 2026-07-31 更新把 Flash-0731 称为 public beta；2026-08-13 将 Pro 称为 GA；2026-08-21 将 Vision Exp 明确称为 experimental。[DeepSeek Change Log](https://api-docs.deepseek.com/updates)

**事实。** 当前价格页显示底层版本为 Flash-0731、Pro-0813，并将 Vision Exp 作为独立 model ID；三者均列 1M context、最大 384K output、JSON、tool calls、Responses 和 Anthropic 支持。[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

**工程推论。** 内部 registry 至少要把 `apiModelId`、`observedServingVersion`、`releaseStage`、`retrievedAt` 分开。`deepseek-v4-flash` 是可变服务别名，不能用 model 名推断底层快照永远是 0731。

**待实测。** 用户账号实际返回的 `model`/usage 字段、峰谷价格、并发、429 行为、beta 变更通知和中国五语旅行域质量。

### 2.2 Thinking 默认值会直接破坏“低延迟主路”假设

**事实。** V4 thinking 默认开启，默认 effort 为 `high`；Chat Completions 可用 `thinking.type=enabled/disabled`，effort 支持 `low/high/max`。thinking 模式下 `temperature`、`top_p`、presence/frequency penalty 会被忽略但不报错。[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)

**事实。** 带 `tools` 的 thinking 多轮中，后续请求必须完整带回每一轮 `reasoning_content`，即使某一轮没有调用工具；否则返回 400。[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)

**工程推论。** 路由不能只记录“thinking supported”，还要按 task 冻结：

```text
grounded_answer / intent / small day structure:
  thinking = disabled

trip critique / hard conflict detection:
  thinking = high, only async or explicit user wait

exceptional offline evaluation:
  thinking = max
```

Adapter conformance 必须覆盖：参数确实生效、被静默忽略的参数不发送、tool round-trip 保留 `reasoning_content`、stream reasoning 与 final content 分离、日志默认不保存 reasoning。

### 2.3 JSON Output 不等于 strict schema

**事实。** 普通 JSON Output 只保证有效 JSON 字符串，要求 prompt 中包含“json”，官方还提示偶尔可能返回空内容；它不保证业务 schema。[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode)

**事实。** DeepSeek `strict` tool mode 仍标 Beta，必须使用 `https://api.deepseek.com/beta`，每个 function 设置 `strict:true`。支持的 schema 关键字有限；所有 object 属性都需 required、`additionalProperties:false`，字符串不支持 `minLength/maxLength`，数组不支持 `minItems/maxItems`。[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)

**工程推论。** 当前“DeepSeek V4 Pro strict tool 作为 Trip skeleton 回退”的表述应补全为“beta-only candidate”。TripProposal 无论来自哪个模型都必须经过本地 JSON Schema/Zod 解析、领域不变量校验和 preview；模型 strict 不能替代应用校验。

### 2.4 Vision Exp 的真实输入边界

**事实。** Vision Exp 支持 JPEG/PNG/GIF/WebP；Chat Completions 可使用 base64、外部 URL 或 Files API。外部 URL 最长 8192 字符、下载需在 60 秒内完成；普通单图 32 MiB，Files API 引用单图 64 MiB；请求体 48 MiB；单请求最多 600 图；总图像大小通常 64 MiB，含 file-id 图可到 200 MiB。[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision)

**事实。** Chat Completions 中图像只能出现在 user message；非视觉 model 收到图片返回 400。Responses API 的 content part 形态不同，并允许 `input_image` 出现在其规定的 developer/tool-output 项中。[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision)

**事实。** `detail=original/high` 的输入兼容描述与 token 处理要同时理解：模型仍会把大图等比缩到约 800×800 总像素量，每图最多约 384 image tokens；小图会放大到约 384×384 总像素量。[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision)

**工程推论。** `detail=original` 不能被解释成“模型按原始像素完成 OCR”。菜单小字、站名、金额、过敏原、票据编号仍需专用 OCR baseline；Vision Exp 只能作为 challenger。需要分别测试整图、按版面裁切、透视矫正、旋转和多图切片，不能只测一张漂亮截图。

### 2.5 Files API 的 retention 已不再是未知

**事实。** DeepSeek Files API 允许 1 小时到 30 天 expiration；如果省略 `expires_after`，文件永久保存。每用户上限 25 GiB/10,000 文件，并提供删除接口。[DeepSeek Files API](https://api-docs.deepseek.com/guides/files_api)

**工程推论。** 一次性 OCR/POI 图像默认选择短期签名 URL或 inline，而不是 Files API。只有确需跨请求复用时才上传，且请求必须携带短 TTL；任务完成立即 delete，保存 provider delete response、内部对象删除时间和 trace，而不保存原图内容到日志。

**待合同。** “API 删除响应成功”不等于已证明供应商备份、日志和灾备中的最终删除时限；DPA、处理地域、训练/改进使用和子处理方仍需合同核对。

## 3. Qwen：能力丰富，但协议和地域不能被一个 adapter 抹平

### 3.1 文本/视觉通用模型

**事实。** `qwen3.7-plus` 当前 stable alias 与 `qwen3.7-plus-2026-05-26` 功能等价；北京、新加坡、法兰克福、弗吉尼亚和东京均列 image/text/video input、function calling、structured outputs 和 context cache；1M context、最大 131,072 output。[Qwen3.7 Plus model info](https://help.aliyun.com/en/model-studio/qwen3-7-plus)

**事实。** `qwen3.8-max` 是当前推荐旗舰，提供原生视觉、function calling、structured outputs、1M context；官方标价显著高于 3.7 Plus，且当前页面未列可固定的 snapshot。[Qwen3.8 Max model info](https://help.aliyun.com/en/model-studio/qwen3-8-max)

**工程推论。** `qwen3.7-plus-2026-05-26` 仍是 Trip skeleton 的可复现主候选；`qwen3.8-max` 应加入复杂规划/视觉离线 challenger，而不是因“最新旗舰”直接替换。晋级要求同时改善 schema pass、领域约束、grounding、五语质量和单位成功成本。

### 3.2 Qwen OCR 的强项与当前地域阻断

**事实。** `qwen3.5-ocr` 面向文档解析、文字定位和关键信息提取，支持多轮和 PDF，context 128K。官方也明确提示小字/低分辨率可能 hallucinate，非 OCR 问题的回答质量不保证；它使用固定内部 system message，应用指令必须放 user message。[Qwen OCR guide](https://help.aliyun.com/en/model-studio/qwen-vl-ocr)

**事实。** 高精度识别可返回每行文字、四点 `location` 和旋转矩形 `rotate_rect`；官方返回结构没有发布通用置信度字段。OpenAI-compatible Chat 不直接暴露旋转纠正和 built-in OCR task；完整 `ocr_options/ocr_result` 需要 DashScope 或 Responses 形态。[Qwen OCR guide](https://help.aliyun.com/en/model-studio/qwen-vl-ocr)

**事实。** 当前官方 pricing/catalog 的 Qwen-OCR 部分只列 China (Beijing)，没有列 Singapore/Global 部署条目。[Alibaba Model Pricing](https://help.aliyun.com/en/model-studio/model-pricing)

**工程推论。** 报告中的 `OCR segments with bbox/order/uncertainty` 要改成：

- `text + geometry + readingOrder` 可由 adapter 规范化；
- provider 没有给出的 confidence 必须是 `missing`，不能由 LLM 自报概率伪造；
- 低清/遮挡字符使用 `?`/unknown 并要求用户确认；
- 若 production region 为 Singapore，`qwen3.5-ocr` 只能是北京 shadow/quality reference，不能成为未经批准的跨境 production baseline；应对测该区域可用的 Qwen 通用视觉、其他获准 OCR 或自托管 OCR。

**待实测。** qwen3.5-ocr 对 VisePanda 菜单、站牌、票据、竖排、反光、倾斜、阿拉伯文和混合文字的 CER、字段 exactness、版面重建、延迟与成本。

### 3.3 ASR、MT、TTS 的地域与协议矩阵

| 能力 | 官方候选 | 协议 | 当前地域事实 | 关键限制 |
| --- | --- | --- | --- | --- |
| realtime ASR | `qwen-audio-3.0-asr-flash-streaming` | WebSocket/AOQ SDK | 北京、新加坡 | 无 speaker diarization、无 emotion；支持 hotword/context；五语在支持列表 |
| text MT | `qwen-mt-flash` | OpenAI-compatible Chat 或 DashScope | 北京、新加坡、弗吉尼亚 | `translation_options` 非标准；92 语种；需显式 source/target/terms |
| TTS quality lane | `qwen-audio-3.0-tts-flash` | 专用 HTTP/SSE/SDK | **仅北京** | 不能作为新加坡路由 |
| TTS international lane | `qwen3-tts-flash` / realtime variant | HTTP 或 WebSocket | 北京、新加坡 | 模型/voice/language 需单独验收 |

来源：[Qwen ASR models](https://help.aliyun.com/en/model-studio/asr-model/)、[Realtime ASR](https://help.aliyun.com/en/model-studio/real-time-speech-recognition-user-guide)、[Qwen-MT API](https://help.aliyun.com/en/model-studio/qwen-mt-api)、[Qwen-MT languages](https://help.aliyun.com/en/model-studio/machine-translation)、[Qwen TTS](https://help.aliyun.com/en/model-studio/non-realtime-tts-user-guide)。

**工程推论。** AI SDK/OpenAI-compatible adapter 只覆盖 MT 等 HTTP chat 风格能力；ASR、TTS 需要独立协议 adapter 和事件状态机。模型层目录不能把它们都塞进 `languageModel.generate()`。

### 3.4 报告遗漏的端到端语音翻译候选

**事实。** `qwen3.5-livetranslate-flash-realtime` 是北京和新加坡可用的 realtime WebSocket/AOQ/WebRTC 模型，支持 60 种语言，其中 29 种提供音频+文本。中文、英文、西班牙文、俄文和阿拉伯文均明确列为音频+文本输出。[Qwen3.5 LiveTranslate](https://help.aliyun.com/en/model-studio/qwen3-5-livetranslate-flash-realtime)

**事实。** 它支持：

- manual mode：`turn_detection=null` 后由客户端 commit，正好适配 push-to-talk；
- 可配置 `qwen3-asr-flash-realtime` 同时输出源语言 transcript；
- tentative 与 confirmed translation event，以及最终 done event；
- 增量 base64 audio；
- hotword/term mapping；
- 可选 image context；
- 文档宣称最低约 2.8 秒延迟，但这是供应商陈述，不是 VisePanda SLO。

**事实。** 客户端关闭前必须发送 `session.finish` 并等待 `session.finished`；否则最后一句可能完全丢失并出现连接悬挂。[Qwen3.5 LiveTranslate](https://help.aliyun.com/en/model-studio/qwen3-5-livetranslate-flash-realtime)

**工程推论。** 最终方案不应在“分段 pipeline”和“端到端模型”二选一：

```text
baseline:
  Qwen ASR final -> Qwen-MT -> fixed-voice TTS
  优点：每段可测、可改原文、术语控制和错误归因清楚

challenger:
  Qwen3.5 LiveTranslate Realtime
  优点：更少网络往返、原生 simultaneous translation、五语音频覆盖

release rule:
  同一真实移动端 fixture 比较 source transcript、translation adequacy、
  entity/number exactness、TTFT/完成延迟、断网恢复、成本和隐私。
```

UI 只能把 `done/completed` 结果标为 final 并允许用户纠错；tentative text 不能写入 Trip/长期 transcript。默认关闭 voice cloning，使用固定系统 voice；旅行翻译不需要额外采集声纹/仿声风险。

### 3.5 Realtime 鉴权决定前端拓扑

**事实。** Qwen WebSocket handshake 需要长期 API key，官方明确要求不得在客户端硬编码。AOQ 采用服务器换取临时 client token 的模式，返回 session expiry；WebRTC 需要 SDP exchange 时携带 API key。[Qwen Realtime token authentication](https://help.aliyun.com/en/model-studio/realtime-token-authentication)

**工程推论。** Web/PWA 推荐 spike 顺序：

1. 浏览器生成 WebRTC offer；
2. Next.js authenticated route 代用户向 Qwen 做 SDP exchange，不把 key 返回浏览器；
3. 音频媒体直接走 WebRTC，Vercel 只做短连接 signaling；
4. 若 WebRTC 不满足浏览器/地域要求，再评估 Vercel WebSocket relay；
5. 原生 iOS/Android 客户端可评估 AOQ 临时 token。

这比“浏览器直连 WebSocket并暴露 key”或“所有音频持续穿过 Next.js Function”更符合权限和成本边界。

### 3.6 Embedding/rerank 需要专用 transport

**事实。** `qwen3.7-text-embedding` 支持 201 种语言/方言，维度可选 256–2560，1024 为官方一般推荐；支持北京和新加坡。[Qwen Embedding](https://help.aliyun.com/en/model-studio/embedding)

**事实。** 搜索场景推荐区分 `text_type=query` 与 `text_type=document`，但该参数只在 DashScope SDK/API 可用，不在 OpenAI-compatible embeddings API 中。[Qwen Embedding](https://help.aliyun.com/en/model-studio/embedding)

**事实。** `qwen3-rerank` 支持 100+ 语言，每次最多 500 documents、单文档 32,768 tokens、整请求 120,000 tokens；官方建议 initial retrieval 20–100+、rerank 到 5–10。`gte-rerank` 已在 2026-05-30 下线。[Qwen Rerank](https://help.aliyun.com/en/model-studio/rerank)

**工程推论。** RAG adapter 应独立于聊天模型 adapter，保存 `embeddingModel/deployment/region/dimension/textType/contentHash/indexVersion`。查询向量若错误地用默认 `document`，不能靠模型名看出来；必须纳入 retrieval eval。

## 4. Kimi 与 GLM：更新候选，不扩大首发供应商数

### 4.1 Kimi 当前有效候选

**事实。** Kimi 当前模型页把 `kimi-k3` 列为最新最强通用模型：原生视觉、1M context。K2 系列已于 2026-05-25 停止维护；K2.5 与 Moonshot V1 对新用户关闭并计划 8 月 31 日全平台 sunset。[Kimi Model List](https://platform.kimi.ai/docs/models)

**事实。** Kimi K3：

- always-thinking，只能调 `low/high/max`，不能关闭；
- vision 不支持 public image URL，只能 base64 或 `ms://file-id`；
- strict JSON Schema `strict:true`；
- `tool_choice=required`；
- 自动 prefix cache；
- 1M context；
- web search 正在更新，官方不建议近期用于 production。

[Kimi K3 official guide](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)

**工程推论。** 两份总报告应把“Kimi/GLM eval”具体化为 `kimi-k3`，移除任何 K2/K2.5 production 依赖。K3 的 strict schema 很强，但 always-thinking、访问档位和媒体输入差异使它更适合异步复杂规划/critique canary，而不是首屏普通回答。

### 4.2 GLM 当前有效候选

**事实。** `glm-5.3` 是当前最新旗舰，text-only、1M context、最大 128K output、always-thinking，effort 支持 `low/high/max`；支持 OpenAI Chat Completions、Responses 和 Anthropic endpoint。[GLM-5.3 official model page](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3.md)

**事实。** GLM function calling 文档当前写明 `tool_choice` 默认且仅支持 `auto`；结构化输出是 `response_format:{type:'json_object'}`，不是已公布的 strict JSON Schema。[GLM Function Calling](https://docs.bigmodel.cn/cn/guide/capabilities/function-calling)、[GLM Structured Output](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)

**工程推论。** `glm-5.3` 可以参加 grounded critique、长文综合和结构鲁棒性反例测试，但不能凭“支持 JSON”承担必须强制 TripProposal schema 的主路。保留 eval-only 是合理结论，型号和限制需要更新。

### 4.3 建议的模型候选层级

| task lane | production candidate | challenger | 明确不做 |
| --- | --- | --- | --- |
| 普通 grounded answer | DeepSeek Flash-0731，thinking off | Qwen3.7 Plus snapshot | 四模型投票 |
| TripProposal schema | Qwen3.7 Plus 2026-05-26 strict + local validator | DeepSeek Pro strict beta、Kimi K3 strict | 让 GLM json_object 直接写 Trip |
| 高风险异步 critique | DeepSeek Pro-0813 high | Qwen3.8 Max、Kimi K3、GLM-5.3 | critique 直接修改 Canvas |
| 通用 vision | DeepSeek Vision Exp shadow vs Qwen3.7/3.8 | Kimi K3 offline | 用 VLM 识别结果直接创建 POI |
| OCR translation | 北京可测 Qwen3.5 OCR；region 未定不冻结 | DeepSeek Vision Exp、通用 Qwen、获准 OCR | 伪造 confidence；错误静默通过 |
| voice translation | 分段 pipeline baseline | Qwen3.5 LiveTranslate | 把 interim transcript 当 final |

这是工程建议，不是质量事实；只有统一 VisePanda eval 才能晋级。

## 5. Next.js、Vercel 与 AI SDK：需要明确三条不同的数据平面

### 5.1 AI SDK 只能统一一部分 transport

**事实。** Vercel AI SDK OpenAI-compatible provider支持 text、streaming、tool calling、可选 structured output、reasoning content、provider-dependent multimodal input；它允许 `transformRequestBody`、custom fetch、metadata extractor 和 provider-specific options。[AI SDK OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)

**事实。** `supportsStructuredOutputs:true` 是 adapter 配置，不会自动证明后端真的支持 strict constrained decoding；provider-dependent multimodal 也不是兼容保证。[AI SDK OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)

**工程推论。** 工程结构应明确三条平面：

```text
Chat plane:
  AI SDK candidate -> DeepSeek/Qwen/Kimi/GLM HTTP adapters

Specialized batch plane:
  Qwen OCR/MT/Embedding/Rerank/TTS -> provider-specific HTTP/Responses/DashScope adapters

Realtime media plane:
  ASR/LiveTranslate/TTS Realtime -> WebSocket/WebRTC/AOQ state machines
```

每个 adapter 必须通过自己的 protocol conformance；不得因为都能被 OpenAI SDK 发请求就共享错误语义、usage、cache、thinking 或 strict capability。

**事实。** AI SDK telemetry 可记录完整 prompt、tool definitions、response text 和 tool calls。[AI SDK Telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)

**工程推论。** 生产默认 `recordInputs=false/recordOutputs=false` 或自定义脱敏 span；图片、语音 transcript、票据、精确位置、Trip 私密内容不能因开启 observability 自动进入第三方 trace。

### 5.2 媒体不能经过普通 Function request body

**事实。** Vercel Functions 的 request/response body 上限为 4.5 MB；官方建议大文件直接上传到源存储。Next.js Server Action 默认 body 上限为 1 MB。[Vercel Function Limits](https://vercel.com/docs/functions/limitations)、[Vercel large-body guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)、[Next.js Server Actions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)

**事实。** Supabase 对大于 6 MB 或弱网文件推荐 TUS resumable direct upload；支持 signed upload token，upload URL 最多 24 小时；官方建议使用唯一新路径而非 overwrite。[Supabase Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

**工程推论。** 媒体 intake 必须是：

```text
client asks server for one-time object path/token
-> client uploads directly to private Supabase Storage
-> server verifies owner, MIME magic, size, hash and policy
-> enqueue MediaJob with object ref, never raw bytes
-> worker sends short-lived signed URL or controlled bytes to selected provider
-> result persisted; raw object expires/deletes; delete receipt recorded
```

### 5.3 Realtime relay 仍需 spike，不应写成已解问题

**事实。** Vercel 2026-06 官方资料称 Fluid Compute 已原生支持 WebSocket（beta），连接 pin 到单一 Function、受 maximum duration 限制，必须 reconnect，持久状态放外部存储；较早的通用 limits 页面仍存在“不支持 WebSocket server”的旧表述。[Vercel WebSocket KB](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)、[Vercel WebSocket vs SSE](https://vercel.com/i/websocket-vs-server-sent-events)

**工程推论。** 报告不能把 WebSocket relay 当成普通 Next.js Route Handler 已确定可交付。`REALTIME-00` 必须用目标 Vercel plan/Fluid Compute 做握手、最长连接、断线、region、并发、成本和 preview 支持测试。若 Qwen WebRTC signaling 可用，优先媒体直连；Vercel relay 作为受控 fallback。

## 6. Supabase/Postgres/RAG/Queues：补上权限、队列语义与五语 lexical 层

### 6.1 RLS 不是“开关已开”就安全

**事实。** Supabase 公开 schema 的 table 必须同时处理 grants 与 RLS；policy 不会撤销已有 grants。`service_role`/secret key 带 `BYPASSRLS`，必须只在服务端使用。Postgres view 默认可能绕开底表 RLS，Postgres 15+ 可用 `security_invoker=true`。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

**工程推论。** Retrieval/Explore projection 的 acceptance 要含：anon/authenticated/owner/operator/service worker 四角色负例；service worker 即使可绕 RLS也必须显式带 `owner_id/eligibility/license` filter。所有 security-definer function 放私有 schema、`search_path=''`、全限定对象名。

### 6.2 Serverless 连接池属于部署合同

**事实。** Supabase 推荐 serverless/edge 使用 transaction pooler；transaction mode 不支持 prepared statements，连接库必须关闭 prepared statements。Direct connection 用于 migration/pg_dump/长连接，不应用于 bursty function traffic。[Supabase Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)

**工程推论。** `PLAT-00` 要分别配置 migration URL、runtime pooler URL、Data API；在 preview/staging 做 connection storm 和 transaction correctness，不能只跑 schema migration。

### 6.3 Queue 是至少一次处理语义，不是自动 exactly-once workflow

**事实。** Supabase Queues/`pgmq` 在 visibility window 内将消息只交给一个 consumer；若未 delete/archive，超时后重新可见。消息一直保留到显式删除或 archive。[Supabase Queues](https://supabase.com/docs/guides/queues)、[pgmq upstream](https://github.com/pgmq/pgmq)

**事实。** 上游文档把“多次失败后 archive”作为手工 dead-letter handling 示例，而不是自动 DLQ。[pgmq FIFO/dead-letter guidance](https://github.com/pgmq/pgmq/blob/main/docs/fifo-queues.md)

**工程推论。** queue envelope 增加 `jobId/idempotencyKey/entityVersion/contentHash/attempt/maxAttempts/leaseDeadline/traceId`；成功 side effect 与 processed marker 原子或可重放。达到最大次数后发送到独立 quarantine queue 或显式 archive + ops record，不能把所有成功消息与毒消息混在同一个 archive 里。

### 6.4 RAG exact-first 结论正确，但需补两个实现细节

**事实。** pgvector 默认 exact nearest-neighbor，perfect recall；HNSW/IVFFlat 牺牲 recall 换速度。过滤会导致 ANN 返回不足，0.8+ iterative scans 可改善；`vector` HNSW 最多 2,000 维，1024 维 Qwen embedding 可直接索引。[pgvector upstream](https://github.com/pgvector/pgvector)

**工程推论。** 在真实 row count/latency 未触发前保持 exact vector；引入 HNSW 时，每次发布都把 ANN 结果与禁用 index scan 的 exact truth 比较，按 city/locale/eligibility filter 分层报告 recall。

**事实。** Supabase hybrid search 示例使用 Postgres FTS + pgvector + RRF；RAG 可通过 RLS限制可检索文档。[Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)、[RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)

**事实。** Supabase 同时指出原生 Postgres FTS 主要适合字母/数字语言，PGroonga 扩展覆盖中文等更广字符语言。[Supabase PGroonga](https://supabase.com/docs/guides/database/extensions/pgroonga)

**工程推论。** 五语检索要增加 `LEX-00`：

- POI canonical ID/alias exact 永远第一；
- `pg_trgm` 做 typo/transliteration alias；
- en/es/ru 可测 native language FTS；
- zh/ar 比较 `simple`、PGroonga、char n-gram/alias、vector；
- 最后 RRF + qwen3-rerank；
- 没有 qrels 前不预先采用 PGroonga，也不声称 native FTS 已解决五语。

## 7. 外部数据与许可：Registry 还需表达“能否组合和衍生”

### 7.1 POI/地图数据不能被“有 API”误认为“可建库”

**事实。** Google Places 当前政策禁止超出例外的 prefetch/cache/store，只有 `place_id` 可无限期保存；无地图展示需 Google Maps attribution，照片/评论需作者 attribution 和 source link；Google 的 AI summary 要原样显示 disclosure，不能当作自有可改写内容。[Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

**工程推论。** Google Places 可作为受条款约束的实时 lookup/外部 ID，不是 VisePanda Canonical POI/Fact 批量入库来源。把 Google review、summary 或 place fields 发送给另一 LLM、embedding、翻译或 TTS，必须逐项得到合同许可，不能仅凭 API response 推导。

**事实。** 高德开放平台 2025-12-03 协议要求商业主体预先购买技术服务许可；除明确书面许可外，不得把内容用于模型/算法训练或数据集；只可按官方功能展示，不得直接存储、缓存、抓取内部 POI/图片等内容。[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)

**工程推论。** 高德也不能作为默认 Canonical POI 导入底库；需要工单/书面许可明确 production display、persist、LLM inference、embedding、translation 和 attribution。

**事实。** Mapbox temporary geocoding 默认只允许 session use，不能持久保存坐标；permanent geocoding 需显式 `permanent=true` 并按相应价格/条款使用。[Mapbox temporary vs permanent geocoding](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/)

### 7.2 OSM 是开放数据，不等于公共服务可批量使用

**事实。** OSM 数据按 ODbL，可复制/修改但需 attribution，衍生数据库可能有 share-alike；标准 tile/Nominatim/API 是资源有限的公共服务，不等于免费生产 SLA。[OSM copyright](https://www.openstreetmap.org/copyright)

**事实。** 公共 Nominatim：绝对上限 1 req/s，禁止 autocomplete 和系统性下载区域内全部 POI；周期性/bulk geocoding受严格限制，商业应用可能随时被撤销。当前政策还明确要求 LLM 建议使用时突出这些限制。[Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

**事实。** OSM editing API 不是 read-only 数据 API；大规模读取应使用 planet/extract/diffs 或其他 provider。标准 tile 禁止 bulk/offline/prefetch，需 attribution、User-Agent 和缓存规则。[OSM API policy](https://operations.osmfoundation.org/policies/api/)、[OSM Tile policy](https://operations.osmfoundation.org/policies/tiles/)

**工程推论。** “批量导入引用外部来源 POI”的 OSM 正确入口是版本化 extract/planet/diff 或有许可的商业托管商，不是遍历 Nominatim/地图页面。数据管道必须登记 ODbL provenance、attribution 和 derived-database review。

### 7.3 航空许可还约束 provider 组合

**事实。** OAG 14-day evaluation 仅限内部测试，禁止第三方展示/分发、衍生作品和 secondary database，并要求 trial 结束后 purge。[OAG Evaluation License](https://www.oag.com/flight-info-api-evaluation-license-agreement)

**事实。** FlightAware AeroAPI Standard License允许 B2C app 中嵌入/衍生使用，但 raw data 最长保存 30 天；未经书面许可不得用另一家实时/近实时航班数据 backfill/组合；不得把 raw data 作为 API 转售。[FlightAware AeroAPI Standard License](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License.pdf)

**工程推论。** 航空 benchmark 可以让多家在同一 synthetic/公开航班 fixture 上各自独立返回并比较，但不能把 OAG trial 数据对外，也不能在 production 默认为 FlightAware + 第二家融合。最终只接一家这一结论仍正确；License Registry 必须表达 `combineWithOtherProvider`。

**待合同。** Cirium/OAG/FlightAware/Amadeus 最终订单可能覆盖或修改公开标准条款；production 权利必须以签署合同为准。

### 7.4 铁路 no-crawler 结论保持

**事实。** 12306 条款禁止 robot/spider/crawler 等非认可方式访问，且未经书面同意不得复制、存储、传播网站资源。[12306 Terms of Service](https://www.12306.cn/en/rule.html)

**工程推论。** 不做定期自爬仍是正确红线。用户票据/行程单 OCR 后由用户确认，Chatbot 提供官方 recheck link；这不是把个人 artifact 变成公共 timetable 数据集。

### 7.5 建议扩展 Data License Registry

在既有 `display/cache/persist/sendToLlm/embed/translate/TTS/attribution/region/retention/deleteOnTermination` 之外，增加：

```text
licenseDocumentUrl + version/effectiveAt
account/order/contractRef
evaluationOnly + trialEndsAt + publicDisplayDuringTrial
rawRetention + derivedRetention
derivativeWorkAllowed + derivativeDatabase + shareAlike
combineWithOtherProvider + backfillAllowed
redistributeRaw + redistributeEmbedded
displayWithoutProviderMap
source/author/disclosure attribution contract
modelTrainingAllowed (与 LLM inference 分开)
purgeOnEnd + purgeEvidence
termsRecheckAt + owner + legalReviewStatus
```

Policy 任何关键字段为 unknown 时 fail closed。

## 8. 应新增的工程验收与实测

### 8.1 Model conformance 必测矩阵

每个 `provider + deployment + model + region + protocol` 独立测试：

1. stream text/reasoning/final 分帧与 abort；
2. thinking 开关/effort 是否实际生效；
3. tool history round-trip，尤其 DeepSeek reasoning preservation；
4. JSON object、strict schema、unsupported keyword、空响应、截断；
5. usage、cache hit、returned model/version、429/5xx/content filter；
6. image role/format/size/detail、旋转、裁切、多图；
7. provider SDK 与 AI SDK 同 fixture 是否等价；
8. timeout/fallback 总 deadline，safety refusal 不 provider-hop；
9. data class/region policy 在请求发送前 fail closed；
10. prompt/response/reasoning 默认不进入 telemetry。

### 8.2 OCR fixture

按语言和风险分层：

- zh/en/es/ru/ar；
- 菜单、价格、地址、站名、票据、营业告示、过敏原；
- 小字、反光、倾斜、透视、竖排、混合字体、手写；
- CER + field exact match + number/currency/date/name exactness；
- bbox IoU/reading order；
- unknown/`?` recall 与静默错误率；
- 低风险通用识别和高风险翻译分别出结论。

红线不是“平均 CER 很低”，而是金额、站点、时间、过敏原等高风险字段静默错误为 0；否则显示原图、原文和人工确认。

### 8.3 Voice fixture

分段 pipeline 与 LiveTranslate 使用同一录音/真机：

- 五语双向到中文/英文；
- 噪声、口音、快慢语速、数字、地址、专名、站名；
- source WER/CER、translation entity exactness、adequacy；
- first partial、first playable audio、final transcript、turn completion；
- manual commit、`session.finish`、断线重连、后台切换、蓝牙耳机；
- tentative/final UI 状态与只持久化 final；
- fixed voice，不启用 clone；
- 本地权限撤销、raw audio TTL/delete receipt。

### 8.4 RAG/Explore fixture

- canonical ID/alias exact recall = 100%；
- 五语 qrels，尤其中文/阿拉伯文 lexical；
- native FTS vs `pg_trgm` vs PGroonga vs vector/RRF；
- `query/document text_type` 对比；
- expired/draft/license-blocked/private Fact 泄漏 = 0；
- ANN（若启用）对 exact truth 的 filter-aware recall；
- rerank no-op、失败和 budget fallback；
- citation claim-to-Fact ID 覆盖与 freshness。

### 8.5 平台与数据验收

- 4.5 MB 以上媒体不进入 Vercel request body；
- signed upload 只能写 owner-scoped immutable path；
- object TTL、provider TTL、delete receipt 三者一致；
- WebRTC/AOQ/WS 在真实 Vercel plan 和中国/国际网络下对测；
- Supavisor transaction mode 禁用 prepared statements；
- queue lease expiry/replay/poison/quarantine/worker crash；
- service-role retrieval 仍执行显式 owner/eligibility/license filters；
- trial provider 到期自动禁用并验证 purge。

## 9. 对两份报告的具体优化映射

### 9.1 整体研究报告

建议修改：

1. **0.3 模型组合**：标明 Flash public beta、Pro GA、Vision experimental；普通 DeepSeek 路由显式 thinking off；Qwen snapshot 写全 ID；加入 Qwen3.8 Max/Kimi K3/GLM-5.3 eval；加入 LiveTranslate challenger和地域列。
2. **5 模型治理**：把 `releaseStage/deploymentOperator/protocol` 加入 registry；DeepSeek strict 标 beta endpoint；Kimi/GLM 更新型号。
3. **6 必选多模态**：在分段 voice pipeline 后加入端到端 challenger；补 Qwen OCR/TTS 地域阻断、tentative/final、Realtime 鉴权拓扑和 Files API retention。
4. **7 外部数据**：扩展 License Registry 的 combine/backfill/share-alike/trial/purge 字段。
5. **8 RAG**：补 `text_type` transport、五语 lexical/PGroonga eval和 service-role bypass 风险。
6. **10 安全隐私**：补 direct-to-storage、默认禁止 voice clone、provider file expiration/delete receipt。
7. **11 质量可靠性**：release stage 和 region 进入路由资格；所有供应商声称的 latency 只作 benchmark 候选，不作 SLO。

### 9.2 工程开发与验收报告

建议修改：

1. **模块所有权**：`media` 拆 batch job 与 realtime session；新增 `realtime-signaling` 边界，不把 WS/WebRTC 状态塞入 chat adapter。
2. **推荐目录**：providers 下拆 `chat/ocr/translation/embedding/rerank/speech/realtime`，共享的只是 domain contracts 与 policy gate。
3. **数据架构**：embeddings 加 model/region/dimension/textType/contentHash/indexVersion；media object 与 provider file 分开记录 TTL/delete receipt。
4. **Queue/outbox**：把“dead-letter”改为应用实现的 retry/quarantine，不声称 pgmq 自动提供。
5. **AI SDK 决策**：conformance 只覆盖 chat lane；专用 DashScope/Responses/Realtime adapter 单独验收。
6. **Security**：大文件 direct upload、service-role bypass、Realtime key 不下发、voice clone off。
7. **Environment**：region 决策前不得冻结 Qwen OCR/TTS 型号；Vercel Fluid/WebSocket feature status 成为环境能力。
8. **测试金字塔**：加入 protocol contract、media direct upload、WebRTC/WS、queue poison、license expiry、multilingual lexical qrels。
9. **Acceptance matrix**：DeepSeek beta/experimental 不得被写作 GA；当前 runtime 仍 NOT IMPLEMENTED，不因官方模型上线改变。

## 10. 最终增量裁决

1. **DeepSeek V4 Flash-0731 仍可作为最有希望的文本主力，但它是 public beta。** 正确策略是显式关闭普通路由 thinking、feature flag/canary、强 conformance、可快速回退，而不是因用户偏好或价格直接定为“最稳定”。
2. **Vision Exp 是正式可调用的实验多模态路由，不是基础 Flash 自动获得图片能力，也不是专用 OCR 的替代证明。**
3. **Qwen3.5 LiveTranslate 是本轮最值得新增的产品候选。** 它直接覆盖五语、push-to-talk、文本+音频和新加坡，但必须与分段 pipeline 做同集评测，保留 final transcript 和纠错能力。
4. **生产 region 是 P0 架构决定。** Qwen OCR 和 Qwen Audio 3.0 TTS 的北京限制会直接改变 mandatory 多模态栈；不能先写死型号再晚点选 region。
5. **Kimi K3、GLM-5.3、Qwen3.8 Max 应进入高质量 challenger 集，而不是扩展首发日常路由。** Kimi/GLM always-thinking 更适合异步 critique。
6. **AI SDK 只能减少 chat transport 样板。** OCR高级能力、embedding `text_type`、ASR、TTS、LiveTranslate 都需要独立 adapter/protocol conformance。
7. **Next.js/Vercel 模块化单体仍可成立，但媒体必须直传 Storage，Realtime 优先 signaling + provider direct media。**
8. **Supabase/Postgres exact-first RAG 方向正确。** 需要补 service-role 权限、pgmq 重放/毒消息、serverless pooler和中文/阿拉伯文 lexical eval。
9. **外部来源 POI 必须继续是带引用候选，经审核后才进入 Canonical POI。** Google/高德不能作为默认可持久化底库；OSM 要从 extract/licensed provider 进入并履行 ODbL；航空只接合同允许的一家。

## 11. 一手来源索引

### DeepSeek

- [Change Log](https://api-docs.deepseek.com/updates)
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Tool Calls and strict beta](https://api-docs.deepseek.com/guides/tool_calls)
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode)
- [Vision](https://api-docs.deepseek.com/guides/vision)
- [Files API](https://api-docs.deepseek.com/guides/files_api)

### Alibaba Cloud Model Studio / Qwen

- [Recommended models and regional endpoints](https://help.aliyun.com/en/model-studio/models)
- [Qwen3.7 Plus](https://help.aliyun.com/en/model-studio/qwen3-7-plus)
- [Qwen3.8 Max](https://help.aliyun.com/en/model-studio/qwen3-8-max)
- [Qwen OCR](https://help.aliyun.com/en/model-studio/qwen-vl-ocr)
- [Realtime ASR](https://help.aliyun.com/en/model-studio/real-time-speech-recognition-user-guide)
- [ASR model matrix](https://help.aliyun.com/en/model-studio/asr-model/)
- [Qwen-MT](https://help.aliyun.com/en/model-studio/machine-translation)
- [Qwen-MT API](https://help.aliyun.com/en/model-studio/qwen-mt-api)
- [Qwen TTS](https://help.aliyun.com/en/model-studio/non-realtime-tts-user-guide)
- [Qwen3.5 LiveTranslate](https://help.aliyun.com/en/model-studio/qwen3-5-livetranslate-flash-realtime)
- [Realtime token authentication](https://help.aliyun.com/en/model-studio/realtime-token-authentication)
- [Embedding](https://help.aliyun.com/en/model-studio/embedding)
- [Rerank](https://help.aliyun.com/en/model-studio/rerank)
- [Model pricing and regional availability](https://help.aliyun.com/en/model-studio/model-pricing)

### Kimi / GLM

- [Kimi model list and deprecations](https://platform.kimi.ai/docs/models)
- [Kimi K3](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)
- [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3.md)
- [GLM Function Calling](https://docs.bigmodel.cn/cn/guide/capabilities/function-calling)
- [GLM Structured Output](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)

### Next.js / Vercel / AI SDK

- [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [AI SDK telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
- [Next.js Server Actions limits](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [Vercel large-body guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Vercel WebSocket support](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- [Vercel WebSocket lifecycle](https://vercel.com/i/websocket-vs-server-sent-events)

### Supabase / Postgres

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [pgmq upstream](https://github.com/pgmq/pgmq)
- [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Supabase PGroonga](https://supabase.com/docs/guides/database/extensions/pgroonga)
- [pgvector upstream](https://github.com/pgvector/pgvector)
- [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch-controls.html)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

### External data and licensing

- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Maps service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [高德开放平台服务协议](https://lbs.amap.com/pages/terms/)
- [Mapbox temporary vs permanent geocoding](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/)
- [OSM copyright and ODbL](https://www.openstreetmap.org/copyright)
- [OSM Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
- [OSM API policy](https://operations.osmfoundation.org/policies/api/)
- [OSM Tile policy](https://operations.osmfoundation.org/policies/tiles/)
- [OAG Evaluation License](https://www.oag.com/flight-info-api-evaluation-license-agreement)
- [FlightAware AeroAPI Standard License](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License.pdf)
- [12306 Terms of Service](https://www.12306.cn/en/rule.html)

## 12. 尚未验证，不能写成结论

- 用户四家 API 账号当前实际可用 model、region、tier、账单、rate limit和企业条款；
- DeepSeek Flash public beta/ Vision experimental 在 VisePanda 五语 fixture 上的真实稳定性；
- DeepSeek direct service 的数据处理地域、DPA和最终删除时限；
- Qwen3.5 OCR 是否可通过用户特殊合同在新加坡/其他区域部署；
- Qwen LiveTranslate WebRTC/AOQ 对 Web PWA、iOS、Android 的可用性和弱网表现；
- Qwen LiveTranslate 与分段 pipeline 的实际质量、延迟、成本、可纠错性；
- Vercel 当前账号是否启用 Fluid Compute WebSocket beta及其 preview/production 限制；
- Supabase project region、RLS、Storage、Queues、pgvector/PGroonga extension 和备份配置；
- Google/高德/Mapbox/OSM/航空 provider 实际商业合同是否允许发送给 LLM、embedding、翻译或 TTS；
- 任何模型或供应商 benchmark 对 VisePanda 旅客任务的外推有效性。
