# VPJ-03：文本链路的决定与待决定记录

状态：`partially_confirmed`（2026-09-10）。JT已授权本轮三家合成旅行文本推理测试和逐家预算；下列已确认值不再视为缺失。此记录不是完整PolicyReceipt、生产隐私告知或DPA；实际调用仍须满足各provider条款、账号和运行门。责任任务 [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190) 保持开放。

目的：用最少的明确决定支持下一条真实链路。先决定合成文本对照，再决定获准用户的文本Ask；不要求现在填写无关营销、地图或酒店政策。每个接收方独立决定，fallback不继承主provider许可。

## A. 合成文本对照：VPJ-06 / #193

拟议数据范围：团队制作的中英合成旅行任务、合成工具输入与输出；不含真实对话、个人信息、真实Trip或用户材料。JT于2026-09-10明确允许三家进行多轮旅行文本测试，具体合成任务由agent选择。授权限于本轮合成测试，不扩展到真实用户数据或充值；JT随后选择A，接受这批完全虚构、无个人信息的文本按供应商适用条款留存或用于模型改进。测试结果只允许记录合同约定的脱敏元数据与评测结论，不因此获得发布原文或供应商返回内容的许可。

| 待决定字段 | Qwen | GLM | DeepSeek | 谁提供依据 |
| --- | --- | --- | --- | --- |
| 准确服务/接收实体、账号类型及目标endpoint | JT指定platform.qianwenai.com/home/api-keys；个人；API已开通；页面无地区/工作空间 | JT指定bigmodel.cn/apikey/platform；个人；API已开通；页面无地区/工作空间 | JT指定platform.deepseek.com/usage；API已开通；账号类型/工作空间未提供 | 用户报告，不冒充账号内实测；签约主体、实际API类型/endpoint另核 |
| 输入来源地区、处理/存储地区及适用地域依据 | decision_required | decision_required | decision_required | 实际服务与合同证据；不能从品牌名推断 |
| 条款/合同版本、证据链接及核验日期 | decision_required | decision_required | decision_required | agent核验公开条款，JT确认实际账号适用的合同 |
| 供应商输入/输出留存与精确期限、训练使用规则 | decision_required | decision_required | decision_required | 按实际服务/合同；unknown不能当零留存 |
| 允许字段、用途、动作、输出/派生物处理范围 | 已批准本轮合成旅行文本推理 | 已批准本轮合成旅行文本推理 | 已批准本轮合成旅行文本推理 | 不含真实对话、个人信息、真实Trip/材料；只保存脱敏元数据与评测结论；JT选A允许本轮虚构文本按适用条款留存/模型改进 |
| 单provider上限与整批费用上限、币种 | 本轮累计≤CNY30 | 本轮累计≤CNY30 | 本轮累计≤CNY30 | 三家合计≤CNY90；各自上限不能挪用；余额30为用户报告，充值未授权 |
| 起止时间、失效/撤回处理、责任人和决定ID | 同右 | 同右 | 同右 | JT；VPJ03-C0-JT-20260910；适用于本轮测试，用户撤回后停止新attempt；批准不证明运行取消/删除已实现 |

服务入口、两家账号类型和逐家预算已收到；不重复索取这些值。实际服务类型/endpoint、条款适用与处理地区仍须核验。2026-09-10后续检查确认Qwen、GLM和DeepSeek均有本地登录钥匙串条目。DeepSeek先前环境变量存在、后续进程中不再存在，用户已补录到钥匙串；变化原因未确认，不能据此判断密钥失效。这些元数据检查不证明账号权限或密钥有效。不得把任一家结果当三家对照通过。

DeepSeek公开[隐私政策](https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html)版本2026-02-10涵盖API及其他产品，同时列有模型训练用途和退出方式；本账号API是否受专项条款/退出设置覆盖尚未确认，不能从通用Chat设置推导API不训练。JT已明确选择A：仅本轮完全虚构、无个人信息的旅行测试文本可按供应商适用条款留存或用于模型改进。该决定不推导真实用户数据训练授权、不把未知TTL记为零；具体API类型/endpoint/条款和调用记录仍需核验。精确正文TTL仍unknown，不能写零留存。

开跑前仍需VPJ-06核实实际model ID、结构输出/tool call/usage/timeout/取消合同；费用不明标unknown，不能作为采纳依据。每次配置/证据/权限变化重新核受影响范围，保留事前预算。包A只消除获准合成对照的特定外部阻塞，不关闭VPJ-03或启用真实用户流量。

## B. 获准用户文本Ask：VPJ-07 / #195

