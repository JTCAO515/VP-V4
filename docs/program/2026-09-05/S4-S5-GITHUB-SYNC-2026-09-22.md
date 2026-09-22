# S4/S5 GitHub同步记录

2026-09-22 · JT明确批准细切片与最多六线程顺序，并授权GitHub修改。远端核验：**PASS**（2026-09-22T02:38:19.793625+00:00）。

## 实际修改

- 33张S4/S5开放父票：更新首片入口并追加本票工作包、线程次序、普通交接输入和验收。原146条正式验收、已勾选项及追加历史保留。
- [Program #187](https://github.com/JTCAO515/VP-V4/issues/187)：更新六线程入口与首批子票表；领域team与已有owner保留。
- [既有#366](https://github.com/JTCAO515/VP-V4/issues/366)：沿原票接续。纠正其正文/原生关系漂移，仅移除#364原生blocked_by并保留为验收输入；不免除真实路线验收。
- 首批6张原生子Issue如下；其他细包保留在父票，不一次性发布76张工单。

| 线程 | 子票 | 父票 | 工作包 |
| --- | --- | --- | --- |
| 1 | [#503](https://github.com/JTCAO515/VP-V4/issues/503) | [#226](https://github.com/JTCAO515/VP-V4/issues/226) | Q2 · 一次官方测试购买到两端有效grant |
| 2 | [#504](https://github.com/JTCAO515/VP-V4/issues/504) | [#228](https://github.com/JTCAO515/VP-V4/issues/228) | D1 · Trip删除请求、执行与原生回执 |
| 3 | [#505](https://github.com/JTCAO515/VP-V4/issues/505) | [#213](https://github.com/JTCAO515/VP-V4/issues/213) | H3 · 按行程比较住宿区域与需求 |
| 4 | [#506](https://github.com/JTCAO515/VP-V4/issues/506) | [#215](https://github.com/JTCAO515/VP-V4/issues/215) | T1 · 确认Trip的Today与中文地址 |
| 5 | [#507](https://github.com/JTCAO515/VP-V4/issues/507) | [#201](https://github.com/JTCAO515/VP-V4/issues/201) | I1 · 单张截图接入真实同Trip确认链 |
| 6 | [#508](https://github.com/JTCAO515/VP-V4/issues/508) | [#237](https://github.com/JTCAO515/VP-V4/issues/237) | X1 · 复用现有CI形成可签名Archive |

六张新子票均为OPEN、status:planned、ready-for-agent，无原生开工依赖。该标签仅表示可推进有界实现/准备；实际Staging/Apple/provider/真机未验项仍保留，未启动开发线程。

## 保留与验证

- PASS：33张父票及Program/#366的预检、写前再读、写后正文SHA256逐一一致；原state/title/labels/assignees/milestone未改变。
- PASS：#189/#241/#202/#359/#360的正文及元数据与发布前快照一致，未改保护任务。
- PASS：既有原生依赖除#366→#364外全部保留；#268→#266/#267仍在；6张子票均无新blocked边，parent关系读回正确。
- PASS：75个新细包+复用#366，共76个工作包；146条父票验收覆盖、切片图无环、6线程序位有效。
- PASS：source-policy lint、44项既有治理/正文保留/排序测试、pnpm docs:check、git diff --check；本次源代码只改两处调度文案。
- 远端PR CI按实际范围执行；CI完成状态以当前PR为准。本记录不声称尚未发生的合并或产品验收。
- NOT APPLICABLE：本次只做规划/tracker，未执行产品功能、数据迁移、provider调用、付款、原生/真实网络或生产发布。

## 可恢复记录

- `s4-s5-publish-20260922/before.json.gz`：修改前Issue正文/元数据及原生依赖。
- `s4-s5-publish-20260922/write-receipts.json`：每次写入前后摘要、子票身份与依赖调整回执。
- `s4-s5-publish-20260922/verification.json`：全批远端读回结论。

GitHub没有跨Issue事务；本次先整批预检，再逐票写前重读。首次只读预检遇到TLS握手超时，未写父票；安全重试GET后完成。创建/PATCH/DELETE从未盲目重试。回退只按本次标记区/字段做局部撤销并保留后续历史；新票撤销用有理由的not_planned，不伪装验收完成。
