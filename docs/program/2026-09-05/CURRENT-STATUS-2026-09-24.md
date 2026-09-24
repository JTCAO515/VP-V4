# 当前开发状态与交接核对（2026-09-24）

GitHub 核对基线：`main` 的 `7e512727`（PR #511 合并）；Issue、PR 和 GitHub Deployment 元数据于 2026-09-24T15:36Z 由 `node scripts/program-status.mjs` 只读查询。生产与数据库事实沿用协调者先前核实、JT 执行的记录，本次未重新读取 Vercel 或数据库。[2026-09-23 版本](CURRENT-STATUS-2026-09-23.md)保留为历史。OPEN/CLOSED 仅为 Tracker 状态，不替代验收；本次未更改任何 Issue。

## 自 2026-09-23 最终同步以来

- [#525](https://github.com/JTCAO515/VP-V4/pull/525) 最终交接同步已合并；Program Status workflow 分页修复后，在 `bb43c5d`、`8002bb6` 两次 main push 上运行成功。
- [#526](https://github.com/JTCAO515/VP-V4/pull/526)（T9）已合并：iOS 隐私清单、位置用途说明与首个 TestFlight 上传所需的出口合规键；出口合规的实际取值仍待 JT 确认。
- #527、#529、#528、#531、#532、#533、#514、#534、#478、#511 已合并；当前开放 PR 仅 [#530](https://github.com/JTCAO515/VP-V4/pull/530)。76 张 VPJ 任务仍为 61 OPEN / 15 CLOSED，Program #187 OPEN。
- #531–#533 交付 Ask 缺口下一步、Ask 到 Trip 规划与后台 SSE 重连的代码/测试增量；#206/#195 的真实 Provider、托管 worker 与完整目标环境验收仍未完成。Preview 若返回 `403 x-vercel-mitigated: deny`，是 Vercel Firewall 阻断，不能当作应用失败。
- #534 记录 Xcode Cloud iOS Build 在后续提交成功及同提交的 GitHub 未签名 Archive 成功；签名 Archive、上传和 TestFlight 安装仍 UNRUN。#478 的 iOS 17.5 定向 8/8 通过，真机 VoiceOver UNRUN。#511 新迁移 `20260922033000` 仅在仓库合并，未观察到共享远端应用。

## 生产安全热修已上线（2026-09-24）

- JT 在 Vercel 控制台把分支 `hotfix/next-16-3-6-20260923`（提交 `30e98013` = `a8fa82ad` + cherry-pick `303088d3`）的 Preview 提升为 Production。新生产部署 `dpl_9t4iY7YF48r9Suru34hZFdxH8sdw`；`go2china.space`、`www.go2china.space`、`vp-v4.vercel.app` 均指向它；线上 JS 为 Next 16.3.6。**生产 Next Critical 漏洞已消除。**
- 协调者验证：`/`、`/research`、`/auth/sign-in`、`/places` 200；`/api/trips`、`/api/places/lookup` 401；`/api/intake` GET 405；`/api/ops/community`、`/api/translate/policy` 404（未带入新功能）；`next/image` 200；HSTS 保留。
- 回滚点：`dpl_2WV2dky65LhMguX8QnFUhz6xPRKm`（`a8fa82ad`，Next 16.2.6）。
- CLI `vercel deploy --prod` 曾报 Not authorized（疑与本地 committer 邮箱有关，**未确证**），因此改用控制台 Promote。
- 生产只包含 `a8fa82ad` 加安全补丁；main 之后合并的 #520（安全头、地点配额）、#522（worker）等尚未上线生产。

## 共享数据库迁移已应用（2026-09-24）

`dzqdzetcctkhbrhlxxgn` 是生产站与 Staging 共用的数据库。

- JT 先经 IPv4 Session pooler 备份（schema 374K + data 2.2M，本机文件，不入库）。
- 随后 `supabase db push --include-all` 成功应用 14 个迁移：`20260914100000`、`20260917062305`、`20260917064821`、`20260917131633`、`20260917140000`、`20260918032847`、`20260921205157`、`20260922002626`、`20260922004906`、`20260922005110`、`20260922014000`、`20260923090000`、`20260923120000`、`20260923140000`。
- 其中 `20260914100000` place_identity 与 0917 的两个 mobile-guard 迁移此前从未登记：place_identity 与 `start_chat_turn` 守卫此前确未生效，ACL 已等效存在；现已补齐。在这 14 个迁移时点，`migration list` 本地与远端完全一致；随后 #511 合并的新迁移 `20260922033000` 不在这次应用记录内。
- research intake 开关默认 `enabled=false`（未开启收件）；hosted worker 开关默认关闭。
- 迁移后生产站点验证正常；native/ops 路由仍 503，因为生产未启用对应开关，属预期。
- 连接注意：直连 `db.<ref>.supabase.co` 经本机代理 fake-IP 失败，须用 `aws-0-ap-southeast-1` pooler；已写入 [Staging/Vercel 维护手册](../../runbooks/staging-vercel-maintenance.md#共享数据库迁移注意事项2026-09-24)。

## 仍待 JT

1. TestFlight 签名材料与 `testflight` Environment secrets（#237/#242）；签名 Archive、上传与真机安装均 UNRUN。
2. worker 托管账号与密钥（#195，激活 #522 worker）；当前仍无托管部署/激活回执。
3. #246 客户发现 D0 核对。
4. research intake 是否开启收件的决定。
5. 出口合规确认（#526 已加入的键的取值）。

**最大结构风险**：独立 Production 数据库（[#243](https://github.com/JTCAO515/VP-V4/issues/243)）尚未建立。在此之前，对共享库的任何迁移、测试写入或开关变更都同时作用于生产站；#511 新迁移需要单独核远端状态，不能由仓库合并推断已应用。

## 全队列读回（2026-09-24T15:36Z 生成）

以下为 GitHub 只读状态；合并和 CI 状态不证明生产、Staging、Provider 或物理设备验收。

## 阶段汇总

| 阶段 | 任务 | OPEN | CLOSED | OPEN 任务 |
| --- | ---: | ---: | ---: | --- |
| S1 | 7 | 1 | 6 | [#246](https://github.com/JTCAO515/VP-V4/issues/246) |
| S2 | 15 | 7 | 8 | [#195](https://github.com/JTCAO515/VP-V4/issues/195) [#196](https://github.com/JTCAO515/VP-V4/issues/196) [#205](https://github.com/JTCAO515/VP-V4/issues/205) [#206](https://github.com/JTCAO515/VP-V4/issues/206) [#264](https://github.com/JTCAO515/VP-V4/issues/264) [#359](https://github.com/JTCAO515/VP-V4/issues/359) [#360](https://github.com/JTCAO515/VP-V4/issues/360) |
| S3 | 11 | 11 | 0 | [#197](https://github.com/JTCAO515/VP-V4/issues/197) [#198](https://github.com/JTCAO515/VP-V4/issues/198) [#199](https://github.com/JTCAO515/VP-V4/issues/199) [#207](https://github.com/JTCAO515/VP-V4/issues/207) [#208](https://github.com/JTCAO515/VP-V4/issues/208) [#209](https://github.com/JTCAO515/VP-V4/issues/209) [#210](https://github.com/JTCAO515/VP-V4/issues/210) [#211](https://github.com/JTCAO515/VP-V4/issues/211) [#219](https://github.com/JTCAO515/VP-V4/issues/219) [#265](https://github.com/JTCAO515/VP-V4/issues/265) [#266](https://github.com/JTCAO515/VP-V4/issues/266) |
| S4 | 18 | 17 | 1 | [#201](https://github.com/JTCAO515/VP-V4/issues/201) [#203](https://github.com/JTCAO515/VP-V4/issues/203) [#212](https://github.com/JTCAO515/VP-V4/issues/212) [#213](https://github.com/JTCAO515/VP-V4/issues/213) [#214](https://github.com/JTCAO515/VP-V4/issues/214) [#215](https://github.com/JTCAO515/VP-V4/issues/215) [#216](https://github.com/JTCAO515/VP-V4/issues/216) [#217](https://github.com/JTCAO515/VP-V4/issues/217) [#218](https://github.com/JTCAO515/VP-V4/issues/218) [#220](https://github.com/JTCAO515/VP-V4/issues/220) [#221](https://github.com/JTCAO515/VP-V4/issues/221) [#223](https://github.com/JTCAO515/VP-V4/issues/223) [#224](https://github.com/JTCAO515/VP-V4/issues/224) [#236](https://github.com/JTCAO515/VP-V4/issues/236) [#222](https://github.com/JTCAO515/VP-V4/issues/222) [#200](https://github.com/JTCAO515/VP-V4/issues/200) [#240](https://github.com/JTCAO515/VP-V4/issues/240) |
| S5 | 16 | 16 | 0 | [#225](https://github.com/JTCAO515/VP-V4/issues/225) [#226](https://github.com/JTCAO515/VP-V4/issues/226) [#227](https://github.com/JTCAO515/VP-V4/issues/227) [#228](https://github.com/JTCAO515/VP-V4/issues/228) [#229](https://github.com/JTCAO515/VP-V4/issues/229) [#230](https://github.com/JTCAO515/VP-V4/issues/230) [#232](https://github.com/JTCAO515/VP-V4/issues/232) [#233](https://github.com/JTCAO515/VP-V4/issues/233) [#234](https://github.com/JTCAO515/VP-V4/issues/234) [#242](https://github.com/JTCAO515/VP-V4/issues/242) [#235](https://github.com/JTCAO515/VP-V4/issues/235) [#237](https://github.com/JTCAO515/VP-V4/issues/237) [#239](https://github.com/JTCAO515/VP-V4/issues/239) [#238](https://github.com/JTCAO515/VP-V4/issues/238) [#267](https://github.com/JTCAO515/VP-V4/issues/267) [#268](https://github.com/JTCAO515/VP-V4/issues/268) |
| S6 | 4 | 4 | 0 | [#243](https://github.com/JTCAO515/VP-V4/issues/243) [#244](https://github.com/JTCAO515/VP-V4/issues/244) [#245](https://github.com/JTCAO515/VP-V4/issues/245) [#247](https://github.com/JTCAO515/VP-V4/issues/247) |
| expand | 5 | 5 | 0 | [#248](https://github.com/JTCAO515/VP-V4/issues/248) [#249](https://github.com/JTCAO515/VP-V4/issues/249) [#250](https://github.com/JTCAO515/VP-V4/issues/250) [#251](https://github.com/JTCAO515/VP-V4/issues/251) [#252](https://github.com/JTCAO515/VP-V4/issues/252) |

Program [#187](https://github.com/JTCAO515/VP-V4/issues/187)：OPEN。 附加跟踪子票（地图/S4–S5 切片）：[#362](https://github.com/JTCAO515/VP-V4/issues/362) CLOSED；[#363](https://github.com/JTCAO515/VP-V4/issues/363) OPEN；[#364](https://github.com/JTCAO515/VP-V4/issues/364) OPEN；[#365](https://github.com/JTCAO515/VP-V4/issues/365) OPEN；[#366](https://github.com/JTCAO515/VP-V4/issues/366) OPEN；[#367](https://github.com/JTCAO515/VP-V4/issues/367) OPEN；[#503](https://github.com/JTCAO515/VP-V4/issues/503) OPEN；[#504](https://github.com/JTCAO515/VP-V4/issues/504) OPEN；[#505](https://github.com/JTCAO515/VP-V4/issues/505) OPEN；[#506](https://github.com/JTCAO515/VP-V4/issues/506) OPEN；[#507](https://github.com/JTCAO515/VP-V4/issues/507) OPEN；[#508](https://github.com/JTCAO515/VP-V4/issues/508) OPEN。

## 开放 PR

| PR | 标题 | base | head | Draft | 最近更新（UTC） |
| --- | --- | --- | --- | --- | --- |
| [#530](https://github.com/JTCAO515/VP-V4/pull/530) | feat(ios): read confirmed Trip schedule in Today | main | `4560404` | 否 | 2026-09-24T13:51:42Z |

## 最近合并到 main 的 PR（最多 15 条）

| PR | 合并时间（UTC） | 合并提交 | 标题 |
| --- | --- | --- | --- |
| [#511](https://github.com/JTCAO515/VP-V4/pull/511) | 2026-09-24T15:33:59Z | `7e51272` | feat(memory): explicit travel pace with versioned correction and Undo |
| [#478](https://github.com/JTCAO515/VP-V4/pull/478) | 2026-09-24T15:21:09Z | `f27af3a` | fix(ios): repair native reading and Tools accessibility |
| [#534](https://github.com/JTCAO515/VP-V4/pull/534) | 2026-09-24T15:02:36Z | `a05528f` | Record Xcode Cloud recovery and unsigned Archive evidence for VPJ-56 |
| [#514](https://github.com/JTCAO515/VP-V4/pull/514) | 2026-09-24T14:57:06Z | `a2d090f` | fix(review): enforce native search deadline and clarify document label |
| [#533](https://github.com/JTCAO515/VP-V4/pull/533) | 2026-09-24T14:42:28Z | `d0482e7` | test(ios): verify pending Ask background SSE reconnect |
| [#532](https://github.com/JTCAO515/VP-V4/pull/532) | 2026-09-24T14:29:13Z | `6200724` | feat(ios): plan from completed grounded Ask request |
| [#531](https://github.com/JTCAO515/VP-V4/pull/531) | 2026-09-24T14:05:34Z | `c573587` | feat(ask): show next steps for each saved claim gap |
| [#528](https://github.com/JTCAO515/VP-V4/pull/528) | 2026-09-24T14:00:03Z | `6ee11a2` | Fix Xcode Cloud AMap script phase failure |
| [#529](https://github.com/JTCAO515/VP-V4/pull/529) | 2026-09-24T13:56:33Z | `8c04b29` | fix(knowledge): preserve Wiki draft when city scope is unresolved |
| [#527](https://github.com/JTCAO515/VP-V4/pull/527) | 2026-09-24T13:46:33Z | `b691ee9` | docs(handoff): record 2026-09-24 production hotfix and shared-database migrations |
| [#526](https://github.com/JTCAO515/VP-V4/pull/526) | 2026-09-23T14:19:43Z | `8002bb6` | iOS: privacy manifest, location purpose string and export-compliance key for first TestFlight upload |
| [#525](https://github.com/JTCAO515/VP-V4/pull/525) | 2026-09-23T14:08:11Z | `bb43c5d` | docs(handoff): final 2026-09-23 sync, production correction and status pagination fix |
| [#520](https://github.com/JTCAO515/VP-V4/pull/520) | 2026-09-23T13:55:17Z | `a4c7f12` | T5: Web security headers + per-actor quota for paid map/place routes |
| [#524](https://github.com/JTCAO515/VP-V4/pull/524) | 2026-09-23T13:52:18Z | `772620c` | feat(vpj-56): signed Archive + App Store Connect export path (X1) |
| [#522](https://github.com/JTCAO515/VP-V4/pull/522) | 2026-09-23T13:48:45Z | `f8bb609` | VPJ-07 #195: hosted multi-owner text worker with SQL discovery, stop switch and heartbeat |

## GitHub Production Deployment 记录（仅元数据）

| SHA | ref | 创建（UTC） | 最新状态 | 状态时间（UTC） |
| --- | --- | --- | --- | --- |
| `30e9801` | 30e9801 | 2026-09-23T22:15:00Z | success | 2026-09-23T22:15:02Z |
| `f14ee46` | f14ee46 | 2026-09-16T02:43:48Z | success | 2026-09-16T02:43:50Z |
| `033a3f5` | 033a3f5 | 2026-09-16T02:20:22Z | success | 2026-09-16T02:20:24Z |

## 全部 VPJ 任务

| 任务 | 阶段 | GitHub 状态 | 最近更新（UTC） | 关闭（UTC） |
| --- | --- | --- | --- | --- |
| [#188](https://github.com/JTCAO515/VP-V4/issues/188) VPJ-01 原生 iOS 五入口、中英文与可访问的首个 Trip 页面 | S1 | CLOSED | 2026-09-11T04:19:50Z | 2026-09-09T23:09:55Z |
| [#189](https://github.com/JTCAO515/VP-V4/issues/189) VPJ-02 现有 Staging 的真实身份、迁移与 owner 隔离验证 | S1 | CLOSED | 2026-09-17T05:49:17Z | 2026-09-17T05:49:17Z |
| [#190](https://github.com/JTCAO515/VP-V4/issues/190) VPJ-03 用户对话、材料、模型地区与人工访问的数据政策 | S1 | CLOSED | 2026-09-17T05:42:27Z | 2026-09-17T05:42:09Z |
| [#191](https://github.com/JTCAO515/VP-V4/issues/191) VPJ-04 原生登录、手机登录顶替与 Web 会话并存 | S1 | CLOSED | 2026-09-19T08:07:18Z | 2026-09-19T08:07:18Z |
| [#192](https://github.com/JTCAO515/VP-V4/issues/192) VPJ-05 同一 Trip 在 iOS 与精简 Web 创建、编辑和重载 | S1 | CLOSED | 2026-09-17T06:12:35Z | 2026-09-17T06:12:23Z |
| [#193](https://github.com/JTCAO515/VP-V4/issues/193) VPJ-06 Qwen、GLM、DeepSeek 的真实调用与质量成本对照 | S2 | CLOSED | 2026-09-17T12:30:37Z | 2026-09-17T12:30:37Z |
| [#195](https://github.com/JTCAO515/VP-V4/issues/195) VPJ-07 真实 Ask 得到可恢复的最终回答 | S2 | OPEN | 2026-09-17T05:34:56Z |  |
| [#196](https://github.com/JTCAO515/VP-V4/issues/196) VPJ-08 流式回答在断网、后台和跨端重连后接续 | S2 | OPEN | 2026-09-17T05:35:03Z |  |
| [#197](https://github.com/JTCAO515/VP-V4/issues/197) VPJ-09 从模糊想法得到可确认的多日行程 | S3 | OPEN | 2026-09-18T04:06:42Z |  |
| [#198](https://github.com/JTCAO515/VP-V4/issues/198) VPJ-10 选中一天或项目后与 VP 局部改稿 | S3 | OPEN | 2026-09-17T06:56:57Z |  |
| [#199](https://github.com/JTCAO515/VP-V4/issues/199) VPJ-11 Trip 连续记忆与用户可纠正的偏好 | S3 | OPEN | 2026-09-17T06:56:59Z |  |
| [#201](https://github.com/JTCAO515/VP-V4/issues/201) VPJ-12 单张旅行截图导入、校正与加入 Trip | S4 | OPEN | 2026-09-22T02:34:56Z |  |
| [#203](https://github.com/JTCAO515/VP-V4/issues/203) VPJ-13 首访与回访的三种入口获得首个成果 | S4 | OPEN | 2026-09-22T02:35:00Z |  |
| [#204](https://github.com/JTCAO515/VP-V4/issues/204) VPJ-14 受保护 Ops 登录与一条候选内容工作流 | S2 | CLOSED | 2026-09-17T11:39:13Z | 2026-09-17T11:39:13Z |
| [#205](https://github.com/JTCAO515/VP-V4/issues/205) VPJ-15 首批旅程内容从来源登记到已审核可用 | S2 | OPEN | 2026-09-21T20:35:19Z |  |
| [#206](https://github.com/JTCAO515/VP-V4/issues/206) VPJ-16 有依据的回答、诚实部分答案与知识缺口 | S2 | OPEN | 2026-09-17T06:58:31Z |  |
| [#207](https://github.com/JTCAO515/VP-V4/issues/207) VPJ-17 来源更新后安全重验相关知识与 Trip | S3 | OPEN | 2026-09-17T06:58:49Z |  |
| [#208](https://github.com/JTCAO515/VP-V4/issues/208) VPJ-18 高德主选与腾讯补充的实测、用途与成本边界 | S3 | OPEN | 2026-09-17T06:56:51Z |  |
| [#209](https://github.com/JTCAO515/VP-V4/issues/209) VPJ-19 地点消歧、地图展示与路线出口 | S3 | OPEN | 2026-09-17T06:56:53Z |  |
| [#210](https://github.com/JTCAO515/VP-V4/issues/210) VPJ-20 Explore 浏览内容并保存、问 VP、加入 Trip | S3 | OPEN | 2026-09-17T06:57:06Z |  |
| [#211](https://github.com/JTCAO515/VP-V4/issues/211) VPJ-21 准备检查把关键缺口变成可做的下一步 | S3 | OPEN | 2026-09-17T06:57:11Z |  |
| [#212](https://github.com/JTCAO515/VP-V4/issues/212) VPJ-22 酒店官方出口、参数落地与联盟归因验证 | S4 | OPEN | 2026-09-22T02:35:03Z |  |
| [#213](https://github.com/JTCAO515/VP-V4/issues/213) VPJ-23 住宿需求比较与透明联盟跳转 | S4 | OPEN | 2026-09-22T02:35:08Z |  |
| [#214](https://github.com/JTCAO515/VP-V4/issues/214) VPJ-24 第三方订单材料回到同一 Trip | S4 | OPEN | 2026-09-22T02:35:13Z |  |
| [#215](https://github.com/JTCAO515/VP-V4/issues/215) VPJ-25 Today 与可离线读取的旅行资料 | S4 | OPEN | 2026-09-22T02:35:16Z |  |
| [#216](https://github.com/JTCAO515/VP-V4/issues/216) VPJ-26 中英现场表达与大字展示 | S4 | OPEN | 2026-09-22T02:35:20Z |  |
| [#217](https://github.com/JTCAO515/VP-V4/issues/217) VPJ-27 按需语音翻译与可中断播放 | S4 | OPEN | 2026-09-22T02:35:23Z |  |
| [#218](https://github.com/JTCAO515/VP-V4/issues/218) VPJ-28 地点讲解与语音追问接回当前 Trip | S4 | OPEN | 2026-09-22T02:35:26Z |  |
| [#220](https://github.com/JTCAO515/VP-V4/issues/220) VPJ-29 用户报告变化后的局部恢复 | S4 | OPEN | 2026-09-22T02:35:30Z |  |
| [#221](https://github.com/JTCAO515/VP-V4/issues/221) VPJ-30 有原因、可关闭的旅行提醒 | S4 | OPEN | 2026-09-22T02:35:35Z |  |
| [#223](https://github.com/JTCAO515/VP-V4/issues/223) VPJ-31 按服务任务授权的动态 Traveler Brief | S4 | OPEN | 2026-09-22T02:35:45Z |  |
| [#224](https://github.com/JTCAO515/VP-V4/issues/224) VPJ-32 真人协助从请求到接单和结果回传 | S4 | OPEN | 2026-09-22T02:35:56Z |  |
| [#225](https://github.com/JTCAO515/VP-V4/issues/225) VPJ-33 Journey Pass 商品、权益和定价实验配置 | S5 | OPEN | 2026-09-22T02:36:04Z |  |
| [#226](https://github.com/JTCAO515/VP-V4/issues/226) VPJ-34 官方 IAP 购买、恢复与服务端权益 | S5 | OPEN | 2026-09-22T02:36:07Z |  |
| [#227](https://github.com/JTCAO515/VP-V4/issues/227) VPJ-35 Free/Pass 额度与完整任务成本控制 | S5 | OPEN | 2026-09-22T02:36:11Z |  |
| [#228](https://github.com/JTCAO515/VP-V4/issues/228) VPJ-36 核心资料的导出删除框架与首批执行器 | S5 | OPEN | 2026-09-22T02:36:15Z |  |
| [#229](https://github.com/JTCAO515/VP-V4/issues/229) VPJ-37 运营看见质量、成本和故障并能停用能力 | S5 | OPEN | 2026-09-22T02:36:18Z |  |
| [#230](https://github.com/JTCAO515/VP-V4/issues/230) VPJ-38 数据库、对象与删除状态的恢复演练 | S5 | OPEN | 2026-09-22T02:36:23Z |  |
| [#232](https://github.com/JTCAO515/VP-V4/issues/232) VPJ-39 境内外媒体、酒店跳转、IAP 与通知网络验收 | S5 | OPEN | 2026-09-22T02:36:31Z |  |
| [#233](https://github.com/JTCAO515/VP-V4/issues/233) VPJ-40 原生视觉动效、无障碍与性能整链复验 | S5 | OPEN | 2026-09-22T02:36:35Z |  |
| [#234](https://github.com/JTCAO515/VP-V4/issues/234) VPJ-41 精简 Web Planning Studio 的最终体验验收 | S5 | OPEN | 2026-09-22T02:36:39Z |  |
| [#242](https://github.com/JTCAO515/VP-V4/issues/242) VPJ-42 TestFlight 实机贯通 Plan、Ready、Travel 三段 | S5 | OPEN | 2026-09-22T02:36:43Z |  |
| [#243](https://github.com/JTCAO515/VP-V4/issues/243) VPJ-43 独立 Production 与可回滚的客户服务环境 | S6 | OPEN | 2026-09-17T06:56:40Z |  |
| [#244](https://github.com/JTCAO515/VP-V4/issues/244) VPJ-44 正式 App Store 1.0 提交与数字商品审核 | S6 | OPEN | 2026-09-17T06:56:42Z |  |
| [#245](https://github.com/JTCAO515/VP-V4/issues/245) VPJ-45 客户收到产品后的观察、支持与发布关账 | S6 | OPEN | 2026-09-17T06:56:44Z |  |
| [#246](https://github.com/JTCAO515/VP-V4/issues/246) VPJ-46 两周客户发现试点与后续运营交接 | S1 | OPEN | 2026-09-17T06:56:33Z |  |
| [#247](https://github.com/JTCAO515/VP-V4/issues/247) VPJ-47 真实激活、付费与人工成本的经营观察 | S6 | OPEN | 2026-09-17T06:56:46Z |  |
| [#235](https://github.com/JTCAO515/VP-V4/issues/235) VPJ-48 用户旅行内容投稿与发布前审核 | S5 | OPEN | 2026-09-22T02:36:48Z |  |
| [#241](https://github.com/JTCAO515/VP-V4/issues/241) VPJ-49 最简本地旅行分享卡与隐私预览 | S4 | CLOSED | 2026-09-17T05:37:19Z | 2026-09-17T05:37:19Z |
| [#248](https://github.com/JTCAO515/VP-V4/issues/248) VPJ-50 有真实召回失败才启用混合 RAG 与重排 | expand | OPEN | 2026-09-17T06:59:04Z |  |
| [#249](https://github.com/JTCAO515/VP-V4/issues/249) VPJ-51 航班来源与中国航线对照（证据触发） | expand | OPEN | 2026-09-17T06:57:57Z |  |
| [#250](https://github.com/JTCAO515/VP-V4/issues/250) VPJ-52 授权航班状态与相关行程重验 | expand | OPEN | 2026-09-17T06:57:59Z |  |
| [#251](https://github.com/JTCAO515/VP-V4/issues/251) VPJ-53 Android 与新增语言的需求触发设计 | expand | OPEN | 2026-09-17T06:58:01Z |  |
| [#252](https://github.com/JTCAO515/VP-V4/issues/252) VPJ-54 长期订阅或交易深度升级的证据决策 | expand | OPEN | 2026-09-17T06:56:48Z |  |
| [#236](https://github.com/JTCAO515/VP-V4/issues/236) VPJ-55 限定文件导入与系统分享、登录回跳衔接 | S4 | OPEN | 2026-09-22T02:36:53Z |  |
| [#237](https://github.com/JTCAO515/VP-V4/issues/237) VPJ-56 原生 CI、签名 Archive 与首个 TestFlight 安装包 | S5 | OPEN | 2026-09-22T02:36:56Z |  |
| [#222](https://github.com/JTCAO515/VP-V4/issues/222) VPJ-57 用户服务请求与按任务授予资料访问 | S4 | OPEN | 2026-09-22T02:36:59Z |  |
| [#239](https://github.com/JTCAO515/VP-V4/issues/239) VPJ-58 全数据模块导出删除与恢复后的最终隔离验收 | S5 | OPEN | 2026-09-22T02:37:02Z |  |
| [#194](https://github.com/JTCAO515/VP-V4/issues/194) VPJ-59 首个真实模型任务的预算预留与故障止损 | S2 | CLOSED | 2026-09-17T05:10:32Z | 2026-09-11T20:49:45Z |
| [#200](https://github.com/JTCAO515/VP-V4/issues/200) VPJ-60 图片和语音 Provider 的中英质量与数据流验收 | S4 | OPEN | 2026-09-22T02:37:05Z |  |
| [#240](https://github.com/JTCAO515/VP-V4/issues/240) VPJ-61 旅行结束、归档与下一次回来 | S4 | OPEN | 2026-09-22T02:37:08Z |  |
| [#202](https://github.com/JTCAO515/VP-V4/issues/202) VPJ-62 公开中英申请入口与隐私可控的招募漏斗 | S1 | CLOSED | 2026-09-17T05:50:09Z | 2026-09-17T05:50:09Z |
| [#231](https://github.com/JTCAO515/VP-V4/issues/231) VPJ-63 登录、Ask 与 Trip 的境内外网络首轮探针 | S2 | CLOSED | 2026-09-17T11:38:11Z | 2026-09-17T11:38:11Z |
| [#238](https://github.com/JTCAO515/VP-V4/issues/238) VPJ-64 社区举报、屏蔽、申诉与内容删除 | S5 | OPEN | 2026-09-22T02:37:11Z |  |
| [#219](https://github.com/JTCAO515/VP-V4/issues/219) VPJ-65 真实地点与依据支撑的完整计划核验 | S3 | OPEN | 2026-09-17T06:57:01Z |  |
| [#263](https://github.com/JTCAO515/VP-V4/issues/263) VPJ-66 Harness：两条离线旅行任务可运行、判分并定位失败 | S2 | CLOSED | 2026-09-11T04:23:06Z | 2026-09-09T05:04:46Z |
| [#264](https://github.com/JTCAO515/VP-V4/issues/264) VPJ-67 Harness：真实只读问答产生有依据的结果与回执 | S2 | OPEN | 2026-09-17T06:58:56Z |  |
| [#265](https://github.com/JTCAO515/VP-V4/issues/265) VPJ-68 Harness：少走路且保留已确认晚餐的局部改稿闭环 | S3 | OPEN | 2026-09-17T06:57:55Z |  |
| [#266](https://github.com/JTCAO515/VP-V4/issues/266) VPJ-69 Harness：故障取消与重连不伪造成功或重复提交 | S3 | OPEN | 2026-09-17T06:58:58Z |  |
| [#267](https://github.com/JTCAO515/VP-V4/issues/267) VPJ-70 Harness：只读模型或提示词候选的配对评测与校准 | S5 | OPEN | 2026-09-22T02:37:17Z |  |
| [#268](https://github.com/JTCAO515/VP-V4/issues/268) VPJ-71 Harness：核心任务发布判定与能力停用恢复验收 | S5 | OPEN | 2026-09-22T02:37:20Z |  |
| [#287](https://github.com/JTCAO515/VP-V4/issues/287) VPJ-72 中英回答离线内容判分与可导入反馈的盲评包 | S2 | CLOSED | 2026-09-11T04:29:22Z | 2026-09-09T22:15:20Z |
| [#288](https://github.com/JTCAO515/VP-V4/issues/288) VPJ-73 Docling合成旅行材料解析与校正候选试验 | S2 | CLOSED | 2026-09-11T04:23:27Z | 2026-09-09T21:50:40Z |
| [#358](https://github.com/JTCAO515/VP-V4/issues/358) VPJ-74 运营可追溯查看来源版本、原文与知识本体关系 | S2 | CLOSED | 2026-09-17T05:04:19Z | 2026-09-14T07:45:15Z |
| [#359](https://github.com/JTCAO515/VP-V4/issues/359) VPJ-75 新来源经LLM Wiki整理为可审查并可发布的知识变更 | S2 | OPEN | 2026-09-19T10:35:20Z |  |
| [#360](https://github.com/JTCAO515/VP-V4/issues/360) VPJ-76 Ask检索已发布Wiki与原子声明并返回完整证据和具体缺口 | S2 | OPEN | 2026-09-19T10:35:23Z |  |
