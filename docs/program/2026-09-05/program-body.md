# VPJ-00：VisePanda 全项目统筹与交付 Program

用户已于 2026-09-05 授权重新设计整体产品、定价/订阅、代码与文档处置，并将原有全部开放 Issue 关闭后建立新队列。

## 目标

2026-09-27 JT明确授权重排repo内说明文档、ADR和既有Issue。当前采用[ADR-0027](https://github.com/JTCAO515/VP-V4/blob/main/docs/adr/ADR-0027-personal-journey-assistant.md)：重做交互层、复用领域核心；VP/Journeys/Library/Memory四Tab、全局Search、可见Memory、持续对话、后台委托与同源成果。

面向coding agent的[新计划](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md)及U0–U4是当前升级顺序；新增VPJ-77…83并修订原任务，保留实际owner、进展和未验项。旧五Tab、新产品Pass-only及固定排期由本决定定向替代。规划不代表新能力已运行或正式发布。
交付中英双语原生 iOS 的一站式陪伴 Journey Agent。规划、准备、现场翻译/讲解、用户报告变化后的恢复共享同一 Trip；Web 为可基本编辑/确认的精简 Planning Studio。酒店首发止于需求/候选解释与经验证的联盟跳转。

## 初始统筹交付（2026-09-05历史）
- 完整主报告、领域合同与 UIUX/视觉/动效规格、运行与客户交付方案。
- 当前代码复用/迁移/归档台账；保留迁移和安全证据。
- 每个新 Issue 的范围、依赖、验收、可运行命令、回滚、owner 和交接。
- 原 20 个开放 Issue 的快照及新旧责任映射，关闭原因为 superseded/not planned，而非验收通过。
- 未合并 PR #185/#186 保留审查，冲突与可采纳内容在报告中登记。

## 实施入口

2026-09-17用户授权的[Issue整理与排期](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/ISSUE-AUDIT-2026-09-17.md)为现有开放任务补充首个可交付切片、复用入口和不重复负责的范围。开放未开工任务默认`status:planned`，实际依赖不等于整票必须blocked。该次整理排除了VPJ-02/49/62/75/76；2026-09-27授权已解除该历史整理排除，仍保留实际执行归属。任务身份、阶段和依赖保留；不以关闭数量或标签判断产品完成。

当前执行入口：[main / Program README](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/README.md)，完整任务与依赖见[当前任务表](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/ISSUES.md)。
PR #253记录初始规划基线；实际调度核对当前main、原生依赖、可用接口和获准环境，不从历史基线文案推断仍未合并或已就绪。

## 完成定义
本 Program 的统筹文档交付与后续产品交付分别计量；本 Issue 只有在新路线的发布/用户观察门全部完成后才关闭。
不把研究、fixture、代码合并、TestFlight sandbox 支付或来源目录数量视为真实产品验收。

## 初始授权记录与当前边界
2026-09-05的授权用于该次旧内容归档和旧Issue替代；这段历史记录不授权重跑新的全量队列迁移。已有同对象、环境、范围的有效授权继续适用，新增生产、数据、资金或供应商动作仍需对应明确授权。
