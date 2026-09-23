# 当前开发状态与交接核对（2026-09-23）

核对基线：GitHub `origin/main` 的 `a90ce61`（PR #516 合并，2026-09-22T06:19Z）；Issue、PR 与 Deployment 记录于 2026-09-23T09:00Z 前后只读查询。本文取代 [2026-09-22 快照](CURRENT-STATUS-2026-09-22.md)（停在 `ce46abd`）作为当前读回入口，旧快照保留为历史。OPEN/CLOSED 仅为 Tracker 状态，不替代相应版本、环境和用户行为的验收。本次未更改任何 Issue 正文、标签、勾选或状态。

之后的读回用 `node scripts/program-status.mjs` 生成（见文末“自动读回”），不要再手工抄全表。

## 相对 2026-09-22 快照的纠正

- [#479](https://github.com/JTCAO515/VP-V4/pull/479) 已于 2026-09-22T00:37Z 合并到 main（`2ef0950`），旧快照写的 OPEN 已过时。它报告的 Staging 61 条迁移、真实 Qwen Wiki/Ask 与 Web 回读是该 PR 的证据，本次未重新连接 Staging 复验；#359/#360 仍 OPEN，独立审核发布、新内容双端回读、answered EvidencePack v2、真机、账单与最终恢复演练仍未完成。
- `ce46abd` 之后共 28 个 PR 合并到 main（下表）。旧快照与 [S4/S5 切片稿](S4-S5-SLICES-2026-09-22.md) 中写作 OPEN/draft 的 #485、#490、#494、#497、#498 均已在 2026-09-22 合并；切片稿其他排程内容不因此改变。
- 当前开放 PR：[#478](https://github.com/JTCAO515/VP-V4/pull/478)（原生阅读与 Tools 无障碍）、[#511](https://github.com/JTCAO515/VP-V4/pull/511)（显式旅行节奏与可撤销纠正）、[#514](https://github.com/JTCAO515/VP-V4/pull/514)（原生搜索时限与材料标签）。
- 76 张 VPJ 任务的 OPEN/CLOSED 状态与 2026-09-22 快照相同：61 OPEN、15 CLOSED（均为 completed）。2026-09-22T02:34–02:37Z 有一批 S4/S5 父票更新时间，状态未变。
- 新增跟踪：#510 发布的 S4/S5 首批子票 [#503](https://github.com/JTCAO515/VP-V4/issues/503)–[#508](https://github.com/JTCAO515/VP-V4/issues/508) 均 OPEN；维护票 [#492](https://github.com/JTCAO515/VP-V4/issues/492)（Qwen 工作区端点）已 CLOSED/completed，[#491](https://github.com/JTCAO515/VP-V4/issues/491)（ai-assist 函数时长显式声明）OPEN。

## ce46abd 之后合并到 main 的 PR

每行只概括 PR 自述的范围；关联的 VPJ Issue 均未因这些合并关闭（仅维护票 #492 已关闭），运行/设备/供应商验收以各 PR 的 UNRUN 记录为准。

| PR | 合并时间（UTC） | 合并提交 | 结果（关联 Issue） |
| --- | --- | --- | --- |
| [#479](https://github.com/JTCAO515/VP-V4/pull/479) | 2026-09-22T00:37:17Z | `2ef0950` | VPJ-75/76 Staging 运行证据与 AI-assist 超时修复（#359/#360 仍 OPEN） |
| [#480](https://github.com/JTCAO515/VP-V4/pull/480) | 2026-09-22T00:49:13Z | `d2d1406` | S1 申请入口激活与客户发现准备（#246；访谈/交付未运行） |
| [#481](https://github.com/JTCAO515/VP-V4/pull/481) | 2026-09-21T20:37:50Z | `5f95d16` | #363 双端地点消费者与高德展示接线；刷新当时说明文档 |
| [#482](https://github.com/JTCAO515/VP-V4/pull/482) | 2026-09-22T00:50:30Z | `72095f9` | Journey Pass 开发政策与同源 StoreKit 配置（#225；开发值，非正式商品） |
| [#483](https://github.com/JTCAO515/VP-V4/pull/483) | 2026-09-22T00:49:51Z | `f80af22` | 上海机场交通内容候选与 Ops 提交工具（#205） |
| [#484](https://github.com/JTCAO515/VP-V4/pull/484) | 2026-09-22T00:50:11Z | `55c6c44` | 合成图片转写的有界 vision 资格路径（#200；真实媒体调用未验） |
| [#485](https://github.com/JTCAO515/VP-V4/pull/485) | 2026-09-22T04:39:04Z | `f4c88a0` | 原生中英文本翻译与大字卡（#216） |
| [#486](https://github.com/JTCAO515/VP-V4/pull/486) | 2026-09-22T00:47:35Z | `7a05827` | Trip 显式归档，保留结果与服务（#240 首片） |
| [#487](https://github.com/JTCAO515/VP-V4/pull/487) | 2026-09-22T00:48:04Z | `458fbef` | artifacts 体积守卫接线与 nightly 门禁对齐 |
| [#488](https://github.com/JTCAO515/VP-V4/pull/488) | 2026-09-22T00:48:54Z | `b4a99ec` | agents 规则单一归属整理 |
| [#489](https://github.com/JTCAO515/VP-V4/pull/489) | 2026-09-22T00:48:33Z | `eabbbd9` | 开放 S3–S6 工作的可执行顺序 |
| [#490](https://github.com/JTCAO515/VP-V4/pull/490) | 2026-09-22T05:57:09Z | `e0cac49` | 用户设定时间/原因/取消的提醒存储（#221；推送仍不可用） |
| [#493](https://github.com/JTCAO515/VP-V4/pull/493) | 2026-09-22T02:04:41Z | `e7b6f35` | 已保存部分回答显示具体缺口（#206 Web 消费者） |
| [#494](https://github.com/JTCAO515/VP-V4/pull/494) | 2026-09-22T05:01:28Z | `7ef950f` | 当前路线比较与精确地点外跳（#364/#209） |
| [#495](https://github.com/JTCAO515/VP-V4/pull/495) | 2026-09-22T02:05:30Z | `2dcd25c` | 只读配对评测阈值冻结与盲评决定绑定（#267） |
| [#496](https://github.com/JTCAO515/VP-V4/pull/496) | 2026-09-22T01:55:41Z | `9782e0c` | 排队的 Trip 核心删除与可验证回执（#228；非全账户删除） |
| [#497](https://github.com/JTCAO515/VP-V4/pull/497) | 2026-09-22T06:12:55Z | `c8e92ee` | 服务单与可撤销员工访问（#222；共享 Staging/真实权限未验） |
| [#498](https://github.com/JTCAO515/VP-V4/pull/498) | 2026-09-22T02:28:56Z | `b15635a` | 原生透明官方酒店搜索出口（#212） |
| [#499](https://github.com/JTCAO515/VP-V4/pull/499) | 2026-09-22T02:02:47Z | `a8fa82a` | Qwen 迁到精确工作区端点绑定（维护 #492 已关闭） |
| [#500](https://github.com/JTCAO515/VP-V4/pull/500) | 2026-09-22T02:04:45Z | `20d706d` | H04 任务录制与 Trip 不变性校验（#264） |
| [#501](https://github.com/JTCAO515/VP-V4/pull/501) | 2026-09-22T02:07:26Z | `fa4b7f5` | Ops 查看尝试对账与未知成本（#229） |
| [#502](https://github.com/JTCAO515/VP-V4/pull/502) | 2026-09-22T02:08:36Z | `a3a6918` | 内部体验内容审核（#235） |
| [#509](https://github.com/JTCAO515/VP-V4/pull/509) | 2026-09-22T04:08:30Z | `817557d` | 原生 Ask 输入进入可编辑相对日计划（#197） |
| [#510](https://github.com/JTCAO515/VP-V4/pull/510) | 2026-09-22T04:15:04Z | `186c61c` | 发布 S4/S5 切片与六线程顺序（子票 #503–#508） |
| [#512](https://github.com/JTCAO515/VP-V4/pull/512) | 2026-09-22T04:09:14Z | `1433f3a` | 原生与 Web 的 SIM 资料准备检查（#211） |
| [#513](https://github.com/JTCAO515/VP-V4/pull/513) | 2026-09-22T06:14:26Z | `a533a8c` | Ask 键盘状态 UI 测试 |
| [#515](https://github.com/JTCAO515/VP-V4/pull/515) | 2026-09-22T06:14:30Z | `881230e` | 规划输入保留时长歧义与明确排除的兴趣（#197） |
| [#516](https://github.com/JTCAO515/VP-V4/pull/516) | 2026-09-22T06:19:37Z | `a90ce61` | community-postgres 镜像拉取重试 |

## 生产版本：记录不一致，待核实

以下是事实并列，不据此推断生产当前运行哪个提交：

- 此前交接记录（2026-09-12 决定）：main 自动 Production 构建经单字段 guard 暂停，PR332 合并后 Production 构建 CANCELED，全部线上 alias 当时保留 `db5fb7b`。
- GitHub Deployments API 的最近两条 Production 记录为 `f14ee46`（2026-09-16T02:43:48Z 创建，最新状态 success）与 `033a3f5`（2026-09-16T02:20Z，success）。`f14ee46` 是 [PR #419](https://github.com/JTCAO515/VP-V4/pull/419) 的提交，该 PR 的 base 是 `testing-chat-vpv4` 而非 main；两者都不是 main 的祖先。
- 协调会话 2026-09-23 的实测观察：生产已提供 2026-09-17 才加入 main 的 `/research` 与 `/api/intake`。本线程未重新探测生产。
- 结论：“生产冻结在 `db5fb7b`”不再作为当前事实；生产实际提供的版本未知，线程 T1 正在只读核实。GitHub Deployment 记录不等于当前 alias 指向。核实前不得据此声明任何能力已在生产可用或不可用。

## 2026-09-23 决定与本轮线程

JT 于 2026-09-23 在协调会话中明确授权（完整文本见 [HANDOFF](../../../HANDOFF.md#当前决定)）：一次只含安全补丁的生产发布（升级 next 修复 Critical 漏洞，方案待批准后执行）；外部 PR 不在自托管 runner 执行；main 开启分支保护（required check 为 Quality PR 的 `deterministic-pr-gates`，禁止 force push/删除）；下一轮集中常驻 worker + 有依据的 Ask + Trip 确认直到 TestFlight 真机可用，同时启动 #246 客户发现，暂停继续铺设新的 S3–S5 切片。上述决定不扩展到其他生产动作、资金、真实用户数据或外部消息。

本轮并行线程：T1 next 安全升级与生产版本只读核实；T2 CI 治理与全量 DB 集成测试；T3 常驻 Ask worker（#195）；T4 签名 Archive/TestFlight（待启动）；T5 Web 安全头与地图限流；T6 交接同步与状态自动化（本文）；T7 #246 客户发现执行包。线程划分是调度记录，不改变 Issue 验收、依赖或 owner。

## 自动读回

- 本地：`node scripts/program-status.mjs --out <file.md> [--json <file.json>] [--merged N]`。有 `GH_TOKEN`/`GITHUB_TOKEN` 时直接调用 GitHub REST API，否则使用已登录的 `gh api`；只发 GET 请求。
- CI：[Program Status](../../../.github/workflows/program-status.yml) 在 main push、每日定时与手动触发时于 GitHub 托管 runner 运行，结果写入 job summary 与 `program-status` artifact（保留 14 天）。它不是 PR 触发器、不是 required check，也不写回仓库或 Issue；GitHub API 不可用只影响这份报告，不影响 PR 门禁。
- 报告只读 Tracker 与部署元数据；更新本文件或 `docs/handoff.json` 仍需人工核对后提交。

## 全队列读回（2026-09-23T09:00Z 生成）

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
