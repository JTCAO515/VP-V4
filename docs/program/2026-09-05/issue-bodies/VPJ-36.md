## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

核心资料的导出删除框架与首批执行器。

## 执行边界与首个切片

- 首个可交付结果：D1：用户重新验证身份后删除一个无关联聊天的Trip，在原生看到queued到completed并回网清理对应缓存。 main已有真实隔离SQL删除证据；native UI、export、linked-chat及全数据未完成。
- 本票责任/非目标：负责核心生命周期框架与首批执行器；58验全模块竞态/恢复覆盖，38验备份恢复，不能以请求202当删除成功。 2026-09-22已确认的实施顺序：D1 → D2 → D3 → D4 → D5；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-36) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 交付核心Trip/chat/material/memory/Brief/权益引用的身份复核→异步导出/删除→回执。所有新数据模块负责挂接handler，全域验收由58承接。
- [ ] 在删除期间阻止新的相关生成/同步；重试幂等，备份保留义务与恢复后重删tombstone明确。
- [ ] 保留法定财务记录的最少字段并解释；provider无法删除的范围如实披露。
- [ ] 离线旧手机不能立即接收撤销；回网/租约到期清理可控缓存，已导出文件不可远端收回，用户说明准确。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#165
