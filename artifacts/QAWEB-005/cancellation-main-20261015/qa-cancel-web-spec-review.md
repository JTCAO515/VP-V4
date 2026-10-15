固定范围审查发现 **3 项 P2**，均位于 `components/qa-agent/QaAgentWorkspace.tsx`（行号对应 `b3166681`）：

1. **P2 · 287–288：锁不可用时可重复 POST。**  
   `else await act()` 没有互斥保障。两个标签页可同时 GET 到 pending，各自写入独立 sessionStorage，并在收到对方广播前发送 POST。应在无法可靠互斥时阻止 POST、保留原 ID 回读；补充禁用 `navigator.locks`、同步释放两个 GET 的竞争用例。

2. **P2 · 305–314：广播监听器捕获首次渲染的 `readStop`。**  
   effect 仅依赖 `actorId`，捕获的 `selected` 始终为初始 `null`，因此第 310 行调用直接返回。另一标签页若已读取过 pending，`stopReads` 又阻止自动重读，会持续显示取消未确认，直到手动检查。应使用当前作用域的回调，并覆盖“仅一页确认停止，另一页接收广播”的场景。

3. **P2 · 270–282（关联 112–115）：401 未失效在途取消操作。**  
   401 分支清空 journal、显示登录入口，却没有 abort 或推进 epoch。若并发 history GET 返回 401，而取消预检随后返回 pending，`active()` 仍成立，会重新写入旧 actor 的 intent 并发送 POST。应在处理 401 时同步失效当前作用域；补充“预检挂起 → history 401 → 释放预检”的断言，确保 journal 不重建、POST 不发送。

本次仅静态审查指定固定 diff／源码；未修改文件、运行测试或干预构建。上述结论不扩展为后端、目标环境或 provider 验收结论。