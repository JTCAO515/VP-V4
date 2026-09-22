# S3–S6 可执行顺序

生成自 `issue-plan.json` 与当日 GitHub 开放 Issue（2026-09-22）：`node scripts/vpj-sequence.mjs`。
这是既有任务的排序，不是第二套队列——不新增任务，不改身份、范围、验收或依赖，也不关闭任何票。
任务定义仍以 [issue-plan.json](issue-plan.json) 和各自[执行行](EXECUTION-CONTRACT.md)为准。

`blockedBy` 是开工硬依赖；`acceptanceDependencies` 是集成/最终验收输入，**不阻止有界切片开工**
（见 [issue-tracker.md](../../agents/issue-tracker.md)）。所以下面「现在可开工」按硬依赖判定，
「验收波次」按剩余验收链长度判定：波次高不代表不能动手，只代表它的整票验收要等更多上游真实证据。

## 现在就可以开工（无开放硬依赖）

S3–S6 共 48 张开放票，其中 42 张没有任何开放的开工硬依赖。
排期的瓶颈不是依赖图，而是三队的并行带宽。

### B · 行程/地图/原生体验 — 22 张

| 任务 | 用户结果 | 阶段 | 开工硬依赖 | 待验收输入数 |
| --- | --- | --- | --- | ---: |
| [VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208) | 高德主选与腾讯补充的实测、用途与成本边界 | S3 | 无 | 0 |
| [VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212) | 酒店官方出口、参数落地与联盟归因验证 | S4 | 无 | 0 |
| [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215) | Today 与可离线读取的旅行资料 | S4 | 无 | 0 |
| [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199) | Trip 连续记忆与用户可纠正的偏好 | S3 | 无 | 1 |
| [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209) | 地点消歧、地图展示与路线出口 | S3 | 无 | 1 |
| [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197) | 从模糊想法得到可确认的多日行程 | S3 | 无 | 2 |
| [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213) | 住宿需求比较与透明联盟跳转 | S4 | 无 | 3 |
| [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216) | 中英现场表达与大字展示 | S4 | 无 | 2 |
| [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236) | 限定文件导入与系统分享、登录回跳衔接 | S4 | 无 | 1 |
| [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198) | 选中一天或项目后与 VP 局部改稿 | S3 | 无 | 1 |
| [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203) | 首访与回访的三种入口获得首个成果 | S4 | 无 | 3 |
| [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210) | Explore 浏览内容并保存、问 VP、加入 Trip | S3 | 无 | 3 |
| [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214) | 第三方订单材料回到同一 Trip | S4 | 无 | 2 |
| [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217) | 按需语音翻译与可中断播放 | S4 | 无 | 2 |
| [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219) | 真实地点与依据支撑的完整计划核验 | S3 | 无 | 3 |
| [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221) | 有原因、可关闭的旅行提醒 | S4 | 无 | 3 |
| [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211) | 准备检查把关键缺口变成可做的下一步 | S3 | 无 | 3 |
| [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218) | 地点讲解与语音追问接回当前 Trip | S4 | 无 | 3 |
| [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234) | 精简 Web Planning Studio 的最终体验验收 | S5 | 无 | 2 |
| [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220) | 用户报告变化后的局部恢复 | S4 | 无 | 4 |
| [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240) | 旅行结束、归档与下一次回来 | S4 | 无 | 2 |
| [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233) | 原生视觉动效、无障碍与性能整链复验 | S5 | 无 | 15 |

建议起点：VPJ-18 #208、VPJ-22 #212（本队波次最浅）。

### A · 平台/商业/交付 — 15 张

