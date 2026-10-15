结论：**Standards 0；Spec 0。** 指定 diff 未发现新增回归或实际剩余问题，四项 P2 均已解决。以下行号均对应 `a44f1de`：

- **无锁双 Tab POST 竞态**：`QaAgentWorkspace.tsx:274–276,304,351–354`；移除无锁提交路径，保留原 ID 状态 GET。
- **异常 401 JSON 丢失鉴权清理**：`api.ts:67–70`；解析前保留 401/403，错误体不被采信为 receipt 或 `not_submitted` ACK。
- **Broadcast 闭包捕获初始空 selection**：`QaAgentWorkspace.tsx:319–331`；通过当前 callback ref 读取所选 Session。POST 完成广播仅触发权威 GET，不直接确认停止。
- **history 401 后 held preflight 继续写 journal/POST**：`QaAgentWorkspace.tsx:112–122,282–299`；同步撤销 mounted、abort、推进 epoch 并清空投影；迟到回调与后续广播均受阻。

actor/Session/原 requestId 边界、闭合 `qa-cancellation/1`、原 receipt 权威、unknown 不自动 POST、消息身份保留均未见放宽；React effect/ref/listener 生命周期未见新增问题，未扩大范围或削弱门禁。

本轮仅静态只读审查，未运行测试。Owner 所报 PASS 和初始 timing FAIL 保持原证据性质；不代表真实 GoTrue、target 或 provider 验收。