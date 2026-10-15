发现 **2 项 P2**，行号均对应 `b3166681`：

- **P2 — 锁不可用时可能重复取消 POST**  
  `components/qa-agent/QaAgentWorkspace.tsx:287–288`：缺少 `navigator.locks` 时直接执行 `act()`。两标签可同时完成 `pending/not_observed` GET，在广播到达前分别写入各自的 sessionStorage 并 POST。广播不能提供互斥，违反锁不可用时不得重复 POST 的约束。应在无法可靠协调时保留原 ID GET 查询，并阻止该 POST 路径。

- **P2 — 非标准 401 JSON 绕过 actor 清理**  
  `components/qa-agent/api.ts:70–73`：HTTP 401 若返回可解析但不符合取消错误 DTO 的 JSON，会经 `invalid()` 转成 `ApiError(502)`。`QaAgentWorkspace.tsx:261,297` 因而不会调用 401 清理分支，原消息和取消 journal 会继续保留。应保留 HTTP 401 的身份失效语义，执行 actor/journal 清理，同时继续拒绝将响应解释为取消回执。

仅静态检查指定固定提交与文件；未编辑、运行测试、访问网络或干扰独立构建。未复验 owner 提供的 PASS 证据。