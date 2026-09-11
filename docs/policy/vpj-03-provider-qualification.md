# VPJ-03 文本接入配置与供应商信息

版本 `VPJ03-PROVIDERS-20260912-v2`；下表公开资料核验日期仍为2026-09-11；开发规则修订日期2026-09-12。
状态：供应商审批前置要求已取消；实际C2链路按当前实现记录，未运行不标通过；Related to #190。
以 [JT决定](vpj-03-text-decisions.md)、[VPJ-07执行契约](../contracts/vpj-07.md)为边界。
遵循[开发接入规则](../agents/development-integration-policy.md)：账号/API可用即可开发，公开文档、控制台与实际配置足以支持记录；不等工单、合同回执、精确TTL或法务/产品许可。用户同意与服务端范围检查继续执行。

## 已有调用与证据等级

[2026-09-10 C0结果](../../artifacts/VPJ-06/live-c0-20260910/results.json)与
[验证说明](../../artifacts/VPJ-06/live-c0-20260910/verification.md)记录三家各9个协议样本通过、
总38次transport调用、30个完整usage记录。它们只证明那批合成调用，不证明C2、语义质量或供应商删除。
代码的 [PROTOCOL_MODELS](../../lib/server/model-gateway/adapters/provider-protocol.ts)固定Qwen快照、GLM及DeepSeek模型。
仓库内这批结果没有逐次endpoint/接收实体/账号条款版本的归档字段；以下endpoint先列官方核对目标，
不得凭成功调用或品牌名称填写“实际地区已验”。后续运行时记录不含正文的endpoint/服务地区/配置版本receipt，补齐与账号的对应依据。不重跑付费请求来补政策证据，也不归档原始输出。

## 官方服务、地区、条款与未决项

| Provider / 已报告账号 | 服务与接收实体的公开依据 | 官方endpoint核对目标 | 地区证据及边界 | 训练、留存与删除证据 | C2结论 |
| --- | --- | --- | --- | --- | --- |
| Qwen：千问平台，个人账号；并不等于个人Token Plan | 千问API文档Q1关联DashScope；百炼协议Q2 §1.1签约方为**通义云启（杭州）信息技术有限公司**。账号接受的是否为此协议待核 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`；Q1给base URL，完整Chat路径须与运行器一致 | Q3将此DashScope域名映射至北京接入/存储；接入地域与推理部署范围是不同字段。实际运行endpoint和该账号部署范围未归档，不能推导全球/境内推理均已获准 | Q2生效2026-09-02；§5.2个人Token/Coding Plan允许输入输出服务改进，终止不追溯撤销已有授权。Q4区分按量API/团队版不训练；Q5说明调用数据仍会存储。具体输入/输出/备份TTL与删除回执能力unknown | `development_integration_allowed`：按实际可用账号/API接入；未知供应商信息不作审批阻塞，运行结果另验 |
| GLM：bigmodel.cn，个人账号 | G1定义经营者、服务提供者、处理者均为**北京智谱华章科技股份有限公司**；G2为用户协议 | `https://open.bigmodel.cn/api/paas/v4/chat/completions`（G3）；Coding专用endpoint是另一服务，不替换使用 | G1 §五对中国境内运营产生的个人信息声明境内存储、公有云；没有具体城市/推理节点/境外来源路径证据 | G1生效2025-05-20；允许匿名化数据用于机器学习/模型训练，不能写绝不训练。最短必要期限，无统一正文TTL；删除后备份可暂存并限制处理。工单或service@zhipuai.cn为申请途径，非VisePanda删除成功回执 | `development_integration_allowed`：按实际可用账号/API接入；未知供应商信息不作审批阻塞，运行结果另验 |
| DeepSeek：platform.deepseek.com，账号类型unknown | D1开放平台协议：**杭州深度求索人工智能基础技术研究有限公司**；个人/企业均可，账号对应唯一主体 | `https://api.deepseek.com/chat/completions`（D3）；支持的`/v1`形式不等于已调用形式 | D2 §五声明境内运营产生的个人信息境内存储；不能据此填写具体推理城市或美国/俄罗斯输入跨境依据 | D1生效2026-04-29；D2生效2026-02-10，涵盖API且有专项政策优先规则。智能对话部分列训练和界面退出；是否覆盖本API账号unknown。正文TTL未给固定值；网络日志六个月不是正文TTL | `development_integration_allowed`：按实际可用账号/API接入；未知供应商信息不作审批阻塞，运行结果另验 |

### 一手来源索引

仅摘要与条款定位，不复制完整供应商协议。使用动态页面时记录获取日期，不要求资格签字。

- Q1 [千问平台API Key / Base URL](https://platform.qianwenai.com/docs/api-reference/preparation/api-key)，无公开版本日期。
- Q2 [阿里云百炼服务协议](https://terms.alicdn.com/legal-agreement/terms/common_platform_service/20230728213935489/20230728213935489.html)，2026-09-02，§1.1、§5.2、§6；网页检索偶发超时，公开HTML直接读取成功。
- Q3 [百炼地域与部署范围](https://help.aliyun.com/zh/model-studio/regions)，动态文档。
- Q4 [百炼产品说明：数据安全FAQ](https://help.aliyun.com/zh/model-studio/what-is-model-studio)，动态文档。
- Q5 [百炼合规与隐私说明](https://help.aliyun.com/zh/model-studio/privacy-notice)，动态文档。
- G1 [智谱隐私政策](https://docs.bigmodel.cn/cn/terms/privacy-policy)，2025-05-20，定义、匿名化使用、§五至六。
- G2 [智谱用户协议](https://docs.bigmodel.cn/cn/terms/user-agreement)，实际账号接受版本仍待归档。
- G3 [智谱HTTP API](https://docs.bigmodel.cn/cn/guide/develop/http/introduction)，普通API与Coding服务区分。
- D1 [DeepSeek开放平台协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)，更新2026-04-22、生效2026-04-29。
- D2 [DeepSeek隐私政策](https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html)，2026-02-10，适用范围、§一.2/一.3、§五、§六。
- D3 [DeepSeek首次API调用](https://api-docs.deepseek.com/)，官方base URL与Chat路径。

## 开发配置记录：agent直接完成

只配置当前需要的一家；首条VPJ-07文本协议无fallback，其他候选不需同时补齐材料。

| 字段 | 开发处理 |
| --- | --- |
| provider、实际endpoint、model ID和账号作用域 | 从现有配置/控制台及实际请求记录，秘密留在安全存储；不要求签约主体证明或账号合同回执 |
| 公开条款、来源与日期 | 记录可获得的公开版本；账号专项版本未知可写unknown，不等待供应商确认 |
| 训练、TTL、删除及供应商内部地区 | 依据公开说明；未披露写unknown/not disclosed，告知中不承诺零留存或未验证的删除 |
| VP实际部署与数据处理 | 记录可观察到的DB/函数/worker/provider配置，不把接入域名推断成未观察到的供应商内部地域 |
| 用户告知、同意、撤回与访问 | agent按实际开发配置生成版本与hash；真实测试保留owner同意、隔离、撤回及结果验证，无额外产品审批 |

agent可在已有授权的开发/Staging环境中安装版本化开发配置，不等待第三方回复或法务许可。
旧schema如不能表达供应商未知字段，在对应实现任务中明确扩展；不得编造字段值，也不得跳过身份/同意检查。
本次文档清理不代表已经激活配置、调用provider或完成#190/#195的运行验收。
