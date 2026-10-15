固定范围 `958e4a9…a44f1de`：**Standards 0；Spec 0。四个 P2 均已解决，未发现本次修复新增的实际问题。**

- **无锁双标签竞态**：`QaAgentWorkspace.tsx:275–276` 无 `navigator.locks.request` 时只读原 ID，直接返回；不会进入停止 POST。
- **畸形 401 丢失认证清理**：`api.ts:70` 在 JSON 解码前保留 401/403，ACK 固定为 `unknown`，不信任错误体。401 进入清理，移除私有投影。
- **Broadcast 捕获初始空 selection**：`QaAgentWorkspace.tsx:319、328` 使用当前 reader；POST 完成后的提示（`:299`）促使同 actor、当前 Session 的 peer 查询 canonical GET。广播本身不提供停止结果权威。
- **history401 后 held preflight 复活 journal／POST**：`QaAgentWorkspace.tsx:116–122` 同步关闭 mounted、abort、推进 epoch 并清空投影；held preflight 返回后在 `:288` 被拦截。迟到结果受 token／signal 检查约束，401 后广播被 `:325` 拦截，不能重建 journal。

`qa-cancellation/1` 的闭集和原 ID 收据校验保持；未知结果不自动 POST。取消的 `not_submitted` 仅释放取消 intent（`:310–316`），保留原 message journal；取消收据本身不确认消息 admission。

仅静态审查指定提交与测试 diff；未运行测试。Owner 所报 PASS、保留的 timing FAIL 及既有后端审查作为提供的证据复用，未独立复验；不构成真实 GoTrue、target 或 provider 验收。