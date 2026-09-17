# VPJ-63 登录、Ask 与 Trip 网络探针

`scripts/diagnostics/vpj-63-network-probe.mjs` 在一个指定的真实网络来源上分别记录：DNS、已认证 native identity session、Trip 列表和 Ask policy 的可达性、HTTP 状态和端到端延迟。它不保存响应正文、头部、令牌、用户输入、Trip 或模型输出。

```bash
# 授权 token 只在进程环境中短暂存在，脚本不会回显或写入报告。
VP_NETWORK_PROBE_AUTHORIZATION='Bearer …' \
  node scripts/diagnostics/vpj-63-network-probe.mjs \
  --target https://staging.go2china.space \
  --region '<network and country observed by operator>' \
  --output /absolute/path/outside-the-repository/vpj-63-report.json
```

同一已获准的测试账号必须先在该网络完成 native 登录。报告中的 `authenticated: true` 只代表运行时提供了 Authorization header；各阶段 `status: 200` 才是该条已认证 API 路径的观察。该工具不提交 Ask，因此不证明模型调用；模型提交必须按另一份预先核定、预算受控的真实任务记录。

请分别在普通境内网络和普通海外网络运行，记录网络来源、测试账号范围、Git SHA、时间、每段状态/延迟和失败的可用退路。不能以本机、VPN 出口、Provider 注册地或 DNS 成功代替这两种地域证据。不得更改生产拓扑。
