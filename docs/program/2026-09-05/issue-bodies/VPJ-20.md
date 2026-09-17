## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Explore 浏览内容并保存、问 VP、加入 Trip。

## 执行边界与首个切片

- 首个可交付结果：让一条当前有资格的Explore内容完成浏览→Save→Ask→经确认Add到现有Trip的用户行为。
- 本票责任/非目标：负责发现与消费界面；#365是本票地图/路线集成切片，地点身份归19、知识发布归15，不重建两套收藏/Trip。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-20) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 验收依赖（不自动转为 blocked）

- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)

## Acceptance criteria

- [ ] 中英官方/编辑内容可主动浏览、搜索和收藏；说明覆盖与来源。
- [ ] Save/Ask/Add使用同一实体ID，Add走Proposal/Confirm；地点没找到可发起消歧/研究。
- [ ] 无内容、已下架、过期图片/许可、分页/弱网状态可用，不用静态假数据冒充全国。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#168