| 待决定字段 | 当前状态 | 需要填写的具体值 |
| --- | --- | --- |
| 实际经营主体、政策责任人和联系途径 | JT已提供 | 广州创竞科技有限公司；负责人JT；jtcao@go2china.space。为用户报告，未核验工商/邮箱，不自动改变个人供应商账号的签约主体 |
| 处理数据与字段 | decision_required | 用户输入、模型回答、必要Trip上下文分别列字段/分类/目的/动作；禁止整包默认外发 |
| 地区与接收方 | decision_required | DB、函数、模型实际地区；主provider及最多一条fallback逐一接收实体/endpoint/合同依据 |
| 设备内、服务器及供应商留存 | 功能意向已提供，规则未决定 | JT希望重新打开历史记录；保存期限与删除未决定，不据此开启持久正文存储 |
| 用户告知/同意 | decision_required | 中英告知版本、授权范围、确认动作与可核验receipt；营销/研究许可不替代产品AI处理许可 |
| 撤回与删除 | decision_required | 撤回生效后禁止的新处理、删除各存储位置的期限与receipt、供应商限制、备份保留/恢复屏蔽及例外 |
| 人工/客服访问 | 功能意向已提供，权限未决定 | JT需要人工可查看聊天；具体人员/角色、case授权、字段、期限、审计与撤销尚未确定，不赋予Owner或Codex跨用户读取 |
| 预算与运行资格 | decision_required | 每任务/用户/批次上限及provider attempt计费口径；在VPJ-59对应持久机制中实现 |
| 生效、到期、复核责任 | decision_required | 决定版本/ID、责任人、起止时间与变更复核 |

测试对象为JT本人、指定人员及Codex，人员大致位于美国/俄罗斯（用户报告）；Codex是工具/执行者，并非个人测试账号或获授权的任意接收方。这不是处理地区或跨境依据。JT提供iPhone17/iOS26.6.1并愿配合真机测试；实际连接、签名和真机验收由#188另验。

现有技术事实：用户文本默认C2；PolicyReceipt当前仅覆盖reviewed C0 fixture；隐私接口只记录导出/删除请求，不执行删除；CostGuard仍是内存约束。包B不得在这些运行实现缺失时宣称授权已强制落实。实际owner隔离、鉴权、持久预算、worker、知识资格分别由原任务验证。

## 中英告知待填结构（不可发布）

以下方括号均是未决定字段，不得原样展示给真实用户，也不能只删除括号后发布。

中文：由[实际经营主体]为[明确目的]处理[最少字段]。经你同意后，[准确第三方AI接收实体]将在[处理地区]进行[允许动作]；输入/回答分别按[精确期限与依据]保留。你可通过[实际可用途径]撤回或申请删除；[备份/供应商例外及期限]。拒绝第三方AI处理时，[当时实际可用且已验证的手动功能]仍可使用。人工访问仅在[已批准条件]发生。

English: [Legal operator] processes [minimum fields] for [specific purpose]. With your permission, [named AI recipient] performs [allowed action] in [processing region]. Inputs and responses are retained under [exact periods and basis]. You can withdraw permission or request deletion through [working channel], subject to [specific backup/provider limits and periods]. If you decline third-party AI processing, [verified available manual functions] remain available. Human access occurs only under [approved conditions].

告知通过不等于后端执行通过；必须与真实撤回、删除、权限与拒绝路径一致。当前尚无真实手动Trip消费者验收，不承诺拒绝AI后已有完整手动功能。

## 材料的两条路径及拒绝处理

| 路径 | 本次文本准备边界 | 后续实际决定/证据 |
| --- | --- | --- |
| 设备端材料 | 不开启读取/上传/OCR/语音；合成文本包不包含用户照片或音频 | 设备内允许字段/处理动作/寿命、权限拒绝与删除；本地处理不自动许可服务端发送 |
| 服务端材料 | 不开启；C3默认拒绝，C4始终拒绝 | 上传用途、storage/processor地区与TTL、对象/供应商删除receipt、取消/失败/重试清理和备份策略 |
| 用户拒绝授权 | 不发送受限字段、不经fallback绕过拒绝 | 展示当时真实可用的非AI功能；不能以虚构AI回答掩盖拒绝 |

完整VPJ-03仍需负责人对这些路径与拒绝后可用功能作实际决定；本次不默认批准材料处理。不要收集密码、验证码、卡号或密钥来填写本表。

## 已有来源和下游门

- [数据分类与地域门](data-classes.md)：分类、字段/目的/动作、地区、期限、责任人及受控合成阶段。
- [消息与输出留存](../contracts/launch-05-message-output-retention.md)：C2、未授权不持久化、provider/region/terms/scope/budget。
- [PolicyReceipt](../contracts/policy-receipts.md)：当前fixture资格与撤回权威边界。
- [隐私生命周期](../contracts/privacy-lifecycle.md)：请求记录不等于删除执行。
- [领域接口](../program/2026-09-05/INTERFACES.md)：ModelProfile/RuntimeBudget职责；名称不等于接缝已实现。

实时链路核对仍必要：VPJ-59依赖02/06，07依赖04/05/06/59，16依赖07/15，67依赖16和已完成66。本表不删边、不关闭这些父票。回滚只移除此待填记录与入口链接，不改变实际许可或用户数据。
