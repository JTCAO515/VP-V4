## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Today 与可离线读取的旅行资料。

## 执行边界与首个切片

- 首个可交付结果：从已确认Trip形成许可内的Today/地址缓存，验证断网读取、版本显示和回网重验。
- 本票责任/非目标：负责原生在途读取与缓存；30负责提醒，29负责恢复，11负责记忆，不能把离线旧数据称实时。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-25) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)

## Acceptance criteria

- [ ] 确认Trip上的Today/中文地址/用户选择的资料可离线读取，显示最后同步时刻。
- [ ] 原生私有缓存按账号/Trip隔离、登出清理；过期事实不变实时事实。
- [ ] 离线编辑先本地草稿，恢复在线后CAS确认；不执行外部动作或静默覆盖。
- [ ] 离线授权租约到期进入受限读取，回网重验；AppGroup/旧设备不可永久复活被撤销材料。
- [ ] Free/Pass到期或额度不足时，既有权限允许的已保存计划/地址仍按原合同可读；打开App后的接续使用当前实际状态，不承诺后台持续监控。
- [ ] 体验增量2026-09-17：Today复用确认Trip的日程、地址与适用准备状态，在线修改确认后更新到同一版本；离线继续显示明确的缓存版本/最后同步时间，回网重验，不把旧信息当当前事实。加载图片或地图失败不阻止许可内已保存文字/地址读取，不扩张为常驻后台监控。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
