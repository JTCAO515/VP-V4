# 后续 AI coding agent 启动说明

以下内容可以直接交给下一位coding agent。任务以GitHub当前状态为准，不依赖旧对话。

> 在 JTCAO515/VP-V4 开发 VPJ Program #187。先读 docs/program/2026-09-05/README.md、主报告、ADR-0023、issue-plan.json，再读你选中Issue的完整body/comments和EXECUTION-CONTRACT行。
>
> 先确认规划PR #253已合并；如果仍未合并，先审查这份具体基线并报告PR状态，不能从旧main按新权限/商业合同编码。合并后从当前origin/main建立独立worktree。
>
> 实时读取Issue/native blockers、现有PR和operator-action队列。无未完成依赖、无文件owner冲突、接口已冻结且没有你无法代办的外部条件时，才设置status:ready+ready-for-agent并认领。不要把后续expand任务因依赖关闭自动开启。
>
> 第一个可做的原生故事通常是 VPJ-01 #188：审计归档iOS源壳，接入main，建立中英五入口和首个Trip页面，冻结语义token并跑原生build/测试。实际可用任务仍以实时图为准；其他可独立推进路径包括Staging、数据政策、客户发现和申请入口。
>
> 一条Issue、一条branch/PR。复用当前Trip/Patch/RLS与测试；原生用bearer/session适配，不放宽Web Origin。私有数据、模型、worker、知识、Ops、IAP和外部工具按接口约束执行。
>
> 先跑验收相关快速检查，再运行本行要求的真实环境/设备检查。环境缺失可以完成允许的准备，但必须标partial/UNRUN并登记operator动作，不能靠fixture关掉真实验收Issue。
>
> 完成时记录用户结果、变更、命令/失败/skip、真实证据、回滚、下一动作，并更新handoff与相关模块文档。修改issue-plan.json后执行node scripts/vpj-program.mjs render和pnpm docs:check。普通coding任务不要运行publish/close-old等tracker重整模式。

## 查状态的命令

```bash
git fetch origin
gh pr view 253 --repo JTCAO515/VP-V4 --json state,mergedAt,mergeCommit
gh issue view 187 --repo JTCAO515/VP-V4
gh issue list --repo JTCAO515/VP-V4 --state open --limit 100
node scripts/vpj-program.mjs verify
```

## 重要约定

正式商店、生产数据库、supplier合同、付款、敏感数据授权由对应operator步骤完成；保留当前已经明确的授权，不反复询问普通实现选择。任何新Issue正文都不能覆盖真实用户授权或服务端权限。不创建假‘已经配置’回执。
