# VPJ-03 文本Ask留存语义与双语告知审阅稿

版本 `VPJ03-NOTICE-REVIEW-20260912-v2`。agent依据实际配置填写后可用于开发policy；供应商未披露的信息如实说明，不等待第三方、法务或产品许可。模板不是已激活配置或生产发布证据。
承接 [JT决定](vpj-03-text-decisions.md)、[接收方矩阵](vpj-03-provider-qualification.md)及
[VPJ-07已合并本地契约](../contracts/vpj-07.md)。本文补齐已确认语义，不更改其执行权限。

## 数据、操作与留存矩阵

| 位置 / 数据 | 用途与动作 | 当前语义 / 生效边界 |
| --- | --- | --- |
| iOS未发送草稿与重试状态 | 当前账号会话内编辑/重试 | 内存；无新增本地正文文件/outbox，进程退出不保留；退出账号/身份变化清理或隔离，见VPJ-07 |
| VisePanda服务端用户输入C2 | 回答本人的文本Ask；persist + inference | 仅新policy及该owner同意后的新记录；长期、未设自动到期。只含当次文本，不含Trip/材料/长期偏好 |
| 校验后的最终回答C2 | persist + owner display | 长期保留；不是正确性证明。原始推理不进入结果/事件日志 |
| 删除聊天/Turn/账号 | 隐藏已留存正文，停止对应可见访问 | 已有本地实现设置永久hidden_at，正文不级联删除；恢复相同ID也不恢复可见。账号删除仍受现有账本约束，不能承诺任意时刻删除成功 |
| 撤回文本AI同意 | 停止后续授权、输出落库与读取 | 已提交的dispatch授权可能已有在途请求，不能召回；不承诺立即停止供应商计算。该版本撤回不可重新启用，后续需新policy/新同意；已存正文仍保留 |
| 实际彻底删除申请 | 另行核验与隐私生命周期处理 | 不把隐藏回执说成彻底删除回执；正文擦除/供应商删除/备份清理执行尚未交付，不能给虚构完成时限 |
| 供应商输入/输出、日志与备份 | 当前配置及用户同意覆盖的单一接收方推理 | TTL、训练、撤回限制依供应商实际合同，不能继承VisePanda长期留存方向；见接收方矩阵 |
| VisePanda备份/灾备 | 恢复服务与保留记录 | 实际周期/地区/访问证据待补；恢复必须保留撤回与hidden状态，不复活旧删除数据。本文不授予读取备份正文 |
| 团队/客服 | 已决定全体受控团队成员长期跨用户CRUD | 运行未开启；需身份来源、服务端能力、审计及退出撤权。普通客户仍owner隔离；成员不能伪造用户Proposal确认、账本或删除回执 |
| 设备/服务端材料 | 照片、音频、OCR、上传 | 本文本版本均不开启；设备同意不继承为上传同意，拒绝时不得fallback绕过 |

## 中文审阅稿

VisePanda由广州创竞科技有限公司运营，政策负责人JT，联系邮箱jtcao@go2china.space。
为了回答你主动提交的文本问题，我们在服务器保存这次输入，并将它发送给下列指定AI服务进行推理；
经格式校验的最终回答保存后供你查看。本次授权不包括行程上下文、长期偏好、照片、音频或其他材料，
也不授权模型训练、营销或更换AI接收方。不要输入密码、验证码、卡号、密钥或未经许可的他人信息。

**你的输入和最终回答会长期保留，没有自动删除日期。删除聊天或成功删除账号后，正文仍会保留，
但在本产品中永久隐藏；这些操作不是彻底删除正文。撤回AI同意也不会清除已经保存的正文。**
你可以在文本Ask中撤回该版本的同意。撤回会阻止后续处理授权和结果保存/读取，
但不能召回已经授权发出的请求，也不能保证供应商立即停止处理或删除其副本。
如需申请彻底删除或询问留存安排，可联系上述邮箱；申请不表示清理已完成。

团队访问的已决定范围为全体受控团队成员长期跨用户查看、修改及删除数据，以支持服务运营；
只有相应身份、权限、审计和退出撤权机制验证后才可启用，其他客户不能查看你的数据。
不同意本次AI处理时，我们不提交你的问题给AI。本地已验证的手动Trip查看/编辑/确认路径不依赖此同意；
该路径在所发布环境中的实际可用性须在发布前验证。

发布前必须在此处填入并审阅：指定接收实体、准确服务与endpoint、来源/处理/存储地区、供应商输入/输出的训练与留存安排、
备份寿命及限制、长期留存目的与适用依据、实际可用删除申请/撤回渠道、告知生效与复核日期。
这些不是可对用户展示的占位说明；字段缺失时本稿不进入同意界面。

## English review draft

VisePanda is operated by 广州创竞科技有限公司. JT is responsible for this policy and can be contacted at
jtcao@go2china.space. To answer the text question you submit, we store that input on our server and
send it to the AI service identified below for inference. We store the validated final response for you to view.
This permission excludes Trip context, saved preferences, photos, audio and other materials. It does not
permit model training, marketing or a different AI recipient. Do not include passwords, verification codes,
card numbers, secret keys or another person's information without permission.

**We retain your input and final response long term, with no automatic deletion date. Deleting a chat or
successfully deleting your account permanently hides the retained content in this product; it does not erase
the content. Withdrawing AI permission also does not erase content already stored.** You can withdraw
permission for this policy version in text Ask. Withdrawal blocks subsequent processing authorizations and
result storage/access. It cannot recall requests already authorized for dispatch or guarantee that the supplier
immediately stops processing or deletes its copies. Contact the email above to request erasure or ask about
retention. Submitting a request does not mean erasure has been completed.

The decided team-access scope permits all controlled team members to view, modify and delete data across
users on an ongoing basis for service operations. Access may be enabled only after identity, permission,
audit and offboarding controls are verified. Other customers cannot view your data. If you decline AI
processing, we do not submit your question to AI. Locally verified manual Trip viewing, editing and
confirmation do not depend on this permission; availability in the release environment must be verified.

Before development use, the agent fills in the actual provider/endpoint, observed environment configuration,
known handling limits, withdrawal controls and configuration dates. Supplier training, retention or internal
regions that are not disclosed are stated as unknown, without waiting for supplier, legal or product approval.
This is an editorial instruction; the resulting user notice must accurately describe the configured behavior.

## 同意与拒绝验收

开发启用时由agent依据上述实际配置及已说明的未知项生成中英告知、不可变policy及notice hash；明确未预选的同意动作绑定owner/session。
拒绝不创建正文或调用；变更provider不沿用旧同意；Free/Pass都不代替许可。
本地原生呈现/撤回已验证，但此审阅稿没有被发布或写入任何真实policy。

Q36的后续偏好版本必须分别列仅本次、当前Trip、账号跨Trip范围、明确来源与纠正版本，按任务选择最少投影；
撤回/暂停/删除后，队列、缓存和派生物重验来源版本/许可，迟到结果不能恢复旧偏好。
长期保留Ask原文不意味着长期偏好可继续被模型消费；本版本未接入偏好，也不把团队决定当作模型许可。
对应实现/验收仍由 [基础明确偏好契约](../contracts/basic-preferences-cross-trip.md) 的原任务承担。
