## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：核心任务发布判定与能力停用恢复验收。

使用同一选定commit/config与预冻结grader/阈值整合两条任务；选定配置可为达到门槛的原基线，仅对拟采纳候选复用VPJ-70入口扩充Trip配对。候选被拒可保留基线，不强制新增候选；完整回归与停用责任仍必需。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-71) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。

## Blocked by

- [VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266)
- [VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267)
- [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229)
- [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231)

## Scope 与接口

- `evals/harness/**`
- `tests/**/harness/**`
- `lib/server/observability/**`
- `lib/flags/**`
- `docs/acceptance/**`
- `docs/runbooks/**`
- `docs/benchmarks/**`
- `docs/harness/**`
- `artifacts/VPJ-71/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 使用同一选定commit/config与预冻结grader/阈值整合两条任务；选定配置可为达到门槛的原基线，仅对拟采纳候选复用VPJ-70入口扩充Trip配对。候选被拒可保留基线，不强制新增候选；完整回归与停用责任仍必需。
- [ ] 完整12场景按required mode实际运行，必测集无FAIL/NOT_RUN；中英/风险/正常可答分别达门槛，未运行不删除分母、全拒答不算成功，命名集硬违规0但不外推绝对可靠。
- [ ] 真实原生Ask/Trip、精简Web同Trip、持久worker、证据资格、步行量、准确确认/回执与预算/恢复证据可串联；fixture和录制回放不能替代规定真实模式。
- [ ] 接入已有Ops/flag及发布报告，复用VPJ-63同版本或等价受影响路径的真实境内外网络证据；路径变化需重验，不用本机/VPN假装用户网络。
- [ ] 在获准Staging演练按能力停用、恢复与部署回退，用户有可用替代，已确认Trip和删除/撤权状态不丢失；不改已应用迁移、不恢复撤销材料。
- [ ] 先验证故意失败或缺证据能阻塞判定，再提交实际结果；基线/候选变化重跑受影响集合，不拼接不同配置的通过报告。
- [ ] Harness门纳入现有发布验收资料；本票不授权生产、不自动关闭VPJ-41/42/43/45，不替代真实账号、原生设备、IAP、隐私或商店验收。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

## 验证与证据

- `pnpm docs:check`
- `git diff --check`
- `pnpm check`
- `pnpm test:unit`
- `pnpm test:contract`
- `pnpm test:integration`
- `pnpm test:security`
- `pnpm evals`



- `artifacts/VPJ-71/verification.md`
- `artifacts/VPJ-71/unrun.md`
- `artifacts/VPJ-71/commands.jsonl`
- `artifacts/VPJ-71/results.json`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作3日，外部等待另计；超5日必须再拆。

- VPJ-69/70实际验收完成，VPJ-37 Ops停用与VPJ-63真实网络证据可用；产品负责人已冻结本轮完整集合阈值。
- 获准Staging能力停用/恢复与部署回退窗口实际存在；生产开放仍需对应对象/环境/范围有效授权。

观察：有界PR验证；真实环境/人工校准等待另计

## 文档与回滚

- `docs/harness/README.md`
- `docs/handoff.json`

停用本轮候选/整合，保留可审计报告与既有安全不变量；保持Trip和删除/撤权状态，不回退已应用数据库历史。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
