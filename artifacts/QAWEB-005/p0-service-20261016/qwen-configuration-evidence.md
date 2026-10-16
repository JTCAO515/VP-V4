# P0 Qwen 实际配置字段证据

核验日期：2026-10-16（Asia/Shanghai）。只读 source + 原厂公开文档；本轮唯一新产物。
源码锚点：已合 QA `4abeeb41e87f2ac36f0efdb9ba94780ce0049a13`。下述 Agent/
ModelGateway/price/context 源与本分支相同，使用 `git show`/diff 确认，未合入或修改源码。
未读凭据、用户表或账号；未调用 models 列表、provider、DB、支付或目标运行入口。
Main 提供的 candidate image 已构建、缺配置 smoke PASS、旧 DB key 对既有 status RPC
认证200/enabledfalse，仅作为 Main 提供的事实；它们不能证明 Qwen key、模型权限或余额就绪。

## 一、源码已知事实

| 字段 | 已合源码事实 / 证据 |
| --- | --- |
| model | `PROTOCOL_MODELS.qwen` → `MODEL_PROFILES.qwen_37_strict.providerModelId` = `qwen3.7-plus-2026-05-26`。位置：model-gateway/index.ts:75、adapters/provider-protocol.ts:14。原 profile 标记 candidate/fixture_only 也保留；该标签不能证明账号激活。QA 的实际 HTTP adapter 使用此固定 model 常量，不让用户选择模型。 |
| provider / endpoint | qwen；允许旧 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` 或非 trial 的 `{workspace}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`。`VISEPANDA_QWEN_ENDPOINT` 是受信 root binding，必须与 policy、discovery、transport 完全相同；未配置时保留 legacy，并不证明当前实际 workspace。位置：adapters/provider-endpoints.ts:3–36。 |
| region | 代码只接受上述北京域名；域名语法不证明实际账号/业务空间/推理与存储地域/许可。其他地域需要另行部署决定，本任务不建议切换。 |
| context | QA consumer：最多6条历史消息、8个 source Turns；上游 history≤65536 bytes，所选文本≤16384 bytes，含 system 的序列化 prompt≤32768 bytes，user≤4000字符、assistant≤8000字符。位置：qa-agent-context/index.ts:8、session.ts:43–57。它们不是 token 数，不能直接当模型 context/token 计费。 |
| output / thinking | `/4` profile `maxOutputTokens` 整数1–4096，timeoutMs 整数1–60000。QA 无 thinkingBudget 字段；正常协议发 max_tokens 并令 enable_thinking=false。位置：qa-agent/hosted-profile.ts:29–32、provider-protocol.ts:241–246。不自动启用搜索、显式 cache 或另一个 model。 |
| tariff shape | qwen 闭键：priceVersion、pricing、reservedMicros、maxOutputTokens、timeoutMs、configurationId、configurationVersion。pricing 闭键 mode/inputMicrosPerMillion/outputMicrosPerMillion/cachedInputMicrosPerMillion；mode=flat 时 cached=null，cache_split 时 cached 必须正整数。输入/输出单价必须为正整数，不能用0或缺省代表未知价格。位置：jobs/staging-text-job.ts:8–13、77–102。 |
| currency / units | pricing 本身没有币种字段；原 model_budget_scopes.currency 为 CNY 或 USD。所有费率与 reserved 必须使用该 scope 同一币种的 micro-unit（1 currency unit=1,000,000 micros），单价分母是1,000,000 tokens。未核实际 scope 币种，不能混用人民币与美元价或暗中换汇。 |
| configuration | configurationId 为 UUID、configurationVersion 为正整数，写入原 destination receipt。源码没有向阿里云查询该 UUID 的注册表。它是内部受信配置审计身份，不是 Qwen model ID、workspace ID 或余额证明；需要真实已接受配置记录，不能随机造一个 UUID 宣称现有配置已就绪。 |

## 二、原厂当前可核价目与地域

以下都已实际打开，不使用第三方聚合报价。抓取日是观察时点，不等于账户合同生效日。

| 原厂来源 | 本轮可核事实 / 有效时点边界 |
| --- | --- |
| [阿里云中国站模型调用价格](https://help.aliyun.com/zh/model-studio/model-pricing) | 北京固定快照 `qwen3.7-plus-2026-05-26` 明列下表人民币原价。单次输入总量决定整次请求的输入/输出档位；K=1000、M=1,000,000。快照行没有滚动别名的“限时8折”标签。页面未返回可用更新时间或该快照价目独立生效日期；仅确认2026-10-16所见，最终按现有账号合同/账单。 |
| [阿里云 Context Cache](https://help.aliyun.com/zh/model-studio/context-cache) | 北京支持该快照隐式缓存。它自动发生、命中不保证；该类模型 cached 输入通常按标准输入20%，输出不折扣。OpenAI兼容 usage 的 `prompt_tokens_details.cached_tokens` 是 prompt_tokens 的子集。显式 cache 创建/读取是另一种计价，不能套入当前 cached split。 |
| [原厂快照模型说明](https://www.alibabacloud.com/help/en/model-studio/qwen3-7-plus) | 页面显示更新2026-10-11；明确快照 model ID，公开 context=1,000,000、非思考 max input=991808、max output=131072。这些是原厂上限，当前 QA 自有 output/bytes 限制更小。国际站页面为 USD 价格展示，不能据此认定本账号用 USD 或做隐式换汇。 |
| [地域及接入域名](https://help.aliyun.com/zh/model-studio/beijing-access-information) | 北京独立 API Key/模型列表不能跨区混用；实际 API Host 从既有业务空间管理页正常取得。文档区分接入/存储地域与推理部署范围，并说明2026-10-13前上线北京模型的中国内地范围与之后默认中国弹性区的差别。这个快照版本日期早于该切点，但版本日期不证明北京上架日期；实际账号选择与 policy 的处理/存储条款仍须核对，不能仅凭URL宣称地域许可已满足。 |
| [OpenAI 兼容 Chat API](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions/) | 正常调用是 workspace endpoint 的 chat/completions；文档说明 usage/cached_tokens 字段。本轮只读其文档，没有发任何 API 请求或做模型列表探测。 |

北京固定快照公开单价（CNY / 每1,000,000 tokens）：

| 单次输入总量 | 普通输入 | 输出（当前非思考） | 隐式 cached 输入：依据20%规则计算 |
| --- | ---: | ---: | ---: |
| 0 < input ≤ 256,000 | ¥2 | ¥8 | ¥0.4 |
| 256,000 < input ≤ 1,000,000 | ¥6 | ¥24 | ¥1.2 |

对应 CNY micros / 百万tokens 分别为 `(2,000,000;8,000,000;400,000)` 与
`(6,000,000;24,000,000;1,200,000)`，是单位换算，不是已选 profile。
不采用别名优惠、免费额度、Batch折扣或现金余额推断；实际可用的优惠与模型访问权限 UNKNOWN。
公开表不证明本账号享有任何额度，也不证明既有 key 有权访问此快照。

## 三、保守 reservation 与实际计费必须分开

既有源码保持不变（qa-agent/worker.ts:89–91）：

```text
reservedMicros >= ceil((1,048,576 × max(inputRate, cachedRate or 0)
                       + maxOutputTokens × outputRate) / 1,000,000)