| 任务 | 用户结果 | 阶段 | 开工硬依赖 | 待验收输入数 |
| --- | --- | --- | --- | ---: |
| [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222) | 用户服务请求与按任务授予资料访问 | S4 | 无 | 0 |
| [VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225) | Journey Pass 商品、权益和定价实验配置 | S5 | 无 | 0 |
| [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237) | 原生 CI、签名 Archive 与首个 TestFlight 安装包 | S5 | 无 | 0 |
| [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226) | 官方 IAP 购买、恢复与服务端权益 | S5 | 无 | 1 |
| [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223) | 按服务任务授权的动态 Traveler Brief | S4 | 无 | 3 |
| [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227) | Free/Pass 额度与完整任务成本控制 | S5 | 无 | 2 |
| [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228) | 核心资料的导出删除框架与首批执行器 | S5 | 无 | 4 |
| [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229) | 运营看见质量、成本和故障并能停用能力 | S5 | 无 | 2 |
| [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230) | 数据库、对象与删除状态的恢复演练 | S5 | 无 | 1 |
| [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232) | 境内外媒体、酒店跳转、IAP 与通知网络验收 | S5 | 无 | 7 |
| [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224) | 真人协助从请求到接单和结果回传 | S4 | 无 | 3 |
| [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239) | 全数据模块导出删除与恢复后的最终隔离验收 | S5 | 无 | 11 |
| [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242) | TestFlight 实机贯通 Plan、Ready、Travel 三段 | S5 | 无 | 21 |
| [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243) | 独立 Production 与可回滚的客户服务环境 | S6 | 无 | 2 |
| [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244) | 正式 App Store 1.0 提交与数字商品审核 | S6 | 无 | 3 |

建议起点：VPJ-57 #222、VPJ-33 #225（本队波次最浅）。

### C · AI/知识/质量 — 5 张

| 任务 | 用户结果 | 阶段 | 开工硬依赖 | 待验收输入数 |
| --- | --- | --- | --- | ---: |
| [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200) | 图片和语音 Provider 的中英质量与数据流验收 | S4 | 无 | 0 |
| [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201) | 单张旅行截图导入、校正与加入 Trip | S4 | 无 | 2 |
| [VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267) | Harness：只读模型或提示词候选的配对评测与校准 | S5 | 无 | 1 |
| [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235) | 用户旅行内容投稿与发布前审核 | S5 | 无 | 2 |
| [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238) | 社区举报、屏蔽、申诉与内容删除 | S5 | 无 | 2 |

建议起点：VPJ-60 #200、VPJ-12 #201（本队波次最浅）。

## 有开工硬依赖（6 张）

| 任务 | 用户结果 | 阶段 | 开工硬依赖 | 待验收输入数 |
| --- | --- | --- | --- | ---: |
| [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207) | 来源更新后安全重验相关知识与 Trip | S3 | VPJ-75 | 1 |
| [VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265) | Harness：少走路且保留已确认晚餐的局部改稿闭环 | S3 | VPJ-65 | 3 |
| [VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266) | Harness：故障取消与重连不伪造成功或重复提交 | S3 | VPJ-68 | 0 |
| [VPJ-71 #268](https://github.com/JTCAO515/VP-V4/issues/268) | Harness：核心任务发布判定与能力停用恢复验收 | S5 | VPJ-69, VPJ-70 | 1 |
| [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245) | 客户收到产品后的观察、支持与发布关账 | S6 | VPJ-42, VPJ-44 | 0 |
| [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247) | 真实激活、付费与人工成本的经营观察 | S6 | VPJ-44 | 2 |

## 验收波次

波次 = 该票剩余验收链上还开着的上游票数量的最长路径。最后一波是整链验收的收口票。

- **W0**（7 张）：VPJ-60、VPJ-18、VPJ-22、VPJ-25、VPJ-57、VPJ-33、VPJ-56
- **W1**（4 张）：VPJ-11、VPJ-12、VPJ-19、VPJ-34
- **W2**（7 张）：VPJ-09、VPJ-17、VPJ-23、VPJ-26、VPJ-31、VPJ-35、VPJ-55
- **W3**（10 张）：VPJ-10、VPJ-13、VPJ-20、VPJ-24、VPJ-27、VPJ-65、VPJ-30、VPJ-36、VPJ-37、VPJ-70
- **W4**（7 张）：VPJ-21、VPJ-28、VPJ-38、VPJ-39、VPJ-41、VPJ-48、VPJ-68
- **W5**（4 张）：VPJ-29、VPJ-32、VPJ-64、VPJ-69
- **W6**（2 张）：VPJ-61、VPJ-71
- **W7**（2 张）：VPJ-40、VPJ-58
- **W8**（1 张）：VPJ-42
- **W9**（1 张）：VPJ-43
- **W10**（1 张）：VPJ-44
- **W11**（2 张）：VPJ-45、VPJ-47

波次最深的三张是整链收口：VPJ-44 #244（W10）、VPJ-45 #245（W11）、VPJ-47 #247（W11）。它们不是可以提前「做完」的任务，而是前面所有票的真实证据到齐后才可能通过验收。
