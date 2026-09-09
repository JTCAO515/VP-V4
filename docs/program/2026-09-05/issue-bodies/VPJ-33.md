## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Journey Pass 商品、权益和定价实验配置。

以Free+30天非自动续费Journey Pass为试点：$19.99参考价，$14.99只单变量实验；地区价来自StoreKit。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-33) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Scope 与接口

- `docs/commercial/**`
- `docs/runbooks/**`
- `lib/server/entitlements/**`
- `tests/**/entitlements/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 以Free+30天非自动续费Journey Pass为试点：$19.99参考价，$14.99只单变量实验；地区价来自StoreKit。
- [ ] 明确现行购买开始/提前续买/退款/恢复/到期，以及获准的新服务任务周期与Free窗口口径；新容量未决定前不写入在售商品，无unlimited或人工包含承诺。
- [ ] JT填写store SKU/合同主体/税费及实际价格；未上线商品不能收私人款。
- [ ] 每笔交易独立720h grant，绑定已批准的计量策略版本和容量；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号滚动窗口不因购买/恢复而重置；乱序交易按可信购买时间对账。容量与窗口数值须按Q37新口径决定，历史300Ask/60Ask只作兼容研究记录，不是新服务任务的实施门。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的既有试点上限保留并核成本。
- [ ] 权益表回写Q36：Free与Pass共同具有获准的基础显式跨Trip偏好；Q37采用完整服务任务方向，原Ask数值不得换名沿用，partial/改稿/TTL/跨期及新容量先决策再公布。
- [ ] Q38购买后激活、到达起算、eSIM和支付渠道保持待研究；本轮不改变现行购买/生效/到期规则、不增加商品承诺。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-33/verification.md`
- `artifacts/VPJ-33/unrun.md`
- `artifacts/VPJ-33/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: decision。预估专注工作2日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：外部审批/账号/真机/网络等待另计

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-33.md`
- `docs/contracts/service-task-metering.md`
- `docs/contracts/basic-preferences-cross-trip.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
