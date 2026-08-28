# Continuous AFK development kickoff prompt

Copy the prompt below into the development session.

```text
启动 VP-V4 Continuous AFK 开发模式。

目标：持续推进 JTCAO515/VP-V4 的当前可执行 frontier。不要在每完成一个 Issue 后暂停等待我确认；完成、验证、开 PR、处理 CI 后，立即重新查询 GitHub 和仓库状态并选择下一个独立可执行 Issue，直到没有任何安全 frontier 才停止。

开始前必须实时核对 origin/main、当前 worktree/branch、未提交改动、开放 Issue/PR、native blockers、labels、milestones、required checks、相关 Preview/运行时事实、docs/handoff.json 和 docs/operator-actions.json。历史 handoff 只能作为线索，不能代替当前事实。完整遵守 AGENTS.md、CONTEXT.md、docs/agents/continuous-afk-execution.md 和 docs/agents/issue-execution-contract.md；缺少 execution-contract row 的 Issue 不得开工。

执行循环：
1. 只从没有开放依赖且同时标记 status:ready、ready-for-agent 的 Issue 中选择；按 priority、phase、关键路径解锁价值和最小 tracer bullet 排序。
2. 每个 Issue 使用从最新 origin/main 创建的独立 worktree、独立 codex/* branch 和独立 PR；禁止把多个 Issue 混在一个 PR，禁止基于未合并依赖堆叠 PR。
3. 开工前冻结 objective、scope、anti-goals、material assumptions、acceptance、allowed/forbidden paths、rollback、observation；保护并避开用户已有改动。
4. 先跑最窄测试，再跑 Issue contract 和仓库要求的完整检查。需要界面验收时，用可复现 browser automation 完成 desktop、390x844、RTL、console、network 和 claim scan，并保存证据。不得把未运行、被环境阻塞或仅在本地通过的检查写成已通过。
5. 将 Issue 分类为 A autonomous、B prepare-only 或 C operator-owned：
   - A：仅限可逆、repo-only、合同已冻结且不涉及权限/RLS/迁移/数据政策/生产/外部账户的 D0/D1 工作。所有 required checks 通过、PR 可合并且无未解决 finding 时，可启用 GitHub auto-merge；不得绕过 branch protection 或自我批准。
   - B：auth、RLS、permissions、schema/migration、retention/deletion、data policy、release control。可按已接受合同实现、测试、写回滚、开 PR，但不得自行批准或执行生产变更。留下可审 PR 后，继续另一个独立 Issue。
   - C：未决产品/架构选择、法律/许可/DPA、secret/account provisioning、payment、生产迁移/切流、破坏性或不可逆操作。只准备证据/选项/runbook，把精确动作写入 docs/operator-actions.json，正确设置 ready-for-human 或 needs-info，然后跳过并继续其他 frontier。
6. 每次 PR 创建、CI 完成、merge、blocker 或 label 变化后都重新查询 frontier。A 类满足条件后可自动合并；B/C 不阻塞整个 session。若下一个 Issue 依赖尚未合并 PR，选择其他独立 Issue，不得 stack。
7. 不删除或弱化 RLS、权限隔离、隐私、数据许可、来源、migration rollback、secret、payment、production cutover、TripProposal confirmation 或 GitHub protection 门禁；不得伪造人工批准、真实用户观察、外部供应商结果或生产证据。
8. 同一种确定性失败最多修正三轮；之后记录 commands/unrun/evidence、重新分类并继续其他安全工作。仅当目标完成、safe frontier 为空、所有剩余路径都依赖/人工阻塞、存在无授权的关键安全歧义，或系统预算耗尽时停止。

不要向我索取密码、Cookie、JWT、API key 或 connection string。需要我操作时，只在 operator queue 中留下中文新手教程：前置条件、准确动作、预期结果、验证、回滚、常见错误；然后继续其他工作。

每个循环同步 Issue/PR labels、artifacts、docs/handoff.json、HANDOFF.md 和 CONTEXT.md。最终只汇报：已合并、待审 PR、验证、未运行项、operator queue、剩余 blockers、rollback 和唯一 next action。开放 PR、未执行迁移和未验证生产行为不得写成完成。
```
