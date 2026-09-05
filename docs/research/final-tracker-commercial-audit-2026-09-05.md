# VP-V4 最终统筹：Tracker、商业交付与经营审计

日期：2026-09-05（Asia/Shanghai）
审计性质：只读 GitHub、源码与研究文件。本文件不表示已关闭 Issue、发布 App 或接受运行时能力。
源码检查点：`fb8d2ba227fded32a8df6e4e09f9586ad0150f21`。
范围：20 个开放 Issue 完整正文/评论及 native blocked-by；开放 PR #185/#186；2026-09-03/04 产品、经营研究。
最新授权：JT 已授权开放 Issue 全部按新规划取代关闭；本分工不写 tracker，旧责任先有新归属，关闭不等于 completed。

## 1. 结论

旧队列可以整体更换，但其中环境验证、权限、可靠 Turn、完整 Trip、隐私执行、恢复、发布和真实用户观察仍是新项目必须完成的责任。新的交付对象必须覆盖“找到用户→安装→真实 Trip 首成果→准备→在途→支持/纠错→付费/恢复→数据退出与版本维护”。

经营表达建议：**VP 陪你把同一趟中国自由行从想法规划到出发准备，再接到旅途中的讲解、沟通和临时调整。** 酒店采用需求整理、比较和第三方跳转；数字服务购买属于独立 VP 权益。

本轮最值得修正的事实与逻辑：

1. 旧 LAUNCH 将知识、Explore、导入和翻译全放发布后，与全程首发冲突。
2. IOS-01 只允许五语占位壳，排除联网、支付和商店，无法承载原生 iOS 首发。
3. 9/4经营文档把“明确放弃结果的理由”也算激活，会高估采用；有价值反馈与实际激活应分开。
4. PR #186 的“Trip 只有 title”已被当前 Day/Item 源码推翻，不能据此重做 schema。
5. 40h全职开发、30–40h营销、70%外向工作三种工时模型没有统一，最终版只能采用一个总预算。
6. Journey Pass 新候选比多重订阅更适合事件性旅行，但需补非自动续费商品恢复、滚动双限、开始时间及最重度成本证明，详见第6节。

## 2. 20 个开放 Issue 逐项责任迁移

读取时开放 Issue 20 个、开放 PR 2 个。除 #2/#41/#53/#149/#168 外，其余开放 Issue 无现存评论；没有评论不证明没有代码推进。

