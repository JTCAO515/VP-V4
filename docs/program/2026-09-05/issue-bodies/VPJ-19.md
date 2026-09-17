## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

地点消歧、地图展示与路线出口。

## 执行边界与首个切片

- 首个可交付结果：沿#363的现有身份/搜索/详情/geocode继续一个未完成适配与地图同选中路径，然后在#364验路线出口。
- 本票责任/非目标：这是地点/路线能力父票，消费子票证据；不与#363/364重复实现，#366负责交通观测，#365负责Trip消费。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/contracts/place-identity.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/contracts/place-identity.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-19) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 验收依赖（不自动转为 blocked）

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208)

## Acceptance criteria

- [ ] 中文/英文/拼音同一canonical实体；providerID和内部ID分开，城市同名需要消歧。
- [ ] GCJ/WGS等坐标转换显式且不双转，地图/列表同选中对象；不从向量分数猜入口。
- [ ] 当前位置拒权/无网时可用中文地址和缓存；路线报价只按已授权观察时效呈现。
- [ ] 体验增量2026-09-17：地图、地点列表和详情沿同一Trip/day/item身份保留选中对象；休息、值机、未定用餐等时间线事件不伪装为具名POI或借附近坐标补齐。正式点位缺坐标明确显示，既有文字安排仍可读；绑定已有地点/服务的引用可核对，切换视图不改变确认版本。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
