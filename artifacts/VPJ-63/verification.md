# VPJ-63 网络探针准备与本机预检

**版本：**本 PR 的探针工具提交，基于 2026-09-17 rebase 后的 `origin/main`
**时间：**2026-09-17T11:31:55.763Z  
**范围：**本机未分类网络、无 Authorization header、只读 HTTP 请求；没有提交 Ask、没有模型/数据库写入、没有生产拓扑变更。

## 已实现

- `vpj-63-network-probe/1` 对固定 HTTPS origin 的 DNS、native identity、Trip 和 Ask policy 入口分别记录状态与延迟。
- 工具不读取或输出响应正文、响应头、Authorization 值、用户输入、Trip 或模型输出；401/403 单列为 `unauthorized`，不误报为网络失败。

## 实际观察

| 段 | 结果 | 延迟 |
| --- | --- | --- |
| DNS | reachable；本机 resolver 返回 `198.18.0.183` | 5.62ms |
| identity | `unauthorized` / HTTP 401 | 993.04ms |
| Trip | `unauthorized` / HTTP 401 | 937.54ms |
| Ask policy | `http_error` / HTTP 404 | 739.22ms |

这只是未认证的单一本机预检。`198.18.0.0/15` 是保留的基准测试地址，不能用来推断用户地域或真实服务端 IP；没有任何地域、登录、Trip、Ask 或模型成功结论。

## 本地检查

| 检查 | 结果 |
| --- | --- |
| `node --test tests/contract/diagnostics/vpj-63-network-probe.test.mjs` | PASS，4/4 |
| `pnpm docs:check` | PASS |
| `git diff --check` | PASS |
