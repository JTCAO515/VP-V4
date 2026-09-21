# 当前开发状态与文档核对（2026-09-22）

核对基线：GitHub `origin/main` 的 `ce46abd`，以及本次只读查询的 Issue 和开放 PR。本文是有日期的读回快照；后续执行仍刷新 GitHub。OPEN/CLOSED 仅为 Tracker 状态，不替代相应版本、环境和用户行为的验收。

## 开发顺序

沿[既定团队顺序](TEAM-PLAN-2026-09-17.md)接续已合并接口。本次选择 B 队 S3 的 [#363](https://github.com/JTCAO515/VP-V4/issues/363)：补齐双端搜索/提示/详情/地址解析/周边消费者、原生与Web高德展示及上下文失效保护；后续为 #364 → #197/#198 → #199/#219。#362 已关闭，不能重新从供应商基础探针开始。#363 的这些消费者与SDK接线已在本次分支实现；真实供应商、应用/域名绑定和地图实机验收仍未完成，不能以本地编译代替整票验收。代码与配置见[运行说明](../../runbooks/place-search-maps.md)。

A 队复用 #225 已有[开发权益表](../../commercial/journey-pass-development-catalog.md)，处理本票剩余项后接续 #226/#227，不重建已合并 catalog；#231 已关闭，后续网络联合验收归 #232/#268，不能把 #231 继续列为未完成阻塞。C 队 #204/#193 已关闭，按原顺序接续 #205/#206，再处理 #200/#201；#201 的原生截图审阅与 Proposal 已合并，须复用。#191 已关闭，#195/#196/#359/#360 的既有归属保持，不能据旧首批提示重新分配。

## 近期已合并与在途

- [#475](https://github.com/JTCAO515/VP-V4/pull/475)：VPJ-09 相对日方向、编辑、日期绑定与既有 Proposal/确认/重载。四城 2–7 日范围及本地证据见[验证](../../../artifacts/VPJ-09/verification.md)和[未验项](../../../artifacts/VPJ-09/unrun.md)；保存偏好、广义 Chat→Plan 和完整真实可行性仍未完成。
- [#472](https://github.com/JTCAO515/VP-V4/pull/472)、[#474](https://github.com/JTCAO515/VP-V4/pull/474)：原生单张截图审阅、过期回执拒绝、明确 Proposal 拒绝后解锁草稿。#201 仍 OPEN。
- [#452](https://github.com/JTCAO515/VP-V4/pull/452)、[#476](https://github.com/JTCAO515/VP-V4/pull/476)：会话顶替保护与故障注入函数默认 PUBLIC 执行权限修复已合并；不由合并推断所有环境已迁移。
- [#477](https://github.com/JTCAO515/VP-V4/pull/477)：artifacts 增长检查已合并。
- [#479](https://github.com/JTCAO515/VP-V4/pull/479) OPEN，head `9e00161888502ac28a115086a3a48bb435a9eb90`：PR 报告 Staging 61 条迁移、真实 Qwen Wiki/Ask、Web 回读及 AI-assist 超时修复。属于该 PR 的证据，尚未合并，也未经本次重新连接 Staging 复验。独立审核/发布、新内容双端回读、answered EvidencePack v2、真机、账单和最终恢复演练仍未完成。旧的“Staging50 缺全部 Wiki 迁移”不能继续作为当前事实。
- [#478](https://github.com/JTCAO515/VP-V4/pull/478) OPEN：保留 iOS 最大文字无障碍失败用于修复，不能把其他 CI 通过当作该项已通过。

## 全队列读回

此表只读取 GitHub，未更改 Issue 正文、标签、勾选或状态。计划源 `issue-plan.json` 的 `status:planned` 是计划语义，不能直接同步为验收完成。

| 任务 | 阶段 | GitHub 状态 | 最近更新（UTC） |
| --- | --- | --- | --- |
| [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188) 原生 iOS 五入口、中英文与可访问的首个 Trip 页面 | S1 | CLOSED | 2026-09-11T04:19:50Z |
| [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189) 现有 Staging 的真实身份、迁移与 owner 隔离验证 | S1 | CLOSED | 2026-09-17T05:49:17Z |
| [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190) 用户对话、材料、模型地区与人工访问的数据政策 | S1 | CLOSED | 2026-09-17T05:42:27Z |
| [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191) 原生登录、手机登录顶替与 Web 会话并存 | S1 | CLOSED | 2026-09-19T08:07:18Z |
| [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192) 同一 Trip 在 iOS 与精简 Web 创建、编辑和重载 | S1 | CLOSED | 2026-09-17T06:12:35Z |
| [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193) Qwen、GLM、DeepSeek 的真实调用与质量成本对照 | S2 | CLOSED | 2026-09-17T12:30:37Z |
| [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195) 真实 Ask 得到可恢复的最终回答 | S2 | OPEN | 2026-09-17T05:34:56Z |
| [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196) 流式回答在断网、后台和跨端重连后接续 | S2 | OPEN | 2026-09-17T05:35:03Z |
| [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197) 从模糊想法得到可确认的多日行程 | S3 | OPEN | 2026-09-18T04:06:42Z |
| [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198) 选中一天或项目后与 VP 局部改稿 | S3 | OPEN | 2026-09-17T06:56:57Z |
| [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199) Trip 连续记忆与用户可纠正的偏好 | S3 | OPEN | 2026-09-17T06:56:59Z |
| [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201) 单张旅行截图导入、校正与加入 Trip | S4 | OPEN | 2026-09-17T06:58:47Z |
| [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203) 首访与回访的三种入口获得首个成果 | S4 | OPEN | 2026-09-17T06:57:19Z |
| [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204) 受保护 Ops 登录与一条候选内容工作流 | S2 | CLOSED | 2026-09-17T11:39:13Z |
| [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205) 首批旅程内容从来源登记到已审核可用 | S2 | OPEN | 2026-09-17T06:58:28Z |
| [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206) 有依据的回答、诚实部分答案与知识缺口 | S2 | OPEN | 2026-09-17T06:58:31Z |
| [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207) 来源更新后安全重验相关知识与 Trip | S3 | OPEN | 2026-09-17T06:58:49Z |
| [VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208) 高德主选与腾讯补充的实测、用途与成本边界 | S3 | OPEN | 2026-09-17T06:56:51Z |
| [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209) 地点消歧、地图展示与路线出口 | S3 | OPEN | 2026-09-17T06:56:53Z |
| [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210) Explore 浏览内容并保存、问 VP、加入 Trip | S3 | OPEN | 2026-09-17T06:57:06Z |
| [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211) 准备检查把关键缺口变成可做的下一步 | S3 | OPEN | 2026-09-17T06:57:11Z |
| [VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212) 酒店官方出口、参数落地与联盟归因验证 | S4 | OPEN | 2026-09-17T06:57:21Z |
| [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213) 住宿需求比较与透明联盟跳转 | S4 | OPEN | 2026-09-17T06:57:23Z |
| [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214) 第三方订单材料回到同一 Trip | S4 | OPEN | 2026-09-17T06:57:25Z |
| [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215) Today 与可离线读取的旅行资料 | S4 | OPEN | 2026-09-17T06:57:29Z |
| [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216) 中英现场表达与大字展示 | S4 | OPEN | 2026-09-17T06:57:34Z |
| [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217) 按需语音翻译与可中断播放 | S4 | OPEN | 2026-09-17T06:57:39Z |
| [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218) 地点讲解与语音追问接回当前 Trip | S4 | OPEN | 2026-09-17T06:57:41Z |
| [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220) 用户报告变化后的局部恢复 | S4 | OPEN | 2026-09-17T06:57:43Z |
| [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221) 有原因、可关闭的旅行提醒 | S4 | OPEN | 2026-09-17T06:57:46Z |
| [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223) 按服务任务授权的动态 Traveler Brief | S4 | OPEN | 2026-09-17T06:56:01Z |
| [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224) 真人协助从请求到接单和结果回传 | S4 | OPEN | 2026-09-17T06:56:05Z |
| [VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225) Journey Pass 商品、权益和定价实验配置 | S5 | OPEN | 2026-09-17T06:55:49Z |
| [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226) 官方 IAP 购买、恢复与服务端权益 | S5 | OPEN | 2026-09-17T06:55:51Z |
| [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227) Free/Pass 额度与完整任务成本控制 | S5 | OPEN | 2026-09-17T06:55:53Z |
| [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228) 核心资料的导出删除框架与首批执行器 | S5 | OPEN | 2026-09-17T06:56:08Z |
| [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229) 运营看见质量、成本和故障并能停用能力 | S5 | OPEN | 2026-09-17T06:56:10Z |
| [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230) 数据库、对象与删除状态的恢复演练 | S5 | OPEN | 2026-09-17T06:56:13Z |
| [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232) 境内外媒体、酒店跳转、IAP 与通知网络验收 | S5 | OPEN | 2026-09-17T06:56:35Z |
| [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233) 原生视觉动效、无障碍与性能整链复验 | S5 | OPEN | 2026-09-17T06:57:50Z |
| [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234) 精简 Web Planning Studio 的最终体验验收 | S5 | OPEN | 2026-09-17T06:57:52Z |
| [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242) TestFlight 实机贯通 Plan、Ready、Travel 三段 | S5 | OPEN | 2026-09-17T06:56:38Z |
| [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243) 独立 Production 与可回滚的客户服务环境 | S6 | OPEN | 2026-09-17T06:56:40Z |
| [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244) 正式 App Store 1.0 提交与数字商品审核 | S6 | OPEN | 2026-09-17T06:56:42Z |
| [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245) 客户收到产品后的观察、支持与发布关账 | S6 | OPEN | 2026-09-17T06:56:44Z |
| [VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246) 两周客户发现试点与后续运营交接 | S1 | OPEN | 2026-09-17T06:56:33Z |
| [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247) 真实激活、付费与人工成本的经营观察 | S6 | OPEN | 2026-09-17T06:56:46Z |
| [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235) 用户旅行内容投稿与发布前审核 | S5 | OPEN | 2026-09-17T06:58:51Z |
| [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241) 最简本地旅行分享卡与隐私预览 | S4 | CLOSED | 2026-09-17T05:37:19Z |
| [VPJ-50 #248](https://github.com/JTCAO515/VP-V4/issues/248) 有真实召回失败才启用混合 RAG 与重排 | expand | OPEN | 2026-09-17T06:59:04Z |
| [VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249) 航班来源与中国航线对照（证据触发） | expand | OPEN | 2026-09-17T06:57:57Z |
| [VPJ-52 #250](https://github.com/JTCAO515/VP-V4/issues/250) 授权航班状态与相关行程重验 | expand | OPEN | 2026-09-17T06:57:59Z |
| [VPJ-53 #251](https://github.com/JTCAO515/VP-V4/issues/251) Android 与新增语言的需求触发设计 | expand | OPEN | 2026-09-17T06:58:01Z |
| [VPJ-54 #252](https://github.com/JTCAO515/VP-V4/issues/252) 长期订阅或交易深度升级的证据决策 | expand | OPEN | 2026-09-17T06:56:48Z |
| [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236) 限定文件导入与系统分享、登录回跳衔接 | S4 | OPEN | 2026-09-17T06:57:27Z |
| [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237) 原生 CI、签名 Archive 与首个 TestFlight 安装包 | S5 | OPEN | 2026-09-17T06:56:31Z |
| [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222) 用户服务请求与按任务授予资料访问 | S4 | OPEN | 2026-09-17T06:55:56Z |
| [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239) 全数据模块导出删除与恢复后的最终隔离验收 | S5 | OPEN | 2026-09-17T06:56:16Z |
| [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194) 首个真实模型任务的预算预留与故障止损 | S2 | CLOSED | 2026-09-17T05:10:32Z |
| [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200) 图片和语音 Provider 的中英质量与数据流验收 | S4 | OPEN | 2026-09-17T06:58:44Z |
| [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240) 旅行结束、归档与下一次回来 | S4 | OPEN | 2026-09-17T06:57:48Z |
| [VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202) 公开中英申请入口与隐私可控的招募漏斗 | S1 | CLOSED | 2026-09-17T05:50:09Z |
| [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231) 登录、Ask 与 Trip 的境内外网络首轮探针 | S2 | CLOSED | 2026-09-17T11:38:11Z |
| [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238) 社区举报、屏蔽、申诉与内容删除 | S5 | OPEN | 2026-09-17T06:58:53Z |
| [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219) 真实地点与依据支撑的完整计划核验 | S3 | OPEN | 2026-09-17T06:57:01Z |
| [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263) Harness：两条离线旅行任务可运行、判分并定位失败 | S2 | CLOSED | 2026-09-11T04:23:06Z |
| [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264) Harness：真实只读问答产生有依据的结果与回执 | S2 | OPEN | 2026-09-17T06:58:56Z |
| [VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265) Harness：少走路且保留已确认晚餐的局部改稿闭环 | S3 | OPEN | 2026-09-17T06:57:55Z |
| [VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266) Harness：故障取消与重连不伪造成功或重复提交 | S3 | OPEN | 2026-09-17T06:58:58Z |
| [VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267) Harness：只读模型或提示词候选的配对评测与校准 | S5 | OPEN | 2026-09-17T06:59:00Z |
| [VPJ-71 #268](https://github.com/JTCAO515/VP-V4/issues/268) Harness：核心任务发布判定与能力停用恢复验收 | S5 | OPEN | 2026-09-17T06:59:02Z |
| [VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287) 中英回答离线内容判分与可导入反馈的盲评包 | S2 | CLOSED | 2026-09-11T04:29:22Z |
| [VPJ-73 #288](https://github.com/JTCAO515/VP-V4/issues/288) Docling合成旅行材料解析与校正候选试验 | S2 | CLOSED | 2026-09-11T04:23:27Z |
| [VPJ-74 #358](https://github.com/JTCAO515/VP-V4/issues/358) 运营可追溯查看来源版本、原文与知识本体关系 | S2 | CLOSED | 2026-09-17T05:04:19Z |
| [VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359) 新来源经LLM Wiki整理为可审查并可发布的知识变更 | S2 | OPEN | 2026-09-19T10:35:20Z |
| [VPJ-76 #360](https://github.com/JTCAO515/VP-V4/issues/360) Ask检索已发布Wiki与原子声明并返回完整证据和具体缺口 | S2 | OPEN | 2026-09-19T10:35:23Z |

地图子票：[#362](https://github.com/JTCAO515/VP-V4/issues/362) CLOSED；[#363](https://github.com/JTCAO515/VP-V4/issues/363) OPEN；[#364](https://github.com/JTCAO515/VP-V4/issues/364) OPEN；[#365](https://github.com/JTCAO515/VP-V4/issues/365) OPEN；[#366](https://github.com/JTCAO515/VP-V4/issues/366) OPEN；[#367](https://github.com/JTCAO515/VP-V4/issues/367) OPEN。
