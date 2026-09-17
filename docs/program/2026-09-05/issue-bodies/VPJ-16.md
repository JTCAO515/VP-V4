## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

有依据的回答、诚实部分答案与知识缺口。

## 执行边界与首个切片

- 首个可交付结果：复用已完成的直接知识回答与PR #416的MIRACL/BIPIA证据，补一条其余尚未验收的真实claim覆盖、partial或过拒答路径。
- 本票责任/非目标：本票曾在PR #416仅交付一条验收后被关票，现恢复原未完成范围；不重复07任务执行、67整合Harness或受保护76正在做的Wiki检索。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-206/hf-reuse-miracl-bipia-20260916/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-206/hf-reuse-miracl-bipia-20260916/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-16) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 结构化/完整短文baseline→claim coverage→中英回答/卡片；权限时效范围预过滤。
- [ ] required/background/coverage/conflicts并存，同一fact多证据可用，no-answer不被相关度掩盖。
- [ ] 真正knowledge gap与provider/policy/user-input/capability问题分流；不自动承诺人工。
- [ ] 有依据回答同时约束自由正文和卡片，partial保留可靠部分并指明具体缺口与可用下一步；个人偏好只能筛选解释，不当外部事实；完整证据下全拒答作为失败反例。
- [ ] HF复用：借MIRACL/BIPIA方法分别诊断检索、无答案与注入，保持请求级资格在召回及模型外发前执行、展示前重验；历史百科/旅行基准不当实时知识，相关高分不推翻时效、反证与许可。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
