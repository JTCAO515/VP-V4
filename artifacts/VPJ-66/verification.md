# VPJ-66 离线准备验证

日期2026-09-09。Issue #263。基于已合并RPC修复的main `6307d79d7e33785395d533cd381e32a26f080c01`，隔离分支 `codex/harness-offline-seeds`。

交付：现有pnpm evals自动运行两条合成种子，生成JSON与可读摘要；12场景及8开发/4holdout规格；独立固定oracle与失败步骤；fixture/in-memory/live接缝清单。实现与边界见 docs/harness/OFFLINE-SEEDS.md。未新增框架、依赖、网络或数据库调用。

结果：H01/H02正常PASS；不支持的地址、全拒答、晚餐移动、提前写入四次命名注入均FAIL并在预期步骤定位。另有评分器反例覆盖共同错误、sidecar、准确revision/base、拒绝、路线口径、重载与范围。10个剩余fixture案例NOT_RUN，12个staging案例全部NOT_RUN。

独立审阅最初发现共同错误循环自证：候选/最终/重载同时错误改变下午时间仍可能PASS。已加入不由applyPatch生成的完整expectedFinal常量及17:00–19:00重叠反例；审阅者独立复现确认修复，Critical0/Important0。最终提交HEAD仍需独立复审与必需CI。

本地验证：pnpm docs:check、git diff --check；unit38/38、contract161/161、evals23/23，均零skip；pnpm check通过（lint/typecheck/build，基础22/22）。最终报告逐次耗时字段修改后再跑受影响eval/typecheck/docs。精确命令、退出码与日志见commands.jsonl。

首次默认unit37通过/1失败：治理测试会调用integration，而机器现有项目ID对应历史Supabase本地栈，自动探测导致子套件失败。没有改历史栈、配置或测试断言；使用仅暴露node/pnpm/git与系统工具、不含Supabase CLI的临时PATH进行离线重跑，unit38/38通过。治理测试按既有设计检查integration的incomplete结果；这不等于数据库集成通过。首次失败日志保留。

CI保留全部既有门，包括浏览器、integration/security的明确运行/skip结果。根据ADR-0024，本票无UI、数据库或原生行为变更，不重复本地无关浏览器/数据库/设备验收；相应真实服务能力仍NOT_RUN。copy/claim边界人工检查：合成地址、路线、确认与重载均标fixture；无实测少走路/生产身份/持久化声明。

必要相邻文档：同步docs/handoff.json并生成HANDOFF.md/CONTEXT.md，因为共享下一步从纯规划推进到离线准备；保留RPC远端授权阻塞及其他既有证据，不改任务图或业务契约。

Issue只可在准确HEAD审阅和必需CI通过、代码合并、合并结果再验证之后按其离线准备范围关闭。当前文件不证明PR已经合并。回滚移除本票新增eval/report/doc接入，不触碰既有测试或真实数据。

已跟踪日志统一去除CR行尾、行尾空白和多余EOF空行，不改测试内容；最终diff门使用git diff --check 6307d79...HEAD检查整个提交范围，不以工作区无差异替代。
