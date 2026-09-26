# Context

Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).
This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.

Program: [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · Source updated: 2026-09-26

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

阶段：2026-09-26 JT将交付目标提升为 App Store 正式上架并可收费，保留中英原生 iOS 完整 Plan→Ready→Travel 与轻量同 Trip Web。按现有 Issue 收敛六个交付包：A 正式服务与安装、B 完整旅程、C 可收费闭环、D 用户保护与运营、E 同一发布候选联合验收、F 商店正式收费。旧“只到 TestFlight 且一律暂停 S3–S5”调度已被本决定取代；首轮两线优先 #503 官方 Sandbox 交易到 grant 与 #243 独立 Production 实施包。首个两工作日是清障窗口，不是全部完成承诺。实际目标环境、整票验收与正式发行分开判断。

## 源记录状态（执行前核对 GitHub）

2026-09-26 GitHub 只读核对：main cfaa5b187df4f361f94f92637e0a205041ddd023；#545 已合并，开放 PR #530（Today，最终 SHA 4560404e，适用 CI 成功，中文地址/离线/目标环境仍缺）。#539 已记录签名上传、内部组分发成功，但 TestFlight 0.1.0 (20260924.163820) 安装 FAIL，启动与安装后数据 UNRUN；Apple 支持表单一次 Send 后未获案例 ID，送达 UNKNOWN。#544 仅 ECS/隔离合成准备，正式 worker/真实 Provider 未启用；Production 与 Staging 仍共用 Supabase 项目，独立 Production #243 未完成。#503 商品 catalog 的真实 StoreKit ID 当前为 null，正式 grant 链未验。此处沿用对应 PR/Issue 的目标环境记录，不声称本次重跑 Apple、Supabase、ECS 或模型。

## 下一动作

双线已于2026-09-26开工：#503 复用已合并 catalog，接 StoreKit→服务端验证/账号绑定→幂等 grant→原生/Web 同源读取，官方 Sandbox 与本地 StoreKit 分栏；#243 交付独立 Production 配置/迁移/备份回退包，先解原生 Production 路由和 worker Staging 绑定的代码门，再分步处理实际资源与切流。主协调审 #530 最终 diff/当前 base 与 CI，合格后收尾，中文地址/离线缺口留在完整旅程包。#195 S1 普通会话 owner/RLS 精确匹配、worker 真运行和 #237 TestFlight 安装失败继续由原任务处理；Apple 工单送达先查回执，不盲重发。账户商品、Paid Apps Agreement、地区/商店材料提前准备，真实资金/正式发布依据具体对象与前后条件决策。稳定候选集中一次联合 RC 窗口，复用同 SHA/同环境有效检查与证据，保留必需 CI、12 场景及未运行项。

## 开工入口

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [docs/program/2026-09-05/TEAM-PLAN-2026-09-17.md](docs/program/2026-09-05/TEAM-PLAN-2026-09-17.md)
- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。
- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。
- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。
