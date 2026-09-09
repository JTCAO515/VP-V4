# 未运行与适用性

- H03–H12：fixture NOT_RUN，分别映射VPJ-67/68/69；保留12例分母。
- 全部12例：requiredMode staging NOT_RUN。真实服务身份、证据检索、步行数据、Proposal确认/RPC、重载、worker与恢复均未由本票验收。
- provider、实际usage与费用、真实模型配对/人工语义校准：NOT_RUN；unknown不可写成零费用。
- iOS真机/原生界面与本地桌面/390×844 UI验收：本次没有改变UI，按ADR-0024无须重复本地UI验收；完整必需CI仍运行现有浏览器门。这不是相应产品Issue验收。
- 默认本地unit首次失败及明确离线环境重跑记录在verification.md与commands.jsonl；机器历史Supabase栈保持原样。
- 远端RPC修复追加迁移等待用户授权，原13条迁移及临时普通账号授权保留。VPJ-02仍未真实验收。
