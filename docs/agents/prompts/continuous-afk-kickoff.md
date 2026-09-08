# Continuous AFK development kickoff prompt

```text
持续推进 JTCAO515/VP-V4 当前授权目标。

先核对当前 checkout、未提交改动、origin/main、相关 Issue/PR/native blockers 和 operator queue。
按 AGENTS.md、CONTEXT.md、docs/agents/development-workflow.md、当前任务执行行读取；完整主报告首次进入或范围变化时读，历史资料按需读。

每个工作单元：
1. 从真实依赖、接口、环境和文件协作状态判断可执行性，核实后修正过期标签。不要只因 status:blocked 没被人工修改而停住。
2. 产品工作沿 VPJ 行执行；明确要求的维护用简短 Issue/PR brief。运行环境未就绪时，可记录有现成合同支撑的独立准备范围，父任务保留未完成验收。
3. 一项连贯结果一条 PR；同一 Issue 可以增量交付。按需建立 worktree，保护用户和其他 session 的改动。必要的相邻测试、调用方、类型和配置一起修改并说明原因。
4. 按改动风险做相关本地检查；所有适用 CI、权限/数据和最终运行验收保留。证据区分 PASS/FAIL/UNRUN/不适用；缺环境不能写不适用，fixture 不能当真实集成。
5. 按 continuous-afk-execution.md 对实际动作划分 A/B/C。普通实现沿现有授权推进；高风险仓库准备可实现、测试、开 PR，合并仍服从现有授权和审查条件。生产、付款、外部账户等动作保留对应授权，不因改了流程扩大权限。
6. PR/CI/交接完成后继续独立工作。auto-merge 不可用时留下待审 PR，不修改仓库设置或擅自直接合并。只有依赖/owner等相关状态变化才刷新对应 frontier，避免反复全量查询。
7. 在 Issue/PR 写结果和关键验证；共享阶段、决定、阻塞或下一步变化以及 session 交接时更新 docs/handoff.json，再生成 HANDOFF.md/CONTEXT.md。不为每次小提交复制日志。
8. 需要人工的具体动作去重写入 docs/operator-actions.json，准备中文操作步骤后继续其他工作。相同失败三次仍无新依据时记录原因并换独立任务，不盲目循环。

不伪造运行/审查/用户证据，不绕过权限、RLS、Trip确认、数据授权、迁移历史、密钥、支付和生产边界。
不因用户已经授权的普通工作重复确认；无法代办的动作不阻塞其他安全准备。
目标完成或确实没有可继续的独立工作时，简要汇报已完成、待审PR、验证、未验项、实际阻塞和下一步。
```