```

输入费率单位是 micros/百万tokens。源码的1,048,576是保守预留常量，不是原厂允许发送的
context大小；不能把它改成当前短 prompt、缓存命中估计或1,000,000以降低预留。
只做算术展示：若采用北京公开长档上界6/24元、output上限4096，公式为
6,389,760 CNY micros（¥6.389760）；若output1024则为6,316,032 micros。
这不是本轮配置、消费承诺、余额、实际供应商账单或启用许可。

当前 price schema **没有阶梯费率选择器**。flat 按配置单价算所有输入，cache_split 按
真实 cached 数拆分，两者均按同一组固定费率结算。长档上界用于全上下文保守预算可以是
Main审定的开发成本口径，但把它直接标为每笔供应商精确实际费用会高估短档；反过来选短档
覆盖所有输入则缺少跨档保证。Main需要明确批准的计费口径/支持范围，并与实际scope、
provider limit、priceVersion保持一致；本任务不新增阶梯实现，也不把公开价自动写入配置。

`createTextJobPrice` 对原始有效usage总数做整数计算，并在合计后一次向上取整。
cache_split 缺 cached 计数返回 null；不能填0假定没有命中。原 protocol 将 cost 标为unknown，
本地计算出的 actualMicros 是所配置费率下的账本值，**不是原厂回传的已付金额**。
unknown usage/price/ACK 继续保留原 pending/reconciliation，不零费用结算、不换 key盲重试。
没有实际调用，本轮没有证明 returned model、cached计数、账单、真实费用或余额。

## 四、可固定的开发值与仍须真实取得的最小事实

| 字段组 | Main可自行决定的部分 | 必须有的正常事实 / 最小合法取得途径 | 当前状态 |
| --- | --- | --- | --- |
| 运行参数 | profile内合法poll/lifetime/drain/concurrency/groupLimit、1–4096 output、≤60000ms timeout；选择不增加用户功能 | 与已有运行/费用lease的上限一致；groupLimit1从来不代表actor过滤 | 范围已知，实际选择由Main固定 |
| version名 | 合法且不可变的开发 priceVersion/configurationVersion命名及证据指针 | priceVersion必须与**真实已有** scope provider limit一致；更改注册或额度需原权限，不能只改字符串 | 实际对应记录 UNKNOWN |
| provider/workspace | 固定使用源码快照，不增加selector/新provider | 由既有 provider 账号/业务空间管理页的 API Host、北京模型可用性/服务开通记录取得非秘密事实；原安全凭据由原owner保管，不读取、复制或展示 | 实际endpoint/workspace/key权限 UNKNOWN |
| configurationId | 可管理内部受信配置的版本记录，不冒充阿里云分配字段 | 原operator/deployment配置审计记录中的UUID、version及其model/endpoint/region证据；当前源码只校验格式，无供应商UUID查询接口 | 实际受信记录 UNKNOWN |
| policy/notice/consent | 不凭空生成已接受notice或provider地域条款 | Main在原许可内采用已有policy登记/批准记录；有既定policy ID后，原owner正常认证的 `qa_read_policy_v1` 可读取notice/hash/consent，不枚举用户表；完整处理/存储地域与期限仍由原policy权威元数据核对 | 真实policy ID/hash/接受状态/有效期 UNKNOWN |
| owner/scope/currency | 选择已授权的唯一operator tuple，不从discovery结果反推授权 | 原批准actor与预算登记记录；Main在已有权限下核scope归属/币种、provider limit的固定model/priceVersion、未冻结/有效且足够的原额度；不新grant、不临时扩大限额 | 实际owner/scope/币种/额度 UNKNOWN |
| package binding | Main将核实的非秘密tuple组成既有 target/2，并经原validator产生runtime-binding/1 | owner/policy/scope/notice必须来自上行同一批准记录；原v3 discovery/v2 dispatch作运行时资格复核，不能替代审批来源 | 原机制已合，实际字段未绑定 |

最小operator输入闭包是：①现有provider账号的北京workspace/API Host及固定快照可用性，
②同币种且被Main接受的价格来源/计费口径及priceVersion对应记录，③原受信configurationId/version，
④已批准owner/policy/scope/notice tuple及policy/consent期限，⑤原预算各层限额足够且当前费用lease
覆盖一次保守预留。公开材料补足不了这些账号/授权事实；费用或额度缺项交Main→BestJ/CoolJ集中处理，
不逐项向JT索取，不请求聊天中提供key或账号秘密。本轮没有执行以上账号/DB接口。

## 五、交付边界

只交本文件，未修改已交Main的源码/SQL/CI/target配置；未重跑71/18/PG矩阵。
公开文档是2026-10-16观察值，具体price生效日、账号优惠、账户币种/余额/权限、实际字段绑定与
真人首答持久恢复验收均不能由它替代。Main仍为唯一最终配置/运行lease/数据权限负责人。
