## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：少走路且保留已确认晚餐的局部改稿闭环。

用户对当前Trip要求第二天少走路、不动已确认晚餐；沿现有候选→可见diff→精确版本确认→原子Patch→重载路径验收，不另建writer。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-68) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。

## Blocked by

- [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264)
- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)

## Scope 与接口

- `lib/server/trip/**`
- `lib/server/constraints/**`
- `lib/server/context/**`
- `lib/server/memory/**`
- `app/api/trips/**`
- `components/canvas/**`
- `ios/VisePanda/**`
- `evals/harness/**`
- `tests/**/harness/**`
- `docs/harness/**`
- `artifacts/VPJ-68/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 用户对当前Trip要求第二天少走路、不动已确认晚餐；沿现有候选→可见diff→精确版本确认→原子Patch→重载路径验收，不另建writer。
- [ ] 按同日期/时区、出行模式、来源版本和口径比较步行距离或步行时长，运行前选择主要步行指标并要求其严格减少，另一指标辅助披露，不能删必保留项目换成功；基础数据归VPJ-65/19。证据不足只算待核候选，不算已验证少走路。
- [ ] 晚餐item ID、地点、日期/时区、起止时间、确认状态及回执在候选/diff/最终Trip均不变；当前明确要求优先于旧偏好但不能覆盖权限与安全。
- [ ] 用户确认绑定不可变proposal revision与base Trip revision；未确认、拒绝、过期、越权/撤权以及另一客户端修改均不误写或覆盖，重复确认不重复提交。
- [ ] 按12场景规格接入约束/偏好/证据不足及确认冲突案例；原生中英结果和精简Web同Trip/diff语义一致，应用后重载与事务回执一致。
- [ ] 报告fixture与获准真实环境、测量依据及失败案例；缺路线口径或真实原子回执不可用不能关闭本票。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

## 验证与证据

- `pnpm docs:check`
- `git diff --check`
- `pnpm check`
- `pnpm test:contract`
- `pnpm test:integration`
- `pnpm test:security`
- `pnpm evals`

本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。

- `artifacts/VPJ-68/verification.md`
- `artifacts/VPJ-68/unrun.md`
- `artifacts/VPJ-68/commands.jsonl`
- `artifacts/VPJ-68/results.json`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作4日，外部等待另计；超5日必须再拆。

- 真实Trip、局部提案、可纠正上下文及计划依据由VPJ-10/11/65验收；获准测试身份/数据/路线依据必须存在。
- 受影响Web路径做桌面与390×844交互/console检查，原生做实际确认/拒绝/重载；全量设备发布门仍归原票。

观察：有界PR验证；真实环境/人工校准等待另计

## 文档与回滚

- `docs/harness/README.md`
- `docs/handoff.json`

停用本票整合入口，保留已确认Trip及手动编辑路径；不得回写撤销已发生的用户确认或改历史迁移。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
