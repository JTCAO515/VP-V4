# VPJ 分阶段交付与验收

生成自 `issue-plan.json`；复用既有 Issue，不建立第二套队列。阶段是用户可观察成果的归属，不是实时完成状态。

阶段演示不等于整票验收或关闭；父 Issue 只有完整验收通过才关闭。独立准备可以跨阶段推进，仍保留实际依赖、运行条件和未验项；前一阶段的全部票不是后一阶段准备工作的额外阻塞。

按 [开发流程](../../agents/development-workflow.md) 执行；每次验收记录版本、环境、实际用户结果及 PASS / FAIL / UNRUN，fixture 不替代运行或发布证据。

## S1

**同一 Trip 与真实环境**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/7)

验收成果：

- 获准 Staging 上普通账号完成原生登录、换机失效、Web 并存与 owner/other 隔离；同一 Trip 在 iOS/Web 创建、明确确认、编辑和持久重载。
- #202 交付有界招募入口；#246 验收其已有两个周 sprint 工作包并持续开展客户发现。两票从本阶段并行启动，不把持续经营视为工程阶段等待所有未来工作的条件。
- 保留已记录 iOS17/真机/VoiceOver 未验项及运行条件；不以本地通过替代远端验收。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#188](https://github.com/JTCAO515/VP-V4/issues/188) · VPJ-01 | 原生 iOS 五入口、中英文与可访问的首个 Trip 页面 |
| [#189](https://github.com/JTCAO515/VP-V4/issues/189) · VPJ-02 | 现有 Staging 的真实身份、迁移与 owner 隔离验证 |
| [#190](https://github.com/JTCAO515/VP-V4/issues/190) · VPJ-03 | 用户对话、材料、模型地区与人工访问的数据政策 |
| [#191](https://github.com/JTCAO515/VP-V4/issues/191) · VPJ-04 | 原生登录、手机登录顶替与 Web 会话并存 |
| [#192](https://github.com/JTCAO515/VP-V4/issues/192) · VPJ-05 | 同一 Trip 在 iOS 与精简 Web 创建、编辑和重载 |
| [#202](https://github.com/JTCAO515/VP-V4/issues/202) · VPJ-62 | 公开中英申请入口与隐私可控的招募漏斗 |
| [#246](https://github.com/JTCAO515/VP-V4/issues/246) · VPJ-46 | 两周客户发现试点与后续运营交接 |

持续配合：[#202](https://github.com/JTCAO515/VP-V4/issues/202)、[#246](https://github.com/JTCAO515/VP-V4/issues/246)；这是跨阶段工作，不改变任务身份或依赖。

## S2

**真实、有依据且可恢复的 Ask**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/8)

验收成果：

- 用户在原生与已有 Web Ask 的同一真实链上获得有依据的 answered/partial/clarification/blocked/technical_failure；正常可答时不能全拒答。
- 真实来源经权利登记、异人审核、发布及请求级资格校验；任务、attempt、成本与未知费用、断线恢复可追溯，真实境内外登录/Ask/Trip 探针有记录。
- #263/#287/#288 已关闭的离线准备按原范围复用；它们不是本阶段实时模型、人工质量或产品知识验收证据。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#193](https://github.com/JTCAO515/VP-V4/issues/193) · VPJ-06 | Qwen、GLM、DeepSeek 的真实调用与质量成本对照 |
| [#194](https://github.com/JTCAO515/VP-V4/issues/194) · VPJ-59 | 首个真实模型任务的预算预留与故障止损 |
| [#195](https://github.com/JTCAO515/VP-V4/issues/195) · VPJ-07 | 真实 Ask 得到可恢复的最终回答 |
| [#196](https://github.com/JTCAO515/VP-V4/issues/196) · VPJ-08 | 流式回答在断网、后台和跨端重连后接续 |
| [#204](https://github.com/JTCAO515/VP-V4/issues/204) · VPJ-14 | 受保护 Ops 登录与一条候选内容工作流 |
| [#205](https://github.com/JTCAO515/VP-V4/issues/205) · VPJ-15 | 首批旅程内容从来源登记到已审核可用 |
| [#206](https://github.com/JTCAO515/VP-V4/issues/206) · VPJ-16 | 有依据的回答、诚实部分答案与知识缺口 |
| [#358](https://github.com/JTCAO515/VP-V4/issues/358) · VPJ-74 | 运营可追溯查看来源版本、原文与知识本体关系 |
| [#359](https://github.com/JTCAO515/VP-V4/issues/359) · VPJ-75 | 新来源经LLM Wiki整理为可审查并可发布的知识变更 |
| [#231](https://github.com/JTCAO515/VP-V4/issues/231) · VPJ-63 | 登录、Ask 与 Trip 的境内外网络首轮探针 |
| [#360](https://github.com/JTCAO515/VP-V4/issues/360) · VPJ-76 | Ask检索已发布Wiki与原子声明并返回完整证据和具体缺口 |
| [#263](https://github.com/JTCAO515/VP-V4/issues/263) · VPJ-66 | Harness：两条离线旅行任务可运行、判分并定位失败 |
| [#264](https://github.com/JTCAO515/VP-V4/issues/264) · VPJ-67 | Harness：真实只读问答产生有依据的结果与回执 |
| [#287](https://github.com/JTCAO515/VP-V4/issues/287) · VPJ-72 | 中英回答离线内容判分与可导入反馈的盲评包 |
| [#288](https://github.com/JTCAO515/VP-V4/issues/288) · VPJ-73 | Docling合成旅行材料解析与校正候选试验 |

## S3

**共同计划与明确确认**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/9)

验收成果：

- 模糊想法形成方向及可核验计划；实际地点、路线及约束有一致来源口径，用户看见 diff 后确认，同一 Trip 在两端重载。
- 用户要求第二天少走路且保留已确认晚餐：可比测量严格改善，晚餐及未选范围不变，旧版本/拒绝/撤权不能误写。
- 偏好纠正/撤回、知识更新、进程崩溃/取消/断网恢复在同一实际持久任务链上通过，保留准确回执与费用未知态。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#197](https://github.com/JTCAO515/VP-V4/issues/197) · VPJ-09 | 从模糊想法得到可确认的多日行程 |
| [#198](https://github.com/JTCAO515/VP-V4/issues/198) · VPJ-10 | 选中一天或项目后与 VP 局部改稿 |
| [#199](https://github.com/JTCAO515/VP-V4/issues/199) · VPJ-11 | Trip 连续记忆与用户可纠正的偏好 |
| [#207](https://github.com/JTCAO515/VP-V4/issues/207) · VPJ-17 | 来源更新后安全重验相关知识与 Trip |
| [#208](https://github.com/JTCAO515/VP-V4/issues/208) · VPJ-18 | 高德主选与腾讯补充的实测、用途与成本边界 |
| [#209](https://github.com/JTCAO515/VP-V4/issues/209) · VPJ-19 | 地点消歧、地图展示与路线出口 |
| [#210](https://github.com/JTCAO515/VP-V4/issues/210) · VPJ-20 | Explore 浏览内容并保存、问 VP、加入 Trip |
| [#211](https://github.com/JTCAO515/VP-V4/issues/211) · VPJ-21 | 准备检查把关键缺口变成可做的下一步 |
| [#219](https://github.com/JTCAO515/VP-V4/issues/219) · VPJ-65 | 真实地点与依据支撑的完整计划核验 |
| [#265](https://github.com/JTCAO515/VP-V4/issues/265) · VPJ-68 | Harness：少走路且保留已确认晚餐的局部改稿闭环 |
| [#266](https://github.com/JTCAO515/VP-V4/issues/266) · VPJ-69 | Harness：故障取消与重连不伪造成功或重复提交 |

## S4

**旅途中的完整功能**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/10)

验收成果：

- 受支持旅程贯通截图/文件导入、首访回访、住宿比较与透明跳转、订单资料、Today 离线、现场表达/语音/讲解、变化恢复与提醒。
- 用户能按服务任务授权真人协助所需资料、取得结果，并完成归档与隐私预览分享；拒权、离线、撤回及取消状态均真实。
- 只交付既定地域、供应商与许可范围；不将外部库存、交易代办或人工 SLA 加入承诺。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#200](https://github.com/JTCAO515/VP-V4/issues/200) · VPJ-60 | 图片和语音 Provider 的中英质量与数据流验收 |
| [#201](https://github.com/JTCAO515/VP-V4/issues/201) · VPJ-12 | 单张旅行截图导入、校正与加入 Trip |
| [#203](https://github.com/JTCAO515/VP-V4/issues/203) · VPJ-13 | 首访与回访的三种入口获得首个成果 |
| [#212](https://github.com/JTCAO515/VP-V4/issues/212) · VPJ-22 | 酒店官方出口、参数落地与联盟归因验证 |
| [#213](https://github.com/JTCAO515/VP-V4/issues/213) · VPJ-23 | 住宿需求比较与透明联盟跳转 |
| [#214](https://github.com/JTCAO515/VP-V4/issues/214) · VPJ-24 | 第三方订单材料回到同一 Trip |
| [#215](https://github.com/JTCAO515/VP-V4/issues/215) · VPJ-25 | Today 与可离线读取的旅行资料 |
| [#216](https://github.com/JTCAO515/VP-V4/issues/216) · VPJ-26 | 中英现场表达与大字展示 |
| [#217](https://github.com/JTCAO515/VP-V4/issues/217) · VPJ-27 | 按需语音翻译与可中断播放 |
| [#218](https://github.com/JTCAO515/VP-V4/issues/218) · VPJ-28 | 地点讲解与语音追问接回当前 Trip |
| [#220](https://github.com/JTCAO515/VP-V4/issues/220) · VPJ-29 | 用户报告变化后的局部恢复 |
| [#221](https://github.com/JTCAO515/VP-V4/issues/221) · VPJ-30 | 有原因、可关闭的旅行提醒 |
| [#222](https://github.com/JTCAO515/VP-V4/issues/222) · VPJ-57 | 用户服务请求与按任务授予资料访问 |
| [#223](https://github.com/JTCAO515/VP-V4/issues/223) · VPJ-31 | 按服务任务授权的动态 Traveler Brief |
| [#224](https://github.com/JTCAO515/VP-V4/issues/224) · VPJ-32 | 真人协助从请求到接单和结果回传 |
| [#236](https://github.com/JTCAO515/VP-V4/issues/236) · VPJ-55 | 限定文件导入与系统分享、登录回跳衔接 |
| [#241](https://github.com/JTCAO515/VP-V4/issues/241) · VPJ-49 | 最简本地旅行分享卡与隐私预览 |
| [#240](https://github.com/JTCAO515/VP-V4/issues/240) · VPJ-61 | 旅行结束、归档与下一次回来 |

## S5

**完整 Beta、计费与数据退出**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/11)

验收成果：

- 在已确认商品/任务计量政策下验证 IAP 购买恢复、权益与完整任务成本；真实商品条款未决时该部分保持未验，不沿用旧 Ask 容量冒充新服务容量。
- 全部数据模块可导出/删除，恢复后不复活撤销与删除状态；UGC 审核/举报、Ops 停用恢复、网络及原生/Web 全链体验通过。
- 选定版本的完整 12 个 Harness required-mode 场景和有界配对校准通过，并以 TestFlight 真机贯通 Plan/Ready/Travel；不得拼接不同配置或把 sandbox 购买当收入。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#225](https://github.com/JTCAO515/VP-V4/issues/225) · VPJ-33 | Journey Pass 商品、权益和定价实验配置 |
| [#226](https://github.com/JTCAO515/VP-V4/issues/226) · VPJ-34 | 官方 IAP 购买、恢复与服务端权益 |
| [#227](https://github.com/JTCAO515/VP-V4/issues/227) · VPJ-35 | Free/Pass 额度与完整任务成本控制 |
| [#228](https://github.com/JTCAO515/VP-V4/issues/228) · VPJ-36 | 核心资料的导出删除框架与首批执行器 |
| [#229](https://github.com/JTCAO515/VP-V4/issues/229) · VPJ-37 | 运营看见质量、成本和故障并能停用能力 |
| [#230](https://github.com/JTCAO515/VP-V4/issues/230) · VPJ-38 | 数据库、对象与删除状态的恢复演练 |
| [#232](https://github.com/JTCAO515/VP-V4/issues/232) · VPJ-39 | 境内外媒体、酒店跳转、IAP 与通知网络验收 |
| [#235](https://github.com/JTCAO515/VP-V4/issues/235) · VPJ-48 | 用户旅行内容投稿与发布前审核 |
| [#238](https://github.com/JTCAO515/VP-V4/issues/238) · VPJ-64 | 社区举报、屏蔽、申诉与内容删除 |
| [#233](https://github.com/JTCAO515/VP-V4/issues/233) · VPJ-40 | 原生视觉动效、无障碍与性能整链复验 |
| [#234](https://github.com/JTCAO515/VP-V4/issues/234) · VPJ-41 | 精简 Web Planning Studio 的最终体验验收 |
| [#237](https://github.com/JTCAO515/VP-V4/issues/237) · VPJ-56 | 原生 CI、签名 Archive 与首个 TestFlight 安装包 |
| [#239](https://github.com/JTCAO515/VP-V4/issues/239) · VPJ-58 | 全数据模块导出删除与恢复后的最终隔离验收 |
| [#242](https://github.com/JTCAO515/VP-V4/issues/242) · VPJ-42 | TestFlight 实机贯通 Plan、Ready、Travel 三段 |
| [#267](https://github.com/JTCAO515/VP-V4/issues/267) · VPJ-70 | Harness：只读模型或提示词候选的配对评测与校准 |
| [#268](https://github.com/JTCAO515/VP-V4/issues/268) · VPJ-71 | Harness：核心任务发布判定与能力停用恢复验收 |

## S6

**正式客户交付与经营观察**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/12)

验收成果：

- 独立 Production 与 Staging 严格分离、可回滚，正式 App Store 审核及数字商品通过后客户收到可用产品。
- 实际 72 小时系统观察与 7 天机会相关用户跟踪、支持退款删除事故响应、真实激活/付费/人工成本分别有证据。
- 经营结果保留小样本与机会窗口，不以下载、fixture、sandbox 购买或计划完成替代客户效果。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#243](https://github.com/JTCAO515/VP-V4/issues/243) · VPJ-43 | 独立 Production 与可回滚的客户服务环境 |
| [#244](https://github.com/JTCAO515/VP-V4/issues/244) · VPJ-44 | 正式 App Store 1.0 提交与数字商品审核 |
| [#245](https://github.com/JTCAO515/VP-V4/issues/245) · VPJ-45 | 客户收到产品后的观察、支持与发布关账 |
| [#247](https://github.com/JTCAO515/VP-V4/issues/247) · VPJ-47 | 真实激活、付费与人工成本的经营观察 |

## expand

**证据触发的后续扩展**

[GitHub 里程碑](https://github.com/JTCAO515/VP-V4/milestone/13)

验收成果：

- 保留各票现有 activationEvidence、依赖和独立验收；召回失败、航班需求、Android/新语言、长期订阅或交易深度只在相应证据触发后启动。
- 此组不属于首发必做串行关卡，不因依赖完成自动启用。

| 现有 Issue | 用户结果 |
| --- | --- |
| [#248](https://github.com/JTCAO515/VP-V4/issues/248) · VPJ-50 | 有真实召回失败才启用混合 RAG 与重排 |
| [#249](https://github.com/JTCAO515/VP-V4/issues/249) · VPJ-51 | 航班来源与中国航线对照（证据触发） |
| [#250](https://github.com/JTCAO515/VP-V4/issues/250) · VPJ-52 | 授权航班状态与相关行程重验 |
| [#251](https://github.com/JTCAO515/VP-V4/issues/251) · VPJ-53 | Android 与新增语言的需求触发设计 |
| [#252](https://github.com/JTCAO515/VP-V4/issues/252) · VPJ-54 | 长期订阅或交易深度升级的证据决策 |

后续 expand 仍需各票 activationEvidence；依赖完成不自动激活，也不纳入当前首发验收。
