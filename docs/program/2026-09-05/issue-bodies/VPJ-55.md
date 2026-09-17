## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

限定文件导入与系统分享、登录回跳衔接。

## 执行边界与首个切片

- 首个可交付结果：在已验单图材料链上增加一类限定PDF或一个Files/Share入口，校正、去重并接回登录前的原任务。
- 本票责任/非目标：负责文件和系统入口；12负责单图解析基础，24负责订单语义；暂不建设多人协作邀请或任意文档平台。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-55) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)

## Acceptance criteria

- [ ] Share Extension/Files沿已验材料通道投递，支持一类限定页数PDF并保持关键字段校正。
- [ ] Universal Link/邀请/登录回跳/未安装回退/链接过期都有明确路径，安装后不承诺系统无法保证的自动传递。
- [ ] AppGroup按账号命名空间、TTL/退出/删除清理；恶意文件/重复导入不覆盖Trip。
- [ ] 体验增量2026-09-17：限定PDF沿#201已验校正与去重合同，将原固定活动/订单保留并展示新增/重复/冲突，不因导入重生成全程；超出页数/格式时保留原文件及Trip并给明确退路，不静默截断。已有行程、账号回跳与用户原意一致，不扩张为任意Word/Excel解析。
- [ ] 邀请/Universal Link在本票仅验已有身份与权限下的入口和原任务回跳，不建立多人Trip协作、跨账号授权或新的分享产品。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
