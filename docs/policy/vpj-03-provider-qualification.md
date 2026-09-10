# VPJ-03 文本接收方资格矩阵

版本 `VPJ03-PROVIDERS-20260911-v1`；核验日期2026-09-11；责任人JT。
状态：公开证据准备完成，真实C2资格未通过；Related to #190。
以 [JT决定](vpj-03-text-decisions.md)、[VPJ-07执行契约](../contracts/vpj-07.md)为边界。
下表的官方服务信息不能替代账号合同、运行配置或数据处理授权；每个接收方单独核验。

## 已有调用与证据等级

[2026-09-10 C0结果](../../artifacts/VPJ-06/live-c0-20260910/results.json)与
[验证说明](../../artifacts/VPJ-06/live-c0-20260910/verification.md)记录三家各9个协议样本通过、
总38次transport调用、30个完整usage记录。它们只证明那批合成调用，不证明C2、语义质量或供应商删除。
代码的 [PROTOCOL_MODELS](../../lib/server/model-gateway/adapters/provider-protocol.ts)固定Qwen快照、GLM及DeepSeek模型。
仓库内这批结果没有逐次endpoint/接收实体/账号条款版本的归档字段；以下endpoint先列官方核对目标，
不得凭成功调用或品牌名称填写“实际地区已验”。后续获准运行前应增加不含正文的endpoint/服务地区/配置版本receipt，补齐与账号的对应依据。不重跑付费请求来补政策证据，也不归档原始输出。

## 官方服务、地区、条款与未决项

| Provider / 已报告账号 | 服务与接收实体的公开依据 | 官方endpoint核对目标 | 地区证据及边界 | 训练、留存与删除证据 | C2结论 |
| --- | --- | --- | --- | --- | --- |
| Qwen：千问平台，个人账号；并不等于个人Token Plan | 千问API文档Q1关联DashScope；百炼协议Q2 §1.1签约方为**通义云启（杭州）信息技术有限公司**。账号接受的是否为此协议待核 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`；Q1给base URL，完整Chat路径须与运行器一致 | Q3将此DashScope域名映射至北京接入/存储；接入地域与推理部署范围是不同字段。实际运行endpoint和该账号部署范围未归档，不能推导全球/境内推理均已获准 | Q2生效2026-09-02；§5.2个人Token/Coding Plan允许输入输出服务改进，终止不追溯撤销已有授权。Q4区分按量API/团队版不训练；Q5说明调用数据仍会存储。具体输入/输出/备份TTL与删除回执能力unknown | `not_qualified`：先核实际产品SKU/合同适用，不能套用所有阿里服务或旧“阿里云计算有限公司”接收方 |
| GLM：bigmodel.cn，个人账号 | G1定义经营者、服务提供者、处理者均为**北京智谱华章科技股份有限公司**；G2为用户协议 | `https://open.bigmodel.cn/api/paas/v4/chat/completions`（G3）；Coding专用endpoint是另一服务，不替换使用 | G1 §五对中国境内运营产生的个人信息声明境内存储、公有云；没有具体城市/推理节点/境外来源路径证据 | G1生效2025-05-20；允许匿名化数据用于机器学习/模型训练，不能写绝不训练。最短必要期限，无统一正文TTL；删除后备份可暂存并限制处理。工单或service@zhipuai.cn为申请途径，非VisePanda删除成功回执 | `not_qualified`：真实API输入输出的训练限制、TTL、处理范围及账号适用条款待确认 |
| DeepSeek：platform.deepseek.com，账号类型unknown | D1开放平台协议：**杭州深度求索人工智能基础技术研究有限公司**；个人/企业均可，账号对应唯一主体 | `https://api.deepseek.com/chat/completions`（D3）；支持的`/v1`形式不等于已调用形式 | D2 §五声明境内运营产生的个人信息境内存储；不能据此填写具体推理城市或美国/俄罗斯输入跨境依据 | D1生效2026-04-29；D2生效2026-02-10，涵盖API且有专项政策优先规则。智能对话部分列训练和界面退出；是否覆盖本API账号unknown。正文TTL未给固定值；网络日志六个月不是正文TTL | `not_qualified`：实际账号合同/专项API训练与删除安排未确认；Chat开关不证明API已退出训练 |

### 一手来源索引

仅摘要与条款定位，不复制完整供应商协议。动态页面应在实际资格签字时重核版本。

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

## 最少账号补证：只对准备启用的一家提交

JT无需再次选择经营主体、长期正文留存、团队全部跨用户CRUD、模型字段限制或每日测试预算。
首条VPJ-07文本协议没有fallback；另外两家只留候选，避免要求三套合同同时完成。
账号证据可为脱敏控制台记录、已接受协议版本或供应商书面答复；只记录证据位置/日期/结论，禁止key、cookie、验证码。

| 最少字段组 | 仍缺的事实 | 谁完成 |
| --- | --- | --- |
| 账号与实际服务对应 | 所选provider、产品SKU（按量API/订阅具体版）、账号签约主体与VisePanda经营主体使用关系、接受的条款/专项DPA版本 | JT提供现有账号合同事实；agent将其与公开矩阵核对 |
| 正文处理安排 | 该API输入/输出是否参与训练及有效退出依据；正文/安全日志/备份各自期限或触发规则、删除/撤回途径及限制；推理与存储地区 | 公开材料未给精确值时由JT取得账号适用说明；未知保持unknown，不能默认为零或同意训练 |

以下是工程/责任人待交证据，并非新增产品选择：实际运行器endpoint及账号绑定；DB/函数/worker的输入来源、处理和存储地区；
备份寿命及恢复屏蔽；长期留存目的/适用依据的责任人核验；团队身份名单来源/撤权与审计；联系途径可用性；
告知版本/哈希/有效期/复核日期；获准环境下的端到端拒绝、撤回、隐藏验证。
产品决定不替代处理合法性和用户权利的核验；本矩阵不宣布长期留存合法性审查通过。

资格记录必须绑定所选单一provider、完整endpoint、接收实体、条款版本、source/processing/storage regions、
双语notice/hash及有效期/复核日期。`unknown`或占位符不得写入激活的policy。
条款/endpoint/接收方变更须新版本与新同意；旧C0包A不授权任何新增真实C2外发。
