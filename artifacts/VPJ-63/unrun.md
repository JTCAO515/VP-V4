# VPJ-63 未运行项

- **UNRUN — 普通境内网络：**当前没有经过操作员确认的境内网络来源和已授权测试账号；本机/VPN/Provider 注册地均不能替代。
- **UNRUN — 普通海外网络：**当前没有经过操作员确认的海外网络来源和已授权测试账号。
- **UNRUN — 已认证登录与 Trip：**本次未提供 Authorization header；两个入口的 401 是预期身份门禁，不是成功用户路径。
- **UNRUN — Ask→模型：**探针不提交 Ask，以免在未冻结任务、同意与预算条件下触发模型；当前 Staging 的 `/api/chat/native/v4/policy` 实测为 404，需先核对部署版本/可用 Ask 接口再安排已授权真实任务。
- **UNRUN — DB/model 分段：**HTTP 探针没有端到端追踪或 provider receipt，不能区分 API、数据库与模型内部耗时。
