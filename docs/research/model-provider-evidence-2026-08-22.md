# VisePanda 模型层官方证据底稿（2026-08-22）

- 状态：研究底稿，不是最终架构决策
- 核验日期：2026-08-22（Asia/Shanghai）
- 范围：阿里云百炼 / Qwen、DeepSeek、Moonshot / Kimi、智谱 / GLM，以及旅行翻译所需 ASR、TTS、OCR、视觉 POI 候选能力
- 方法：只采用厂商官方文档、官方模型卡、官方价格页、官方协议，以及必要的中国政府法规页面；未调用任何付费 API
- 重要限制：本文证明的是“厂商公开声明的能力与契约”，不是 VisePanda 场景中的质量、延迟或稳定性实测。厂商自报 Benchmark 不可直接当作跨厂商旅游问答排名。

## 1. 先给结论

### 1.1 推荐进入第一轮实测的最小组合

| 任务 | 第一候选 | 第二候选 / 回退 | 证据结论 |
|---|---|---|---|
| 普通对话、解释、轻量规划 | `deepseek-v4-flash`，简单任务关闭思考 | `qwen3.7-flash` | DeepSeek 当前托管 API 的底层版本就是 V4-Flash-0731；Qwen Flash 成本显著更低，但二者均需用 VisePanda 自有五语旅行集实测 |
| 复杂问答 / 复杂工具编排 | `deepseek-v4-pro` 或 `qwen3.7-plus` | `kimi-k3` 仅进入影子评测 | 不能从编码 Benchmark 推导旅行质量；应以工具调用成功率、事实引用、五语质量和 p95 延迟决定 |
| Trip Canvas 强类型 Patch | `qwen3.7-plus` + `json_schema` + `strict:true` | Kimi K3 / K2.7 Code 影子评测；DeepSeek strict tool 作为另一协议回退 | Qwen Plus 原生支持 JSON Schema；DeepSeek `response_format` 只有 `json_object`，只能借 Beta strict tool 获得 schema 约束 |
| 图片文字提取后翻译 | 新加坡：`qwen-vl-ocr`；北京可评测 `qwen3.5-ocr` | `qwen3.7-plus` 通用视觉 | 专用 OCR 与通用翻译分两步，保留原文、框选区域和翻译，不让单次 VLM 调用同时“看、猜、翻译” |
| 实时 STT | `qwen-audio-3.0-asr-flash-streaming` | `qwen3-asr-flash-realtime` | 官方覆盖 zh/en/es/ru/ar，支持流式；这是当前四家中唯一被公开文档完整证明覆盖 VisePanda 五语的方案 |
| 实时 TTS | `qwen-audio-3.0-tts-flash` | 同平台 Plus 质量档 | 官方 API 语言枚举含 zh/en/es/ru/ar；首包延迟宣称小于 200ms，需真机弱网实测 |
| 景点 / POI 图片识别（可选） | `qwen3.7-plus` / `qwen3.7-flash` 只产候选 | `deepseek-v4-flash-vision-exp` 仅实验 | 视觉模型结果不能直接写入 Trip Canvas；必须结合 GPS / 城市范围，再用高德 POI 搜索或受控内容库核验 |

这不是“把四家都接上”。建议生产首版只保留两家文本供应商：**DeepSeek 负责成本敏感的自然语言生成，Qwen 负责严格结构、多模态、ASR/TTS/OCR**。Kimi 与 GLM 先进入同一离线评测框架，不进入实时路由，除非它们在 VisePanda 自有数据上赢得某一明确任务。

### 1.2 必须纠正的模型名称

