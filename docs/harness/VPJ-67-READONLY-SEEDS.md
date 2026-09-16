# VPJ-67 只读场景：H04 离线接通（补充 VPJ-66 离线基线）

Related to [#264](https://github.com/JTCAO515/VP-V4/issues/264)。VPJ-67 的直接阻塞票
[VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263)（离线12场景规格与2条种子，PR271）与
[VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)（有依据回答/证据资格，PR416）均已合并/关闭；
`docs/harness/IMPLEMENTATION-STATUS.md` 记录的更深依赖（VPJ-07 #195 持久 coordinator、真实
provider/身份/预算全链）仍未完成真实 Staging 集成。本次不声称真实只读问答验收，只把 VPJ-66
遗留的 `INTEGRATION_NOT_CONNECTED` 场景中，一个**不需要模型调用、不需要凭据、真正复用现有生产
纯函数**的场景从 NOT_RUN 推进为已接通并实际跑通的 fixture 断言。

## 本次接通：H04（歧义澄清）

`evals/harness/cases.ts` 中 H04 属于 development 分组，owner 为 VPJ-67，之前状态为
`seed: false`（NOT_RUN，reasonCode `INTEGRATION_NOT_CONNECTED`）。

真实接缝与 H01 相同：`lib/server/knowledge/claim/grounded-execution.ts` 的
`prepareGroundedExecution`（生产纯函数，未重写、未新建同名假适配器）。H04 的用户结果是
「两个不同的合成 gallery，用户未选择城市/具体地点，系统必须澄清而不是瞎猜」。这天然对应该函数
真实存在的 `claims.length === 0 → { kind: "unsupported_execution", reason:
"NO_ELIGIBLE_EVIDENCE" }` 分支：当调用方（此处是 harness，代表未来的检索/候选选择层）诚实地
无法从两个候选中选出恰好一个主题时，必须提交空 claims 数组，而不是替用户猜一个。

`evals/harness/seeds.ts` 新增 `runAmbiguitySeed`：

- 基线（`mutation: "none"`）：两个候选 gallery 存在，claims 为空数组，断言真实函数返回
  `unsupported_execution` / `NO_ELIGIBLE_EVIDENCE`，且合成 Trip 集合在调用前后一致（只读）。
- 故意故障（`mutation: "single_candidate_assumed"`）：模拟一个有缺陷的调用方擅自假定其中一个
  gallery（`synthetic-gallery-north`）并把它的真实 claim 提交上去；真实函数会正常地返回
  `execution_card`（因为这确实是一条独立有效的 claim），断言 `NO_SINGLE_SUBJECT_SELECTED`
  相应地由 PASS 翻转为 FAIL，证明该故障能被判分器检出。

`evals/harness/harness.evals.test.ts` 的接线从「按数组下标取 baseline」改为按 case ID 的映射
（`seedRunners`），这样后续继续接通其余 NOT_RUN 场景时不需要重新对齐既有 H01/H02 的下标。

## 本次不接通的原因（诚实记录，不假装完成）

- **H03（付款方式，holdout）**：技术上可以复用同一个 `prepareGroundedExecution` 纯函数（它已经
  原生支持 `payment_method` claim type），但 H03 属于 `group: "holdout"`。
  `evals/harness/harness.evals.test.ts` 现有不变量要求
  `scenarios.filter(seed).every(group === "development")`，`docs/harness/OFFLINE-SEEDS.md`
  明确「holdout 未用于提示词调优，未执行模型盲测」。本次改动虽然不涉及任何模型/提示词，但是否
  应该允许「零模型、纯确定性」的 holdout 场景绕开这条不变量是一个需要由负责该不变量的票
  （VPJ-66/VPJ-70 相关）明确决定的策略问题，不在本次改动里单方面放宽测试红线。因此 H03 保持
  `seed: false`，继续 NOT_RUN，owner 仍为 VPJ-67。
- **H07（partial：地址有效/时段过期）**：`prepareGroundedExecution` 对一批 claims 是全有全无
  语义（任何一条证据过期就整体判 `UNSUPPORTED_CLAIM`），没有生产代码负责「把仍然有效的
  claim 单独作答、把过期的单独列为 gap」这种 partial 编排。按 `docs/harness/OFFLINE-SEEDS.md`
  的既有原则（找不到真实接缝就登记原责任票，不造同名假适配器），本次不新造这段编排逻辑，
  仍标 NOT_RUN 并归 VPJ-67。
- **H08（证据矛盾）、H12（越权/注入）**：真实接缝是 `lib/server/knowledge/wiki/grounded-search.ts`
  的 `runGroundedWikiSearch`（`#206`/HF-reuse 已经用它跑过真实 GLM 调用），但完整走这条路径
  需要真实 provider 凭据（`lib/server/jobs/.local/.env` 中的 `GLM_API_KEY`），本沙箱工作树中
  不存在该文件（已确认 `test -f` 返回不存在），且策略禁止在会话中探测/伪造凭据。因此这两例继续
  NOT_RUN，归 VPJ-67，等待真实 Staging/凭据环境。

## 验证范围与限制

- `node --experimental-strip-types --test evals/harness/harness.evals.test.ts`：3/3 通过，
  含新增 H04 基线 PASS 与 H04 故意故障 FAIL（在预期 step/code 被检出）。
- `pnpm evals`（递归发现同一测试文件）同样覆盖上述断言。
- 本次改动只是 offline fixture 编排层，不是 `requiredMode: staging` 的真实集成；
  `artifacts/VPJ-66/results.json` 的 `stagingRuns` 仍为 0、`stagingNotRun` 仍为 12，
  `finalAcceptance` 仍为 `NOT_RUN`。#264 保持 open，本次不关闭任何 Issue。
- 不涉及数据库、迁移、身份、RLS、Trip 写入、凭据或供应商调用；不改变现有真实集成门。

## 回滚

回退本文件与 `evals/harness/{cases.ts,seeds.ts,harness.evals.test.ts}` 中 H04 相关的新增代码
即可完全恢复到 VPJ-66 原有 2 种子状态；不涉及运行时、数据库或供应商配置变更。