| 旧 Issue | native blocked-by | 当前正文/评论证据 | 处置与新责任 |
| --- | --- | --- | --- |
| [#2 AI-00 Program](https://github.com/JTCAO515/VP-V4/issues/2) | 无 | R0–R5重建；正文仍写main@2dec7b0、frontend-only | supersede-close；新唯一Program承接目标/依赖/证据/外部决策/成熟度/交接；旧记录归档 |
| [#41 Aviation Benchmark](https://github.com/JTCAO515/VP-V4/issues/41) | #9,#24,#46 | 评论确认仅无试用scorecard，四候选unavailable、未选供应商 | supersede-close；真实航班benchmark移二期，保留地区/字段/展示/保留/组合权利与清理；一期用官方查询/用户材料 |
| [#42 Flight Adapter](https://github.com/JTCAO515/VP-V4/issues/42) | #12,#37,#41 | schedule/status→recheck；不可自动改Trip | supersede-close；二期单供应商时效/变更Proposal/断源降级，不丢“不静默改行程” |
| [#53 Backup/Restore](https://github.com/JTCAO515/VP-V4/issues/53) | #10,#32 | 评论只确认无凭据校验器/runbook/测试；真实restore/PITR/Storage未验 | supersede-close；一期发布前真实恢复、RPO/RTO、Storage独立备份或TTL、恢复后权限/元数据/删除传播 |
| [#135 IOS-01](https://github.com/JTCAO515/VP-V4/issues/135) | 无 | 五语Today/Ask/Trip/Explore/Profile占位壳，不做网络/商店；源码点无ios目录 | supersede-close；原生SwiftUI真实纵切、中英、最终导航、无障碍/性能/设备、StoreKit、TestFlight/App Store |
| [#149 LAUNCH Program](https://github.com/JTCAO515/VP-V4/issues/149) | 无 | 邀请Auth→Chat→Proposal→Confirm→Today；19native子Issue；知识等全后置 | supersede-close；新Plan/Ready/Travel Program、双商店渠道/运营交付；保留Staging/Production Gate |
| [#152 Staging](https://github.com/JTCAO515/VP-V4/issues/152) | 无 | 现有无真实用户Project纳入Staging；迁移/合成账号/RLS/recovery | supersede-close；重新识别环境和无真实数据、合成隔离、重放/RLS/故障证据；operator责任必须有新编号 |
| [#153 完整Trip](https://github.com/JTCAO515/VP-V4/issues/153) | #152 | days/items/CAS/snapshot/confirm；当前已有相关源码，运行验收未证明 | supersede-close；复用资产，补相对日/顺序/地点/时区差异；TS/SQL一致、owner/CAS/重试/快照/reload |
| [#154 Auth](https://github.com/JTCAO515/VP-V4/issues/154) | #152 | route guard、returnTo、invite/provisioning、移除访问；无native交付 | supersede-close；iOS/Web同账户、邀请/恢复/退出、手机单活/Web多会话、深链恢复/隔离/账号删除 |
| [#156 真实Provider](https://github.com/JTCAO515/VP-V4/issues/156) | #150 | 单文本Provider/五语smoke，region/terms/budget未决 | supersede-close；Qwen/GLM/DeepSeek任务实测，一个主profile与已验降级，费用/取消/schema/地区/条款，中英验收 |
| [#157 Turn/Worker](https://github.com/JTCAO515/VP-V4/issues/157) | #155,#156 | accepted→terminal-once、lease/retry/quarantine/cancel | supersede-close；真实请求到保存结果、宕机/重复投递/取消竞态/重复计费防护，与iOS端到端验收 |
| [#158 SSE/Replay](https://github.com/JTCAO515/VP-V4/issues/158) | #157 | replay/heartbeat/polling/reducer | supersede-close；切后台/断网/重连后同任务终态，iOS/Web同协议，不能只交内存reducer |
| [#162 Staging Golden Path](https://github.com/JTCAO515/VP-V4/issues/162) | #154,#158,#161,#169 | 旧Web主路径三次全绿、RLS、无skip/fixture | supersede-close；三个Episode、材料/证据/未知、实机/跨端/弱网、真实Provider/DB链路 |
| [#163 观测/预算](https://github.com/JTCAO515/VP-V4/issues/163) | #157,#158 | 内容无关trace、成本/告警/kill switch | supersede-close；纵切真实成本/延迟/失败/恢复、权益成本分账、故障注入告警，停AI保留自有资料 |
| [#164 Privacy/Terms](https://github.com/JTCAO515/VP-V4/issues/164) | #155 | retention/backup、五语政策/claim matrix | supersede-close；中英政策/App Privacy，聊天/Trip/Memory/Brief分目的保留，训练用途单列，主体/地区/供应商 |
| [#165 Export/Delete](https://github.com/JTCAO515/VP-V4/issues/165) | #162,#164 | receipt→真实导出删除，Storage/cache/backup完整性 | supersede-close；App内发起/验证/状态，派生记忆/brief/媒体/离线/索引删除传播；订阅管理单独说明 |
| [#166 Release Gate](https://github.com/JTCAO515/VP-V4/issues/166) | #163,#164,#165,#170 | rights/SBOM/NOTICE/domain/env/flags/rollback | supersede-close；Web/API+iOS联合release、签名/元数据、真实域名、旧客户端兼容、事故沟通与回滚 |
| [#168 Knowledge两城市](https://github.com/JTCAO515/VP-V4/issues/168) | 无 | 正文#171后再做，native未有该边；candidate→review→publish/精确ID | supersede-close；一期按Journey最小知识/Explore，保留来源/许可/审查/时效/纠错/身份；城市数不是先验量门 |
| [#170 Production](https://github.com/JTCAO515/VP-V4/issues/170) | #162,#164 | 独立Prod、region/PITR/Auth/env、空库重放，不复制Staging人/资料 | supersede-close；独立Production/secret、受控迁移/RLS/备份账单、iOS/API环境绑定/兼容窗 |
| [#171 Canary/观察](https://github.com/JTCAO515/VP-V4/issues/171) | #166 | 真实用户72h/incident/SLO/cost/GoNoGo/handoff | supersede-close；技术72h与产品生命周期观察分开，支持/撤邀请/退款/沟通、发布后维护及下一cohort |

替代列是新 Issue scope 来源，不是假定的新GitHub编号。主线程分配真实编号后逐行填superseded_by，再关闭旧项。

### 2.1 具体治理偏差

- #168正文/评论要求#171后开始但native为空；新一期方向已经改变，不沿用这条过时范围边。
- #41正文#24/#46，native多#9；#152正文#149/#150，native为空。新图需要唯一可检查来源，Program不应被误当运行阻塞。
- #2仍status:ready+ready-for-human；#135仍in-progress，标签不证明有agent当前占用。
- main的AGENTS/tracker/triage保留“依赖门控”和末尾direct queue supersession，PR #185正在修订。最终版应区分实现前合同依赖、集成验收依赖、外部操作阻塞；可准备不等于可发布。
- 多个正文的artifact路径有 `^Grtifacts/LAUNCH-*` 乱码，新模板不应机械复制。

### 2.2 安全的整体取代顺序

1. 保存旧编号/body/state/labels/native dependencies/父子/PR关联快照。
2. 完成新Program、总体方案/ADR、execution contract和责任交叉表，创建新Issue并获得真实编号。
3. 校验新DAG无环、每个发布前责任有owner、每个旧未决项有successor；旧Issue关闭不能自动让新Issue全部ready。
4. 旧项评论说明“新规划取代，不代表运行验收完成”，附新编号；以superseded/not-planned含义关闭并清stale active labels。
5. 最后关闭#149/#2，核对20/20责任有归属；保留旧PR与历史代码。
6. 回滚为reopen和恢复元数据；不删除历史。PR不因Issue取代自动关闭。

## 3. 开放PR融合与冲突

### 3.1 PR #185

[PR #185](https://github.com/JTCAO515/VP-V4/pull/185) HEAD=`ad549af3d82aeb10e1f494ab47578f81af41fb52`。读取时CLEAN，Vercel、Preview Comments、deterministic-pr-gates均pass，无人工review。变化涉及治理、ADR编号、docs checker与两项测试。

保留ADR重号检测、ML-01正确编号、标签清理历史、dirty legacy/clean mainline区分、skip诚实说明、调度冲突修正。所有“#149唯一当前Program/#152唯一下一动作”应变为9/1历史快照，不能原样覆盖新handoff。checks不证明Staging、RLS或真实AI。保持开放，由主线程统一处理。

### 3.2 PR #186

[PR #186](https://github.com/JTCAO515/VP-V4/pull/186) HEAD=`2f3ba80fd12f7a8c35748de08cc6930cbdf93d71`。只新增189行产品蒸馏文档；读取时CLEAN、三项checks pass、无review。它保留了有价值的用户原话，应保留历史，不把解释性段落自动升为当前事实。

| #186记录 | 9/5解释与处理 |
| --- | --- |
| 40h/周、无deadline | 按项目全部工作总预算；不能同时拿40h算开发再加40h营销 |
| 现金暂无上限、增量只剩provider | 前者可记当时意图；后者错误，地图/媒体/托管/邮件/Apple/客服/内容维护仍可能增量 |
| 10用户第2周3返回+1主动抱怨 | 早期信号而非唯一生死门；按自然旅程节点回访，抱怨质量有用但不把抱怨数量设硬门 |
| #153四周未通砍schema | 先诊断环境/集成，当前已有Day/Item，不因未部署盲目重做schema |
| beta30天未达标停功能 | 保留停止无证据扩张；规定有效分母与自然节点，日历流逝不等于需求已检验 |
| Reddit/Discord主动联系 | 定向参与、透明研究、平台/社区许可和自愿沟通；批量未经请求私信不接受 |
| 陪伴私人管家全流程 | 与最新方向一致；专业温暖/同Trip，非伪真人 |
| 先只中文未决 | 用户后续明确中英，已解决，目标主界面英文 |
| 预订/支付未决 | 用户后续明确浅层联盟跳转、不接库存/支付；实时可售房型仍需真实API证据 |
| Diff/确认削弱陪伴 | 可用性假设，改善表达层；“周二改室内、晚餐保留，采用吗”比代码diff易懂，保留确认边界 |
| 一整套是愿景还是首发未决 | 用户后续明确首发；以Plan/Ready/Travel完整路径与不对称深度落地 |
| 营销被冲突阻塞 | 已解除，已有中英/酒店边界，可立即做透明访谈与pilot |
| 当前21migrations/Trip只有title | 陈旧：HEAD有24迁移，20260830100000定义trip_days/trip_items/full snapshots；是否部署仍未验 |
| 14–19工程周=3.5–4.5月 | 不继承；未包括当前native/全程/经营工作；需新scope和实际吞吐估算 |

建议为#186保留原问答并加“后续决策覆盖表”，新方案/ADR承担执行权威，不改写历史用户原话。关于Trip的核对来自 `supabase/migrations/20260830100000_launch_03_trip_content_snapshots.sql` 第8/25/53行起的Day/Item/snapshot定义；源码存在≠数据库已应用。

## 4. 一期、二期的完整交付

| 生命周期 | 一期结果 | 二期/触发条件 |
| --- | --- | --- |
| 发现/申请 | 中英落地页、能力范围、邮箱申请、联系同意/退出、来源计量 | 多语、大SEO、广告，先证明核心转化 |
| 安装/进入 | TestFlight+App Store准备，native iPhone、英文默认、登录/首Trip、权限可跳过 | Android/家庭共享/团队商业账户 |
| Plan | 想法或材料入口、不强制问卷、候选/局部改动/确认恢复/跨端同Trip | 复杂协作/大规模路线优化 |
| Ready | 最小reviewed知识、准备清单、酒店交通门票条件/出口、订单状态、未知下一步 | 实时房型价格/自动订单同步/更多城市 |
| Travel | Today、中英文字翻译、大字卡、有限语音/讲解、用户报告变化后恢复 | 自动位置触发、后台监听、实时航班异常/多地图协作 |
| 陪伴/记忆 | 回来继续、Trip事实、显式偏好、拒绝历史、可解释提示、用户设定提醒 | 自动跨Trip画像/更多Push/LiveActivity需证据 |
| 支持 | 用户case、授权brief、清楚队列/接单/未解决、有限人工容量 | 合作方分派/多地区服务/SLA需真实供给 |
| 浏览/贡献 | Explore可浏览且进入Trip；官方/员工标识；若开UGC则审核/举报/屏蔽/下架闭环 | 评论/关注/私信/复杂Creator Studio |
| 付费 | Free+单一事件性Journey Pass、IAP/恢复退款/账户关联/清楚额度 | 月年Plus、复杂TripPass叠加、人工作价和B2B需证据 |
| 隐私/退出 | 记忆查看纠正、导出删除、退出清缓存、brief/索引删除传播 | 新数据一并纳入，不等待二期 |
| 维护 | 原生build/实机QA、真实API/DB、备份恢复、支持渠道、版本兼容/故障告知/商店更新 | 规模化再自动化，不先造巨大中台 |

全程首发要求每阶段一条可靠任务路径；unavailable页面或独立demo不能当阶段完成。成熟交易、自动感知、全国覆盖属于深度扩展。

## 5. 经营与运营补全

### 5.1 三本账

- 用户数字权益账：商品、开始/到期、范围/用量、恢复/退款/奖励。
- VP成本账：模型/检索/地图/语音/存储/失败重试/人工。
- 旅行交易账：第三方订单/用户材料状态，外跳≠预订≠佣金已结算。

Free限额需要真实任务完整性；内部重试、状态读取、确认、隐私与手动编辑不收新的Ask，用户新研究/新方案才收。商品配置与消费账解耦，首发不构建任意促销组合引擎。

Apple数字功能一般IAP，App外实体服务按3.1.3(e)用IAP以外付款；酒店价款不能装作VP credit。[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

权益验收覆盖成功/pending/取消/验签失败/断网/重复通知/退款/退款逆转/到期/换VP账号/换机/恢复。后台不能只靠前端isPlus。currentEntitlements不含consumable；credits与奖励要自有幂等账。[currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)、[Server Notifications V2](https://developer.apple.com/documentation/AppStoreServerNotifications)、[notificationType](https://developer.apple.com/documentation/appstoreservernotifications/notificationtype)

TestFlight IAP是sandbox不收费，验证支付实现而非付费意愿；正式App Store商品的真实机会才进入转化分母。[Sandbox Overview](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/overview-of-testing-in-sandbox)、[Testing IAP](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)

计算用实际结算收入减变动成本和服务人工。如果结算已扣Apple费用/税额，不能再扣一次。现金毛利和含人工贡献同时展示。Small Business的15%只是获准加入后的情景，不是已开通事实。[Small Business Program](https://developer.apple.com/app-store/small-business-program/)

### 5.2 运营后台

一期工作队列建议 Cases / Knowledge Review / Traveler Brief / Release & Incident。身份/封禁/导出删除/审计置于设置。Owner拥有管理权限不自动等于无限用途、无限期看全量聊天。

一次完整支持：问题→共享范围→服务说明/容量→接受/分派→处理→等用户/外部→解决或诚实未解决→用户看到结果→关闭/数据期限。AI摘要要有来源/时间，可被员工纠错，不能当用户确认事实。没有人工接单不能承诺更新时间；AI草稿不能标真人答复。

按首成果、正常服务、研究访谈分别计分钟。初始最多5个受支持Active Trips作为测量配置，不是长期人数限制；容量按支持分钟/P90服务分钟估算并保留峰值缓冲。

### 5.3 一份总工时预算

9/4文档每周3–4对话与两周8–12冲突、社区5–8与8–12冲突。建议35h标准周/40h上限，两周测量后调整：

| 工作 | 小时/周 | 起点产出 |
| --- | ---: | --- |
| 访谈、共同规划、任务观察 | 10 | 4个合格对话，其中2个真实Trip交付/观察 |
| 研发方向、agent交接、验收 | 8 | 验收1个纵切或关闭一个阻塞根因 |
| 社区/招募 | 6 | 15–20个高质量机会、5–8条实用回答 |
| 内容/合作 | 4 | 1英文主题+3复用、2定向合作 |
| 知识审查 | 3 | 高频Gap与待审内容由合格reviewer处理 |
| 支持/运行 | 2 | 队列/容量/事故/退款删除检查 |
| 数据/复盘 | 2 | 漏斗、成本、反证、下周主实验 |
| 合计 | 35 |  |

多5h先给真实客户任务/故障。JT亲自编码也须来自总预算；员工工时另列，不能默认人人具备关键事实审查资格。

Reddit/Discord允许参与真实交流，但禁止未经请求的批量消息和不真实互动；具体社区规则优先。个别相关接触与批量骚扰不能混称一种行为。[Reddit Spam Policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)、[Discord Guidelines](https://discord.com/guidelines)

员工/联盟/合作的利益关系应清楚；beta参加同意不等于案例/testimonial发布许可。[FTC Q&A](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)

### 5.4 唯一激活/留存定义

| 事件 | 定义 | 证明 |
| --- | --- | --- |
| qualified_prospect | 实际来华自由行计划/窗口/问题，符合本期语言与能力 | 招募对象匹配 |
| first_result_seen | 看到与自己Trip相关结果 | 到达首成果，不自动有价值 |
| outcome_recorded | 采用/修改/拒绝并有行为或理由 | 学习；拒绝不算激活 |
| activated_trip | 采用并保存可继续使用的Trip结果，重开仍存在 | 首次持续价值 |
| independent_activation | 不需Founder代操作/解释核心流程 | 自助产品能力 |
| assisted_activation | Founder帮助下达成 | 服务可行性+人工成本 |
| eligible_return_window | 到达下一自然决策/准备/在途节点 | 有效回访分母 |
| organic / useful_triggered / founder_prompted_return | 自发/有效产品触发/人工催回 | 分清人工作用 |
| price_opportunity | 核心结果后看到可真实购买正式商品 | 支付分母 |
| net_payer | 真实购买去重并扣退款 | 支付信号 |

B0–B4旧阈值可作为预登记学习门，但定义须统一。技术72h观察、产品30天复盘、生命周期回访互不替代。未到有效分母记not_observed/not_testable。

连续两有效cohort付费弱，先停当前商品；Plan强但Travel未到节点，保留规划；跨用户泄漏/虚假预订立即暂停能力。Program停止要需求、首值、成本或支付组合反证，而非单指标或单个用户意见。

## 6. Journey Pass 候选方案红队

本节针对主线程正在整合的设计：Free 6 Ask/4h，同时30 Ask/滚动7天；Journey Pass每次30天、不自动续费、300 Ask/30天、60 Ask/滚动24h，试验价$19.99，$14.99只作单变量对照；包含Guide新问答，缓存播放/手动编辑不收Ask，不含无上限人工。以上是待测试项目定价，不是Apple官方定价或市场已验证价格。

### 6.1 支持方向，但补四个商品定义

旅行是阶段性高需求，单次期限服务更容易解释；月年Plus等有重复旅行证据后再考虑。必须先说明：

1. 30天从支付成功还是用户启用开始。建议首版支付成功即开始，购买前明确显示当地时间的结束日；长期行前用Free，接近密集规划/出发窗口再购买。不要默默增加“可无限延期启用”的新债务。
2. Pass按账户还是绑定特定Trip。用户此前要求不限制同行人数，不能偷偷新增按人数收费；同账户手机单活也不等于IAP权益可以转移给另一个VP账号。
3. 有效期内重复购买是禁止、延长时间、追加Ask还是新包排队。建议首版App在仍有效时隐藏重复购买并解释到期；服务端仍需识别真实重复交易，不能收第二次钱却不交付，不能靠同一transaction重放补300。
4. 300 Ask用尽或60/24h达到时仍可查看/手动调整已存Trip、播放已缓存内容、导出删除、读既有联系信息；新付费不应是取回本人资料的条件。

### 6.2 IAP 类型与恢复

Apple定义 Non-Renewing Subscription 为有限时长、不会自动续费的服务，适合30天数字Pass。Non-Consumable是不失效/不随使用减少的一次购买，不适合该期限包。不能把“用户只付一次”误判成永久解锁类型。[Apple IAP types](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-types)、[Create non-renewing subscriptions](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-non-renewing-subscriptions/)

当前 `currentEntitlements` 对non-renewing可能返回已finished交易。服务端必须自有expiry与消耗账，以唯一transaction→VP账户授权构建Pass；看到交易不等于当前仍有效。恢复只恢复未过期的剩余权益，不重复给300；退款撤权/退款逆转要重算，不能清历史后重新发放。[Apple currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)

工程验收还需purchaseDate、expiresAt、环境sandbox/production、appAccountToken关联、transaction/originalTransaction去重、active/refunded/expired和剩余Ask。Pass内的Ask是期限服务的使用限制；不要未经商品评审再拆成可交易、会过期的充值货币。

### 6.3 滚动双限有真实 UX 和成本影响

Free达30/滚动7天后，4小时恢复不一定恢复Ask。只写“每4小时6问”会误导。UI应同时清楚显示两条门，并计算真正下一可用时刻：达到所有限制都允许时才能再问。滚动24h也不是每日零点重置。

在窗口边缘集中使用时，Free在连续30天理论可以达到约150 Ask：第0/7/14/21/28天每次30，分别按4h六问分批。所以不能用120/月作为严格成本上界，Pass300/月约是极重Free月额度的2倍，不是10倍。若Free大多数人已能完成整趟旅程，付费价值要由更连续的密集使用、资料处理、Guide等清楚结果验证；不能只靠用户误解限额。

Ask须是用户发起的任务单位，一次规划会内调多个模型/工具，但内部重试不另扣。明示用户输入/媒体长度、文件大小/页数和语音时长上限，否则300Ask仍可产生无上界成本。安全信息不付费，但不能把任意昂贵新任务只因含“紧急”两字就变无上限免费；免费路径应覆盖静态求助/现有资料/明确安全下一步。

重放/并发扣费必须原子reserve→执行→settle/release，窗口跨界、超时、取消晚于完成、返回到另一个设备均有测试。拒答是否消费要按是否提供了新的实质性任务结果定义；基础平台故障不扣。

### 6.4 单位经济压力测试

仅按价格与平台费做纯算术敏感性，未含税/退款/固定费用；15%需实际加入Small Business，30%是另一个预算情景，不是所有地区统一条款。

| 价/平台费情景 | 扣费后金额 | 300Ask满用的全部可花上限/Ask | 若目标70%贡献，模型+工具可花上限/Ask |
| --- | ---: | ---: | ---: |
| $19.99 / 15% | $16.9915 | $0.05664 | $0.01699 |
| $19.99 / 30% | $13.9930 | $0.04664 | $0.01399 |
| $14.99 / 15% | $12.7415 | $0.04247 | $0.01274 |
| $14.99 / 30% | $10.4930 | $0.03498 | $0.01049 |

最后列也尚未扣服务人工、免费用户补贴、存储和支持，因此只是宽松上界。不能把普通文本均价套到300次全量长语音/资料解析。至少按轻问答/全局规划/局部调整/OCR/Guide语音/失败重试分别做P50/P90/max-cap；每次新任务的模型与API预算需要落到执行策略。

免费补贴还要按“每位净付费用户对应多少活跃Free用户”分摊：
`Free subsidy per payer = active Free users / net payers × actual Free cost`。
联盟佣金先按0计入基础单位经济，待实际确认结算后另列，不用未来佣金弥补今天的亏损假设。

### 6.5 付费意愿样本不能只比较百分比

$19.99与$14.99保持同一能力、额度、语言、服务及旅行阶段，不同时改变营销话术。每组20个price_opportunity只够发现方向和拒绝原因，不证明某价格统计胜出。不同季节/在途比例/招募渠道会改变结果，顺序测试须记录这些差异。记录“不买是没有需求、没信任、窗口不合适、已够用还是价格高”，避免一切拒绝都降价。

正式付费只能来自App Store真实交易；TestFlight与问卷不计。先看到核心结果再报价，与冷流量立即paywall的数据不能合并。对正在旅行、很快用尽Free的人与几个月后出发的人分层，不能用后者的暂不买杀掉密集旅行付费假设。

## 7. 建议的新商业纵切 Issue

以下是供主线程统一编号的故事骨架；超过五个聚焦工程日应沿可验收状态转换拆分。不要把同一Story机械拆成“先做全后端、再做全前端”。

### C1 申请者从招募页进入真实iOS首次Trip

- 结果：中英定位→邮箱申请→联系同意→受控入组→安装登录→创建Trip，可取消后续联系。
- 合同：Prospect/consent、admission、opaque invitation、内容无关漏斗事件。
- 验收：重复申请幂等、过期邀请/错误邮箱有下一步、取消联系生效、设备深链回合法页面、CRM跨用户隔离。
- 观测：qualified→scheduled→installed→first_result，按来源和Founder分钟报告。
- 回滚：停新入组，已加入用户仍能访问/退出。

### C2 Free窗口到Journey Pass购买/恢复/退款

- 结果：获得完整阶段成果，双限/下次可用清楚，购买提升权益、取消不丢结果。
- 合同：商品+期限+quota预留/结算/归还、StoreKit交易到账户幂等映射。
- 验收：并发超额、滚动窗口、失败归还、奖励重放、pending、重复通知、换机/退款/到期和账户冲突；原资料读取不被锁死。
- 可拆：先Free账与UI，再同一Pass商品交易；合同统一不重复建权益系统。
- 回滚：停新售卖，保留已售权益/恢复/退款义务。

### C3 酒店需求到供应商页面再回收订单状态

- 结果：同Trip候选/取舍→验证可保留参数的外部页面→可导入确认单。
- 验收：参数丢失提示、联盟披露、佣金不改排名、点击不记Booked、导入未知字段不猜。
- 依赖：一家真实批准的联盟能力及移动落地试验；无API只做需求解释。
- 回滚：停partner出口，保留用户材料与其他官方途径。

### C4 未知问题成为可受控接回的人工case

- 结果：看到当前缺口→选择请求人工→共享范围/容量/状态→答案或诚实未解决。
- 合同：ServiceCase/AccessGrant、TravelerBrief来源、数据最小化/通知选择。
- 验收：未接单不承诺、到期grant阻断、跨Trip隔离、取消/删除传播、AI草稿不标真人。
- 观测：正常服务分钟、等待、复发、用户下一步，研究访谈单列。
- 回滚：停新case并交接已接受任务，不能静默丢单。

### C5 纠正/删除记忆后对话与运营brief同步改变

- 结果：用户知道用了哪条记忆，改后不再受旧值影响，后台brief同步。
- 验收：scope/来源/删除epoch、cache与worker不复活数据、退出换账号清副本。
- 全账号删除需App内发起/状态/完成；Apple只停用不够，手工删除可接受但须告知时间与结果。[Account Deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- 回滚：停新推断/记忆读取，用户行权仍可用。

### C6 同一构建从内部设备到TestFlight到App Store

- 结果：真实iPhone安装、登录、三Episode，商店描述与产品一致，有支持入口。
- 验收：签名/build关联、SDK/隐私、审核材料/账号、正式与sandbox分离、弱网/后台/权限拒绝/旧API兼容。
- 发布证据：Staging全路径、Prod隔离/迁移/恢复、72h技术canary、商店实际审核结果；提交不等于上架。
- 回滚：服务端flag收窄；已分发iOS不能像Web alias瞬间收回，至少明确当前与上一受支持版本兼容。

### C7 重复Gap到reviewed知识，再验证同类任务改善

- 结果：有用反馈→现在可行下一步→可选跟进→同类问题减少重复失败。
- 合同：去标识Gap/来源review/version/失效/GoldenTask；原文不自动训练/公开。
- 验收：来源冲突/过期/撤销后不可检索，前后同任务质量和人工成本，不以条数结项。
- 回滚：撤知识投影版本，不删除已确认用户Trip；必要时通知事实变化。

## 8. 新Issue图不能丢失的责任

| 责任 | 实际产物 | 必须验证的事件 |
| --- | --- | --- |
| 身份/权限 | iOS/Web/Ops矩阵、手机会话替换、grant审计 | 撤权后旧手机/旧员工不能读/执行 |
| 数据生命周期 | 原文/摘要/记忆/媒体/索引/备份用途期限 | 删除后重试和restore不使旧数据重新服务 |
| 异步可靠 | durable任务、取消/重试/幂等/replay | 切后台/重启终态一致、不重复计费 |
| 供应商 | 真实地区/条款/费用/profile/字段许可 | failover不能发到未批准接收方 |
| 备份 | DB与对象独立策略、恢复权限校验 | 隔离真实restore、耗时/完整性 |
| 资产/SDK | 字体图像许可、依赖/Privacy Manifest | release与商店披露匹配bundle |
| 成本/滥用 | quota、奖励、媒体/地图预算 | 重放并发取消不能无限花费 |
| 支持/事故 | 联系入口、分派、退款/纠错/通信 | P1从发现到用户通信/复盘 |
| 发布兼容 | 客户端API版本、强更原则、server兼容 | 旧App在backend回滚后读Trip/退出 |
| 经营反馈 | 唯一事件/分母/人工影响/止损 | 周报能解释获客→首值→回访→购买断点 |

## 9. 外部操作登记补全

现有operator-actions只有5项且全部旧LAUNCH编号。新登记至少覆盖：

1. 现有Staging身份/地区/无真实数据/迁移重放。
2. 模型候选实际条款、region、预算、server credential，路由与接收方一起核准。
3. 地图使用权/端点/境外行前与境内在途/费用。
4. 酒店联盟主体、参数、地域、结算与真实移动落地。
5. 数据保留/训练用途、运营访问、删除/备份、面向市场政策。
6. Apple主体/签名/bundle/商店地区、协议/税务/银行、IAP/Server Notifications。
7. TestFlight外测、App Store提交/审核/上架、审核演示账号与支持材料。
8. 独立Prod、告警、对象/数据库恢复与支持渠道。
9. 发布/域名/cohort/付费开关、事故联系人、首观察窗。

操作说明应有前提、具体动作、预期结果、非敏感验证和回滚。有现成授权不重复抽象询问；真实缺少账号/合同/金额时明确登记。外部未完成可不阻止独立合同/合成数据准备，但限制真实运行/发布。

## 10. 证据与局限

实际读取：gh open issue list（20）；逐一issue body/comments；逐一native blocked_by；#149 sub_issues（19）；PR185/186正文/文件/comments/reviews/commits/checks；#186新增文档完整189行；HEAD、operator-actions、AGENTS、tracker/domain/triage、Day/Item迁移；9/3商业权益章节、9/4三份主文档。2026-09-05重新浏览Apple IAP/退款/恢复/TestFlight/AccountDeletion/SmallBusiness、Reddit/Discord官方规则、FTC披露说明。

未读取生产用户/实际财务/供应商账户；未验证Staging、Prod、商品实际配置、地图/酒店合同。经营阈值、35h配置与Pass价格是本轮方案，非已有市场成绩。批量tracker写入前需复查20项与新编号，防并发漂移。

本分工只新增此文件，未改tracker、PR、代码、数据库、供应商、营销账号。

## 11. 对54项新Issue草案的交叉复核

复核对象：`docs/program/2026-09-05/issue-plan.json`，读取时54项、parentNumber=187。此节是给主线程的修复建议；主线程修订后的版本优先，不表示本分工已改JSON。

1. **VPJ-06/07/35/37：预算控制应在真实Ask最早路径生效。** 35依赖IAP34、37依赖35，不能让07真实调用阶段没有成本/并发/停用护栏。在06/07验收最小内部预算与flag实际消费，35增加用户商品quota，37汇总运营仪表盘。
2. **VPJ-46：35h总盘需要预留工程评审/知识审批/外部设置。** 当前14客户+5招募+4内容+3社区+3合作+4支持+2复盘占满35h；若这是营销专属，就不能再用同35h估项目日历。建议采用第5.3节统一总预算。
3. **VPJ-41/46：早期招募入口不能等待地图/IAP。** 41依赖05/20/34导致邮箱申请/公开定位被成熟产品阻挡；46应明确复用已验现有入口，或独立交付最小intake，41只做最终公共体验验收。
4. **VPJ-13/41/46/47：经营事件在早期定义/采集。** 47位于42/44后，适合分析实际读数，B0/首成果分母与同意事件须在13/41/46先存在。
5. **VPJ-49–54：expand不能自动变ready。** 除技术依赖外要有明确deferred状态与activationEvidence；尤其50仅16/17完成，不能因依赖闭合就提前开展无必要混合RAG。
6. **VPJ-07：迁入旧157完整故障责任。** 增加lease expiry、worker crash、duplicate delivery、cancel race、quarantine与terminal-once的实际验收。
7. **VPJ-38：恢复同时验证策略和权限。** 每数据类选backup或明确no-backup TTL，避免音频因备份变永久；恢复RLS/grants/functions/queues与object metadata-file一致性。
8. **VPJ-33/34：期限和重复购买必须确定。** 30天起算、有效包再买、退款逆转、恢复剩余额度，不能只写“恢复有路径”。
9. **VPJ-35：显示双限并按最重度计算。** 两门一起算nextAvailableAt，Free连续30天约150Ask上界情景纳入成本，不能以120作严格最大。
10. **VPJ-45/47：发布技术关账与生命周期判断分离。** 没有旅行自然机会标not_observed，不能因为固定7天未回访就阻断交付或声称留存已证明。

旧18个非Program开放Issue的有效责任已能在新任务oldIssues和验收中定位；旧#2/#149由新parent接替，应在Program与交叉表列出，不需要为了数组形式强行挂到某个子任务。真实GitHub编号由创建结果提供，不推测连续编号。