- DeepSeek 官方托管 API 的请求参数是 `model="deepseek-v4-flash"`。官方 2026-07-31 更新说明该 API 已升级到正式版，当前价格页把其模型版本明确写为 `DeepSeek-V4-Flash-0731`。[更新日志](https://api-docs.deepseek.com/zh-cn/updates/)；[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- `deepseek-ai/DeepSeek-V4-Flash-0731` 是官方开源权重 / 自托管模型 ID。[官方模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731)
- 因此，不要向官方托管 API 发送 `deepseek-v4-flash-0731`。若配置层希望记录底层版本，应拆成 `providerModelId=deepseek-v4-flash` 与 `observedVersion=DeepSeek-V4-Flash-0731`，并定期核验版本漂移。

## 2. 四家文本 / 多模态 API 官方能力

### 2.1 横向矩阵

| 维度 | Qwen / 百炼 | DeepSeek | Kimi / Moonshot | GLM / 智谱 |
|---|---|---|---|---|
| 截至核验日的重点型号 | `qwen3.8-max`、`qwen3.7-plus`、`qwen3.7-flash` | `deepseek-v4-flash`（版本 0731）、`deepseek-v4-pro`（版本 0813）、实验 `deepseek-v4-flash-vision-exp` | `kimi-k3`、`kimi-k2.7-code`、`kimi-k2.7-code-highspeed`、`kimi-k2.6` | `glm-5.3` 已于 2026-08-14 发布；`glm-5.2` 仍可用；视觉为 `glm-5v-turbo` |
| 上下文 | 三个重点型号均 1M | 三个当前型号均 1M | K3 1M；K2.7 / K2.6 256K | GLM-5.2 1M；GLM-5.3 与 5.2 同基座但中文模型卡尚未完整更新，冻结前需调用模型元数据或得到书面确认；API 最大输出 128K |
| 输入模态 | 3.8 Max / 3.7 Plus / 3.7 Flash 均支持文本、图片、视频 | Flash / Pro 是文本；Vision-Exp 支持图片且官方标注实验 | K3 / K2.6 支持文本、图片、视频 | GLM-5.3 / 5.2 为文本；5V-Turbo 支持图像、视频、文本、文件 |
| Function / Tool Calling | 支持 | 支持；strict tool 为 Beta | 支持；K3 可用 `required` | 支持，但通用 Chat API 的 `tool_choice` 公开枚举仅 `auto` |
| JSON Object | 支持 | 支持，但官方承认偶发空 `content` | 支持 | 支持 |
| 原生 JSON Schema | 仅 Qwen3.7 Plus / Max、Qwen3.8 Max 被官方列为支持；Flash 未列入 | `response_format` 不支持；可改走 Beta strict tool | K3、K2.7 Code 支持 `json_schema` + strict；K2.6 复杂 schema 官方提示不稳定 | 当前 Chat API 只公开 `text` / `json_object`，未公开 `json_schema` |
| 流式 | 支持 SSE | 支持 | 支持 SSE | 支持 SSE |
| 缓存 | 隐式 + 显式 | 默认自动硬盘缓存 | 自动前缀缓存 | 隐式缓存 |
| 思考模式 | 3.7 / 3.8 默认开启，可显式关闭 | 默认开启，默认 high；支持 low / high / max | K3 始终开启，默认 max；K2.6 可开关 | 5.3 不能关闭，支持 low / high / max；5.2 可通过 effort 关闭或降级 |
| 公开限流 | Qwen 3.7 Flash 北京 30K RPM / 5M TPM，新加坡 15K / 5M；Plus 北京 30K / 5M、新加坡 15K / 5M | Flash 2500 并发，Pro 500，Vision-Exp 2500 | 累计充值决定并发、RPM、TPM、TPD；K3 国内最低充值 10 元解锁 | 按模型、账户等级动态；具体额度在控制台，高峰期还可能动态限流 |
| 适合承担的职责 | 严格结构、多模态、语音、OCR；也可作文本主模型 | 文本生成、推理、工具 Agent；视觉仅实验 | 严格 schema / 长上下文的评测候选 | 通用长任务与评测候选；当前结构化契约弱于 Qwen / Kimi |

### 2.2 Qwen / 阿里云百炼

官方推荐文本模型表显示 `qwen3.8-max`、`qwen3.7-plus`、`qwen3.7-flash` 均具备 1M 上下文、思考、Function Calling 和结构化输出能力。[文本生成模型](https://help.aliyun.com/zh/model-studio/text-generation-model)

需要把“结构化输出”拆开理解：

- JSON Object 覆盖 Qwen3.7 Flash / Plus / Max；使用时 prompt 必须含 `json` 字样。
- JSON Schema 的官方支持列表只有 Qwen3.7 Plus、Qwen3.7 Max、Qwen3.8 Max。不能因为 Flash 模型卡写“结构化输出支持”就推断它支持 `json_schema`。[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)

Qwen3.7 Plus / Flash 都是原生视觉语言模型，支持图片、文本和视频输入、Function Calling、缓存和流式输出。Plus 模型卡给出 1M 上下文、最大输出 131,072；Flash 的模型卡也写 131,072，但视觉总览仍写 64K，官方页面存在冲突，冻结契约前必须用免费额度做 `max_completion_tokens` conformance 测试。[Qwen3.7 Plus](https://help.aliyun.com/zh/model-studio/qwen3-7-plus)；[Qwen3.7 Flash](https://help.aliyun.com/zh/model-studio/qwen3-7-flash)；[视觉理解](https://help.aliyun.com/zh/model-studio/vision-model)

Qwen3.7 系列默认开启思考模式；简单路由、翻译和 Trip Patch 应显式关闭，避免不必要的延迟与推理 token。复杂任务再按评测开启，并设置 `thinking_budget`。[深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking/)

缓存规则：隐式缓存无需配置、不可关闭，命中按标准输入价 20%；显式缓存创建按 125%、命中按 10%，TTL 5 分钟且命中续期。一般隐式缓存门槛为 256 token，但 Qwen3.7 系列官方注明约 2,000 token；显式缓存门槛 1,024 token。[上下文缓存](https://help.aliyun.com/zh/model-studio/context-cache)

北京地域原价（人民币 / 百万 token）：

| 模型 | 计费区间 | 输入 | 输出 | 隐式缓存命中 |
|---|---:|---:|---:|---:|
| `qwen3.7-flash` | <=32K | 0.2 | 0.8 | 0.04 |
| `qwen3.7-flash` | 32K–256K | 0.6 | 2.4 | 0.12 |
| `qwen3.7-plus` | <=256K | 2 | 8 | 0.4 |
| `qwen3.7-plus` | 256K–1M | 6 | 24 | 1.2 |
| `qwen3.8-max` | <=1M | 12 | 36 | 以当前模型价格页为准 |

新加坡同型号价格不同，例如 Qwen3.7 Flash <=32K 为 0.225 / 0.974，Qwen3.7 Plus <=256K 为 2.998 / 11.991。区域不是单纯价格开关：地域决定接入点和静态数据存储位置，服务部署范围决定推理节点地理边界，API Key 不跨地域通用。[Qwen3.7 Flash 模型卡](https://help.aliyun.com/zh/model-studio/qwen3-7-flash)；[Qwen3.7 Plus 模型卡](https://help.aliyun.com/zh/model-studio/qwen3-7-plus)；[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)；[地域与部署范围](https://help.aliyun.com/zh/model-studio/regions/)

### 2.3 DeepSeek

截至核验日，官方价格页列出的托管 API 型号为：

| API `model` | 官方标注版本 | 模态 / 状态 | 上下文 / 最大输出 |
|---|---|---|---|
| `deepseek-v4-flash` | DeepSeek-V4-Flash-0731 | 文本，正式版 | 1M / 384K |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813 | 文本，正式版 | 1M / 384K |
| `deepseek-v4-flash-vision-exp` | DeepSeek-V4-Flash-Vision-Exp | 视觉实验版，2026-08-21 上线 | 1M / 384K |

三者均公开支持 JSON Output、Tool Calls、Responses API、Anthropic API、缓存与前缀续写；Vision-Exp 不支持 FIM。[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)；[更新日志](https://api-docs.deepseek.com/zh-cn/updates/)

DeepSeek 的 `response_format` 只能设 `json_object`，官方没有 `json_schema` 模式，并承认 JSON Output 偶发返回空 `content`。若 Trip Patch 需要严格 schema，可使用 `https://api.deepseek.com/beta` + 所有 function `strict:true` 的 Beta strict tool；这与 Qwen / Kimi 的 `response_format.json_schema` 不是同一协议。[JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/)；[Tool Calls](https://api-docs.deepseek.com/zh-cn/guides/tool_calls)

思考模式默认开启、默认 high，当前正式版支持 low / high / max，也可关闭。携带 `tools` 的思考请求必须把每个 assistant 的完整 `reasoning_content` 回传到后续请求，即使当轮没有实际 tool call，否则可能 400。[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)

缓存默认自动启用，按完整前缀单元命中；缓存为尽力而为，构建需秒级，闲置数小时到数天会清理。返回 `prompt_cache_hit_tokens` 与 `prompt_cache_miss_tokens`。[上下文缓存](https://api-docs.deepseek.com/zh-cn/guides/kv_cache/)

2026-08-17 生效的人民币价格采用峰谷制：

| 模型 | 时段 | 缓存命中输入 / M | 未命中输入 / M | 输出 / M | 并发 |
|---|---|---:|---:|---:|---:|
| Flash / Vision-Exp | 空闲 | 0.05 | 1.5 | 4.5 | 2500 |
| Flash / Vision-Exp | 高峰 | 0.10 | 3.0 | 9.0 | 2500 |
| Pro | 空闲 | 0.15 | 4.5 | 13.5 | 500 |
| Pro | 高峰 | 0.30 | 9.0 | 27.0 | 500 |

高峰为北京时间 09:00–12:00、14:00–18:00，其余为空闲。旧草稿中 0.02 / 1 / 2 元的价格已经过期，不能进入预算。[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

结论：`deepseek-v4-flash` 值得作为自然语言主候选，但它不能独自完成 VisePanda 的严格 Canvas Patch、稳定 OCR、STT 和 TTS。Vision-Exp 上线仅一天且官方直接标注“实验性质”，只能 feature flag + 影子流量，不能作为 P0 依赖。

### 2.4 Kimi / Moonshot

当前模型目录把 Kimi K3 定义为旗舰：原生视觉、1M 上下文；K2.7 Code / Highspeed 与 K2.6 为 256K。`kimi-k2.5` 和 `moonshot-v1` 已停止向新用户开放，并计划 8 月 31 日全平台下线；旧 K2 系列已于 5 月 25 日下线。[模型列表](https://platform.kimi.com/docs/models)

K3 的生产相关能力很完整：

- 始终开启思考，`reasoning_effort=low|high|max`，默认 max，不能关闭。
- 支持文本、图片、视频；公网图片 URL 不支持，需 base64 或 `ms://file-id`。
- 支持 `response_format.type=json_schema` + `strict:true`；支持自定义工具及 `tool_choice="required"`。
- 自动前缀缓存，无需 ID 或 TTL；前一个请求 prompt 超过 256 token 才会构建可命中缓存。
- 多轮及工具调用必须原样回传完整 assistant message。[Kimi K3](https://platform.kimi.com/docs/guide/kimi-k3-quickstart)

Kimi Structured Output 官方说明：K3 稳定支持嵌套对象、数组和 `anyOf`；K2.7 Code 对复杂 schema 支持最稳；K2.6 在 `$ref`、`oneOf` 和 Partial Mode 等复杂场景可能忽略约束或输出 Markdown，需要业务层复验。strict schema 使用 MFJS 方言，可用官方 `walle` CLI 静态检查，但文档同时提醒线上兼容性仍需实测。[Structured Output](https://platform.kimi.com/docs/guide/response_format)

国内官网当前原价（人民币 / 百万 token）：

| 模型 | 缓存命中输入 | 未命中输入 | 输出 |
|---|---:|---:|---:|
| K3 | 2.0 | 20.0 | 100.0 |
| K2.7 Code | 1.3 | 6.5 | 27.0 |
| K2.6 | 1.1 | 6.5 | 27.0 |

来源：[Kimi 开放平台官网](https://platform.kimi.com/)。K3 需累计充值至少 10 元解锁，赠送代金券不能使用。账户累计充值额决定并发、RPM、TPM、TPD，平台还声明可能动态调整规则。[Kimi K3 访问条件](https://platform.kimi.com/docs/guide/kimi-k3-quickstart)；[充值与限速](https://platform.kimi.com/docs/pricing/limits)

结论：K3 的强 schema 与多模态能力值得进入离线评测，但始终思考、较高单价和充值等级限流使其不适合直接做所有在线请求的默认模型。K2.6 不应承担关键复杂 schema。

### 2.5 GLM / 智谱

GLM-5.3 已于 2026-08-14 正式发布，官方称它与 GLM-5.2 使用同一基座，提升来自后训练；API 已接受 `model="glm-5.3"`。5.3 只支持开启思考，强度 low / high / max，默认 max。[GLM-5.3 发布说明](https://z.ai/blog/glm-5.3)；[Chat Completions API](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)

当前 Chat API 的关键约束：

- `stream=true` 支持 SSE；GLM-5.3 / 5.2 最大输出 128K。
- 支持 Function Calls，但 `tool_choice` 公开枚举只有 `auto`，无法像 Kimi 那样锁为 required 或具体函数。
- `response_format` 公开值只有 `text` 与 `json_object`，没有 `json_schema`。
- `do_sample=false` 可用于翻译 / 确定性任务，但不能替代 schema 约束。
- 缓存为隐式缓存，`usage.prompt_tokens_details.cached_tokens` 返回命中量。[Chat Completions API](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)；[上下文缓存](https://docs.bigmodel.cn/cn/guide/capabilities/cache)

公开价格页在本次核验时仍列出 GLM-5.2 为 8 元输入 / 28 元输出 / 2 元缓存命中（每百万 token），但没有查到 GLM-5.3 的独立按量 API 单价。不能自行假设 5.3 与 5.2 同价。[智谱价格页](https://bigmodel.cn/pricing)

速率限制按用户权益等级和模型维度动态设置，具体数值需登录控制台；工作日下午 15:00–18:00 等高峰期可能动态限流，平台过载另有 1305 错误。[速率限制](https://docs.bigmodel.cn/cn/api/rate-limit)

视觉候选 `glm-5v-turbo` 支持图像、视频、文本与文件，200K 上下文、128K 最大输出、Function Call，价格在 <=32K 时为 5 元输入 / 22 元输出。[GLM-5V-Turbo](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5v-turbo)；[智谱价格页](https://bigmodel.cn/pricing)

结论：GLM-5.3 上线时间短、单价未公开、当前没有 JSON Schema / 强制 tool choice；先作为高质量文本影子候选，不进入 Trip Canvas 主链。

## 3. 必选语音、OCR 与可选 POI 能力

### 3.1 STT：推荐 Qwen-Audio 3.0

百炼官方当前推荐：实时识别使用 `qwen-audio-3.0-asr-flash-streaming`，非实时文件转写使用 `qwen-audio-3.0-asr-flash-filetrans`，短文件可用 `qwen-audio-3.0-asr-flash`。实时版通过 WebSocket 流式输入和输出，支持热词及 Prompt 上下文；文件版支持说话人分离。[语音识别选型](https://help.aliyun.com/zh/model-studio/asr-model)

其官方语言列表包含中文、英语、西班牙语、俄语、阿拉伯语，以及更多语言，覆盖 VisePanda 当前 `zh/en/es/ru/ar` 五语。实时流支持多种常用格式且不限时长。[语音识别选型](https://help.aliyun.com/zh/model-studio/asr-model)

价格：实时 Streaming 北京 0.00033 元 / 秒、新加坡 0.00066 元 / 秒；文件转写北京 0.00022 元 / 秒、新加坡 0.00026 元 / 秒。[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

智谱 `glm-asr` 价格为 0.06 元 / 分钟，支持流式，但官方只证明中文、英语和八种中国方言，不能覆盖西语、俄语、阿语的刚需，不适合作为统一 STT。[GLM-ASR](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-asr)

### 3.2 TTS：推荐 Qwen-Audio 3.0 TTS Flash

`qwen-audio-3.0-tts-flash` 面向实时交互，官方宣称首包延时小于 200ms，支持细粒度情绪、语气、角色、语速和音量控制。北京 / 新加坡均可用，180 RPM；价格分别为 1 元与 1.12413 元 / 万字符。[模型卡](https://help.aliyun.com/zh/model-studio/qwen-audio-3-0-tts-flash)

其 API 语言枚举明确包含 `zh`、`en`、`es`、`ru`、`ar`，覆盖 VisePanda 五语。[Java SDK / 语言参数](https://help.aliyun.com/zh/model-studio/cosyvoice-java-sdk)

`qwen3-tts-*` 与 CosyVoice 虽然更便宜或有丰富音色，但当前官方语言列表不含阿拉伯语；它们不能单独满足 VisePanda 的五语硬要求。[语音合成模型](https://help.aliyun.com/zh/model-studio/tts-model)

智谱 GLM-TTS 支持流式与非流式，但公开模型页未给出多语言清单，示例和音色均为中文；在补齐五语官方证明与实测前不应替代 Qwen-Audio TTS。[GLM-TTS](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts)

### 3.3 图片文字识别与翻译

建议管线：

1. 原图预处理（旋转、裁剪、压缩；原图不进入长期日志）。
2. 专用 OCR 只产 `{blocks:[{text,bbox,order}], detectedLanguage}`。
3. 业务层保留原文，另发文本翻译请求，产 `{sourceText, translatedText, targetLocale}`。
4. UI 同时显示原文与译文，低置信或关键内容允许用户重拍 / 手改。

百炼官方说明 `qwen3.5-ocr` / `qwen-vl-ocr` 专为文档、表格、手写内容和文字定位优化；Qwen3.7 Plus / Flash 可做通用图片文字提取。北京 `qwen-vl-ocr` 为 0.3 / 0.5 元每百万输入 / 输出 token，新加坡为 0.514 / 1.174 元。[视觉理解](https://help.aliyun.com/zh/model-studio/vision-model)；[Qwen OCR](https://help.aliyun.com/zh/model-studio/qwen-vl-ocr)；[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

不要用“让 VLM 直接翻译图片”替代 OCR 原文：这样无法区分 OCR 错、翻译错和模型补写，也无法让用户核对菜单价格、地址、站名等高风险字段。

### 3.4 景点 / POI 图片识别（可选）

Qwen3.7 Flash 官方强调“万物识别、真实世界感知与空间智能”，DeepSeek 在 8 月 21 日上线 Vision-Exp，Kimi K3 / K2.6 也支持图片和视频。因此它们可产出 POI **候选**，不能产出已确认 POI。[Qwen3.7 Flash](https://help.aliyun.com/zh/model-studio/qwen3-7-flash)；[DeepSeek 更新日志](https://api-docs.deepseek.com/zh-cn/updates/)；[Kimi 视觉](https://platform.kimi.com/docs/guide/use-kimi-vision-model)

推荐核验链：图片 EXIF / 用户授权 GPS -> 视觉候选 `{names, visibleText, landmarkClues}` -> 城市 / 半径限制 -> 高德 POI 关键词或周边搜索 -> 唯一 POI ID / 地址 / 坐标候选 -> 用户确认 -> 才能写入 Trip Canvas。高德官方搜索 API 支持关键字、周边、多边形和 ID 查询；国际接口 / 海外服务可能需要单独授权。[高德国内 POI 搜索](https://lbs.amap.com/api/webservice/guide/api/search/)；[高德国际 POI 搜索](https://lbs.amap.com/api/web-service/guide/searchs)

## 4. 区域、隐私与合规证据

### 4.1 厂商数据处理边界

| 厂商 | 官方证据 | VisePanda 需要的处置 |
|---|---|---|
| 阿里云百炼 | 地域决定接入点与静态数据存储位置，部署范围决定推理位置；传输加密。国际站声明不会把客户数据用于模型训练，并使用 AES-256 保护传输数据 | 若面向国际用户，优先评估新加坡 / 全球部署范围；一个用户会话不要跨地域；签约前核对产品条款、日志与删除策略 |
| DeepSeek | 隐私政策适用于 API，输入和输出可能经加密、去标识后用于模型训练，可在产品中关闭“数据用于优化体验”；个人信息直接在中国境内处理和存储 | 必须确认该退出设置是否覆盖开放平台 API / 企业账号；未书面确认前，禁止发送护照、支付、精确轨迹等敏感信息 |
| Kimi 国内 | 开放平台服务协议称只按协议和开发者有记录指示处理客户业务数据，不为自身目的处理；但隐私政策又说用户内容有助于优化模型 | 两份文件口径需通过企业合同 / DPA 澄清；不要仅凭普通隐私页判定“零训练” |
| Kimi 国际 | 国际隐私政策称服务器位于新加坡，但用户内容可用于训练和改进底层技术 | 需明确 opt-out 或企业数据条款后才能处理真实旅行者图片、语音与轨迹 |
| 智谱 | 用户协议称用户上传数据归用户所有，除执行服务要求外不作未授权使用或披露 | 仍需核对留存期、删除、训练、跨境和子处理者；公共 API 的具体限流与价格也需控制台确认 |

来源：[百炼地域](https://help.aliyun.com/zh/model-studio/regions/)、[百炼安全与隐私](https://www.alibabacloud.com/help/en/model-studio/privacy-notice)、[DeepSeek 隐私政策](https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html)、[DeepSeek 开放平台协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)、[Kimi 国内服务协议](https://platform.kimi.com/docs/agreement/modeluse)、[Kimi 国内隐私政策](https://platform.kimi.com/docs/agreement/userprivacy)、[Kimi 国际隐私政策](https://platform.kimi.ai/docs/agreement/userprivacy)、[智谱用户协议](https://docs.bigmodel.cn/cn/terms/user-agreement)。

### 4.2 中国境内公开服务的最低合规门槛

- 《生成式人工智能服务管理暂行办法》适用于向中国境内公众提供生成文本、图片、音频、视频等内容的服务，也把 API 方式纳入“服务提供者”定义。是否需要备案、安全评估等应由律师和属地主管部门结合产品形态判断。[国家网信办原文](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)
- 已上线的生成式 AI 应用或功能应在显著位置 / 产品详情公示使用的已备案服务名称和备案号。[备案公告](https://www.cac.gov.cn/2024-04/02/c_1713729983803145.htm)
- 《人工智能生成合成内容标识办法》自 2025-09-01 生效，覆盖文本、图片、音频、视频，要求相应的显式 / 隐式标识；这对 TTS 导出的音频尤其重要。[标识办法](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)
- 图片、声音、精确位置、护照 / 身份证等可能构成个人信息或敏感个人信息，应遵循目的明确、最小必要、公开透明等原则；跨境传输需单独评估。[个人信息保护法](https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html)

本文不是法律意见。产品上线前应形成数据流图：采集端 -> VisePanda API -> 供应商地域 -> 日志 / 监控 -> 缓存 -> 删除，并逐字段标记数据类别、处理目的、保存期、授权、跨境与删除路径。

## 5. 对模型层开发的直接约束

1. **不要做“四模型投票”。** 先用固定任务路由：普通回答、严格 Patch、OCR、ASR、TTS、视觉候选。只有明确失败才回退，避免成本、延迟和不可解释分歧。
2. **供应商抽象不能只统一成 OpenAI 格式。** 必须保留 provider profile：`thinking`、`reasoning_content` 回传、`response_format` 方言、tool strict、缓存 usage 字段、流式 usage、图片输入格式、区域端点。
3. **Trip Canvas 只接受经过业务校验的命令。** 模型输出先过 JSON Schema / Zod、字段权限、版本号、幂等键、日期范围、POI 证据和冲突检测，再进入可预览 Patch；模型不能直接写库。
4. **事实质量依靠检索与证据，不依靠多模型“共识”。** 模型负责理解、选择工具与表达；营业时间、票务、交通、支付、签证等动态事实必须来自可追溯工具 / 内容库并带时间戳和来源。
5. **思考模式按任务显式设置。** 路由、翻译、OCR 后处理和 schema extraction 默认关闭；复杂规划 / 冲突解决才开启。Kimi K3 与 GLM-5.3 不能关闭，路由时要计入延迟与费用。
6. **版本用 API ID + 观测版本双记录。** 供应商的稳定别名会静默升级，例如 `deepseek-v4-flash` 已从预览切到 0731；每个响应日志记录请求模型、返回模型、provider revision（若提供）、prompt version 与 schema version。
7. **默认不记录原始语音 / 图片。** 生产日志只留 request id、尺寸 / 时长、语言、模型、token / 秒数、延迟、错误和用户确认结果；原始媒体采用短 TTL 对象存储，并有明确删除路径。

## 6. 上线前必须实测、当前官方资料无法证明的项目

### 6.1 五语旅行质量集

官方资料没有给出四家在 `zh/en/es/ru/ar` 旅游对话上的可比质量数据。至少建立以下金标集合，每个用例都包含期望工具、事实来源、允许假设、禁止声称、期望 Canvas Patch：

- 需求澄清与行程变更；
- 地铁 / 高铁 / 打车 / 支付失败恢复；
- 营业时间、票务、地址、路线等动态事实；
- 中西俄阿到中文的菜单、站牌、支付页面 OCR 翻译；
- 噪声、口音、代码切换、数字、金额、站名的 STT；
- 五语 TTS 的可懂度、自然度、数字 / 专名发音；
- 模糊或错误输入下拒绝编造、询问澄清和保留 `missing`；
- Trip Patch schema、幂等、冲突与局部失败。

### 6.2 指标

| 类别 | 建议指标 |
|---|---|
| 回答 | 事实支持率、无证据声称率、任务完成率、澄清正确率、五语人工评分 |
| 工具 | 工具选择准确率、参数 schema 通过率、工具循环完成率、无效 / 越权工具调用率 |
| Canvas | 首次 schema 通过率、业务约束通过率、可应用 Patch 率、用户确认率、错误写入率（目标必须为 0） |
| OCR | 字符 / 词错误率、数字金额错误率、版面顺序、翻译充分性、原文保留率 |
| STT | WER / CER、专名数字错误率、实时因子、首个 partial 延迟、final 延迟、断线恢复 |
| TTS | 首包延迟、播放完成率、专名数字发音、MOS / 人工可懂度、五语覆盖 |
| 运行 | TTFT、p50 / p95 / p99、错误率、429、超时、每成功任务成本、缓存命中率、回退率 |

### 6.3 当前未能核验或需重新核验

- GLM-5.3 的独立按量 API 单价、公开固定并发、完整 1M 模型卡；当前发布页、API 参考与模型概览更新不同步。
- 四家对旅行场景的真实 SLA、p95 / p99 延迟、跨语言质量与高峰稳定性；厂商页面不等于实测。
- DeepSeek 数据训练退出开关是否明确覆盖 API 请求；需企业支持 / 合同确认。
- Kimi 国内隐私政策与开放平台服务协议在“模型优化 / 自身目的处理”上的适用优先级。
- 百炼 Qwen3.7 Flash / Plus 最大输出在模型卡（131K）与视觉总览（64K）之间的冲突。
- Qwen-Audio TTS 的阿拉伯语在真实旅游专名、金额、地址上的可懂度；官方只证明“支持”，不证明质量。
- 高德国际 POI API 的商业授权、覆盖和配额；官方说明海外服务可能需工单授权。
- DeepSeek Vision-Exp 的 OCR、POI、结构化输出和生产稳定性；官方明确仍为实验模型。

## 7. 建议的第一轮无付费 / 小额受控验证顺序

1. 用控制台或免费额度核对四家 `/models` 与返回 `model` 字段，不打印密钥。
2. 先跑 30 条最小 conformance：流式、thinking 开关、usage、JSON Object、JSON Schema、tool choice、strict tool、超时、429、空 content、断线重连。
3. 再跑 200–500 条五语旅行金标，冻结 prompt / schema / 检索结果，禁止模型联网，以便公平比较模型本身。
4. 单独跑带工具的端到端集，事实工具结果固定回放；统计的是成功任务，不是 token 单价。
5. 单独跑手机端 STT / TTS / OCR 弱网与权限场景；浏览器桌面结果不能代替真实移动端。
6. 只有某型号在明确任务上达到阈值，才加入生产路由。Kimi / GLM 未胜出的任务继续留在影子评测，不为“已经有 API”而调用。

