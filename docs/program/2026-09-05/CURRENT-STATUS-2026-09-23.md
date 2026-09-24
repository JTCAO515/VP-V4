# 当前开发状态与交接核对（2026-09-23，本轮最终）

核对基线：GitHub `origin/main` 的 `a4c7f12`（PR #520 合并，2026-09-23T13:55Z）；Issue、PR 与分支保护于 2026-09-23T13:59Z 只读查询。本文替换同日早先版本（固定于 [`9e0553f`](https://github.com/JTCAO515/VP-V4/blob/9e0553f/docs/program/2026-09-05/CURRENT-STATUS-2026-09-23.md)，其中关于生产版本“未知”与 `f14ee46` 的记载已被下文更正）；[2026-09-22 快照](CURRENT-STATUS-2026-09-22.md)保留为历史。OPEN/CLOSED 仅为 Tracker 状态，不替代验收。本次未更改任何 Issue。

下文“全队列读回”由 `node scripts/program-status.mjs` 生成；标注“协调者核实”的事实来自协调会话，本线程未重复读取 Vercel 或数据库。

## 本轮合并（2026-09-23）

| PR | 线程 | 结果与未完成部分 |
| --- | --- | --- |
| [#519](https://github.com/JTCAO515/VP-V4/pull/519) | T1 | main 升级 Next.js 16.3.6（Critical/High 通告）并附生产热修方案；**生产尚未部署** |
| [#517](https://github.com/JTCAO515/VP-V4/pull/517) | T7 | #246 两周客户发现的招募、访谈与回写执行包；未外联，D0 待 JT 核对 |
| [#518](https://github.com/JTCAO515/VP-V4/pull/518) | T6 | 交接同步与只读 `program-status` 读回脚本/workflow |
| [#521](https://github.com/JTCAO515/VP-V4/pull/521) | T2 | 自托管 iOS runner 仅限本仓库事件/手动；`db-integration` 5 个 lane 共 181 用例、0 skip（协调者核实） |
| [#523](https://github.com/JTCAO515/VP-V4/pull/523) | T8 | 收紧函数 EXECUTE：anon 仅保留 `research_intake_v1`，并固定函数 ACL 允许表；迁移未应用到共享数据库 |
| [#522](https://github.com/JTCAO515/VP-V4/pull/522) | T3 | #195 常驻多 owner text worker（容器、SQL 发现、停用开关、心跳）代码与迁移；**未部署、未激活** |
| [#524](https://github.com/JTCAO515/VP-V4/pull/524) | T4 | #237 签名 Archive 与 App Store Connect 导出通路；未签名 Archive 首跑 [run 35870142999](https://github.com/JTCAO515/VP-V4/actions/runs/35870142999)（main `772620c`）success；签名/上传/TestFlight UNRUN |
| [#520](https://github.com/JTCAO515/VP-V4/pull/520) | T5 | Web 安全响应头与付费地图/地点路由按 actor 配额；迁移未应用、生产未上线 |

进行中：T9 iOS 隐私清单/出口合规 PR（未合并）。开放 PR 另有 #478、#511、#514，保持原归属。76 张 VPJ 任务仍为 61 OPEN / 15 CLOSED，本轮无 Issue 关闭。

## 仓库设置（JT 授权，协调者执行）

- fork PR 运行审批：`all_external_contributors`（协调者执行）。
- main 分支保护：required checks = `deterministic-pr-gates`、`db-integration`；`enforce_admins=true`；禁止 force push 与删除。本线程 2026-09-23 只读复核 API 结果一致。

## 生产事实（更正）

协调者经 Vercel CLI 读取：`go2china.space`、`www.go2china.space`、`vp-v4.vercel.app` 均指向 `dpl_2WV2dky65LhMguX8QnFUhz6xPRKm`（target production，source=cli，gitCommitSha `a8fa82ad` 即 #499 合并提交，2026-09-22 10:04 +0800 创建，Next 16.2.6）；Production 设有 `VISEPANDA_QWEN_ENDPOINT`；`staging.go2china.space` 指向 `dpl_5eBh1Exfo4W8rXEh1T3AazJnUjXW`。

- 旧交接的“生产冻结于 `db5fb7b`”与早先版本的“最后生产部署 `f14ee46`”**均不成立**。GitHub Deployment 记录（下表仍显示 `f14ee46`）只是元数据；CLI 发布不产生这类记录。
- 生产仍是 Next 16.2.6，**不含** #519 的安全补丁。热修分支 `hotfix/next-16-3-6-20260923` = `a8fa82ad` + cherry-pick `303088d3`（协调者本地提交 `30e98013`，本地验证全绿，因权限尚未推送/部署）；方案见 [hotfix-plan.md](../../../artifacts/SEC-next-16-3-20260923/hotfix-plan.md)。执行待 JT。

## 关键风险：生产站与 Staging 共用数据库

仓库既有记录（[Staging/Vercel 维护手册](../../runbooks/staging-vercel-maintenance.md)）显示 Production、Preview、Development 三个 Vercel 环境的 `NEXT_PUBLIC_SUPABASE_URL` 都是 Staging 项目 `dzqdzetcctkhbrhlxxgn`。因此：

- 对“Staging”执行 #522/#523/#520 的任一迁移，都同时作用于生产站背后的数据库；执行前须 JT 先备份并决定。
- #520 代码上线生产前，该库必须已有其迁移。
- 独立 Production 环境仍属 [#243](https://github.com/JTCAO515/VP-V4/issues/243)，尚未建立。

## 待 JT 亲自执行

1. 生产热修部署（上述分支/方案）。
2. Staging（= 共享）数据库备份，然后应用 #522/#523/#520 迁移。
3. TestFlight 签名材料与 `testflight` Environment secrets（#237/#242）。
4. worker 托管账号与密钥（#195 激活）。
5. #246 客户发现 D0 核对。

开发线程不代办上述动作；输入到位后按主线依次激活 worker → 有依据的 Ask 与 Trip 确认 → 签名 Archive → TestFlight。

## 自动读回

`node scripts/program-status.mjs --out <file.md> [--json <file.json>] [--merged N]`（本地用 `gh api`，CI 用 `GITHUB_TOKEN`，只读）；[Program Status](../../../.github/workflows/program-status.yml) 在 main push/每日/手动时运行，不是 PR 门禁。#518 首版在已关闭 PR 超过 3 页时报错，导致 `f8bb609`、`772620c`、`a4c7f12` 三次 push 运行失败；本 PR 改为只取最近两页并补测试。

## 全队列读回（2026-09-23T13:59Z 生成）

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

### 开放 PR

| PR | 标题 | base | head | Draft | 最近更新（UTC） |
| --- | --- | --- | --- | --- | --- |
| [#478](https://github.com/JTCAO515/VP-V4/pull/478) | fix(ios): repair native reading and Tools accessibility | main | `e491406` | 否 | 2026-09-22T06:17:47Z |
| [#511](https://github.com/JTCAO515/VP-V4/pull/511) | feat(memory): explicit travel pace with versioned correction and Undo | main | `4855ba6` | 否 | 2026-09-22T06:19:45Z |
| [#514](https://github.com/JTCAO515/VP-V4/pull/514) | fix(review): enforce native search deadline and clarify document label | main | `2ddf400` | 否 | 2026-09-22T04:18:57Z |

### 最近合并到 main 的 PR（最多 12 条）

| PR | 合并时间（UTC） | 合并提交 | 标题 |
| --- | --- | --- | --- |
| [#520](https://github.com/JTCAO515/VP-V4/pull/520) | 2026-09-23T13:55:17Z | `a4c7f12` | T5: Web security headers + per-actor quota for paid map/place routes |
| [#524](https://github.com/JTCAO515/VP-V4/pull/524) | 2026-09-23T13:52:18Z | `772620c` | feat(vpj-56): signed Archive + App Store Connect export path (X1) |
| [#522](https://github.com/JTCAO515/VP-V4/pull/522) | 2026-09-23T13:48:45Z | `f8bb609` | VPJ-07 #195: hosted multi-owner text worker with SQL discovery, stop switch and heartbeat |
| [#523](https://github.com/JTCAO515/VP-V4/pull/523) | 2026-09-23T13:37:51Z | `afb574f` | fix(db): revoke implicit anon function EXECUTE and pin the function ACL allowlist |
| [#521](https://github.com/JTCAO515/VP-V4/pull/521) | 2026-09-23T13:26:48Z | `9f11ec4` | ci: guard self-hosted iOS runner; run every gated DB integration test in CI |
| [#518](https://github.com/JTCAO515/VP-V4/pull/518) | 2026-09-23T13:26:27Z | `9e0553f` | docs(handoff): sync 2026-09-23 status and add read-only program status report |
| [#517](https://github.com/JTCAO515/VP-V4/pull/517) | 2026-09-23T13:25:01Z | `f69c4f9` | docs(vpj-46): executable recruiting, interview and write-back kit for the two-week discovery pilot |
| [#519](https://github.com/JTCAO515/VP-V4/pull/519) | 2026-09-23T13:23:47Z | `fedb3c4` | fix(deps): upgrade Next.js to 16.3.6 (critical/high advisories) + prod hotfix plan |
| [#516](https://github.com/JTCAO515/VP-V4/pull/516) | 2026-09-22T06:19:37Z | `a90ce61` | chore(ci): retry the pinned Postgres image pull in community-postgres.yml |
| [#515](https://github.com/JTCAO515/VP-V4/pull/515) | 2026-09-22T06:14:30Z | `881230e` | fix(planning): preserve duration ambiguity and explicit interest exclusions |
| [#513](https://github.com/JTCAO515/VP-V4/pull/513) | 2026-09-22T06:14:26Z | `a533a8c` | test(ios): verify Ask keyboard state before dismissal |
| [#497](https://github.com/JTCAO515/VP-V4/pull/497) | 2026-09-22T06:12:55Z | `c8e92ee` | feat(service): record support cases with revocable employee access |

### GitHub Production Deployment 记录（仅元数据）

| SHA | ref | 创建（UTC） | 最新状态 | 状态时间（UTC） |
| --- | --- | --- | --- | --- |
| `f14ee46` | f14ee46 | 2026-09-16T02:43:48Z | success | 2026-09-16T02:43:50Z |
| `033a3f5` | 033a3f5 | 2026-09-16T02:20:22Z | success | 2026-09-16T02:20:24Z |
| `6e3a128` | 6e3a128 | 2026-09-13T19:29:48Z | inactive | 2026-09-13T19:29:48Z |

### 全部 VPJ 任务

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
