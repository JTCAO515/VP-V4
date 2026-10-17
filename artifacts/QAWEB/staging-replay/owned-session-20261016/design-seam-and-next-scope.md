# #683 owned session / backend fence：独立合成交付

## 当前结果与根因边界

f156/PR738的5path原型及8PASS原证据完整复用，未改其代码。新增 `owned-pg-diagnostic-session.py` 与专属test，未写旧strict/parser/core/claim/window/deadline或operator私有记录。所有数据仅静态合成SQL，未接真实AGE/identity，未新capture/第三次attempt/窗口/E/费用/ProdTF。

实际Window795的首个SQLSTATE、命令和对象从未保存在可用安全记录中，当前仍UNKNOWN；本轮没有从generic/null提示倒推PermissionDenied或声称已修真实post-data权限。独立pre-postdata连接不等于实际失败caller。

本轮已在新建、nonce私有、无TCP监听的PG17 fixture证明三个明确机制：

1. proxy/客户端断连后 `pg_sleep` backend仍真实存在且active；关闭relay不是取消/停止的证明。
2. 由实际BackendKeyData绑定的PID+私有cancel key，经同server identity/epoch和backend-start确认后发送CancelRequest，再确认原backend消失，能完成有证据的停止；不使用PID-only `pg_terminate_backend`/OS backend kill。
3. 合成函数捕获query_canceled继续循环时，CancelRequest不足以停止；只对factory本次创建并持有Popen生命周期的独占postmaster发SIGQUIT，确认parent退出与目标backend PID消失。错nonce、server identity、backend lifetime、未登记/foreign capability都先拒信号，不碰其他PG。

这些是合成因果证明，不是实际数据事故原因。最终物理cases及cleanup断言见 `physical-tests-08.log` / `delivery.json`。超时与EOF竞争的初始失败保留在03日志；中间测试重命名错误也保留，最终已修。

## 身份、隐私和终止保证

- `OwnedSyntheticServer`只能创建新的0700私有目录、nonce marker600和PG17 child，没有attach现有PID/dataDir/socket的入口。客户端socket必须属于该私有root；不能借systemPG/共享实例。外部PG环境和默认passfile/servicefile不复用。
- server identity绑定pg_control_system system ID、postmaster start、dataDir/version、私有nonce及postmaster.pid=本对象持有的child PID。进程poll/wait/signal由该对象的lifecycle lock串行管理，不向传入的任意PID发终止信号。
- backend绑定来自实际PG `K`帧，再核PID/backend_start/databaseOID/roleOID与server identity；此绑定证明会话生命周期，不证明SECURITY DEFINER内部effective caller权限；绑定注册摘要包含私有cancel capability，篡改即拒绝。secret封装为不直接JSON序列化的opaque对象、repr脱敏，永不输出或持久化。
- typed诊断仍复用f156，只从ErrorResponse.C取公开allowlist；消息伪42501仍不会覆盖实际P0001，command/object未知保持未知，query token仍会话HMAC，不输出SQL/名字/rows/config/凭据。
- 数据命令用既有Budget的UTC/monotonic双上界，超时后仅进行metadata确认/必要自有fence。保留proxy-only UNKNOWN与fence后事实，不把EOF当成功；身份冲突/控制查询失败/无法确认backend退出则UNKNOWN、不能宣告cleanup或安全继续。
- 抗取消fallback会停止本factory的整个独占server，因此同一owner只允许一个诊断session。不得把这种host fixture能力用于真实或不可信归档；实际restore仍必须保留原容器隔离、nonce/immutableID fence与授权边界。
- fixture server stdout/stderr丢弃，无raw SQL日志；目录700/文件600。每例结束验证server停止、backend消失、私有dataDir移除；unknown不删可能仍active的目录。未借既有Docker17containers/f4/Stage/PG16。

协议依据：[PG17 BackendKeyData/CancelRequest](https://www.postgresql.org/docs/17/protocol-message-formats.html)及[错误字段](https://www.postgresql.org/docs/17/protocol-error-fields.html)；取消发送不是完成确认，必须读回停止事实。

## 现存容器依赖事实（不是实际数据操作）

本轮只创建过自己的空nonce/no-network/no-published-port/no-mount能力probe并清理。原缓存17.6.155镜像无Python/Node/compiler/socat，BusyBox nc没有Unix socket模式；不安装、不pull、不借别的镜像替代。新physical测试使用既有PG17工具创建全新私有实例，不连接系统或共享PG。

因此：host上的独立session/fence已实际可运行；当前原17.6容器内typed sidecar与完整受保护restore集成仍UNRUN。不能把host fixture当成managed Auth/Storage/vault/ownerACL或真实87兼容证明。

## 原shared core精确接缝提案——尚未修改，等Main窄域协调

| 位置 | Before | 拟议patch | After必须证明 |
| --- | --- | --- | --- |
| `controlled-snapshot-restore.py::restore_bundle/private_pipeline`，仅post-data新diagnostic路径 | 原pg_restore直接连本copy socket，安全stderr提示 | 由caller传入已核nonce/immutableID/server-epoch的session capability，typed observer保持同一连接/SQL/role；回传安全typed记录及backendFence | 旧入口/SQL/role语义不变；typed record不是旧stderr猜测；实际command/session与PID绑定 |
| `diagnostic-window-deadline.py::Budget`的受控cleanup调用处（仅必要相邻hunk） | host子进程取消后由原owned-container fence收尾 | 将observer/client/backend fence纳入同一个绝对deadline及cleanup预算；UNKNOWN保active/consumed/result；整copy仍用已核containerID最终围栏 | in-flight取消与server继续运行负例；无PID-only kill、不影响其他copy；未知不解锁 |
| 新独立容器capability adapter（本轮未实现） | 当前新factory只接自己创建的synthetic hostPG17 | 仅接受caller本次创建的verified container capability，不接受任意DSN/PID；解决已证缺少runtime/Unix-stdio能力，方案另固定review | nohostport/mount/network外联、原image/source约束、无新增secret持久化；不把host fallback直接用于真实数据 |

不申请wholefile/shared写权，不改现operator入口，本轮也没有真实window可用。以上选择和精确hunk需Main协调给唯一owner后才实施；当前无需为Main停在等待，可先审这份新独立组件。

## 下一真实诊断最小可审批材料（不是执行授权）

只有在容器依赖/共享接缝和同源完整合成证据确认后，才由BestJ集中呈现新的具体诊断范围：固定code/image/原bundle/同identity；唯一新window和受控slot；只在同一owned copy的原post-data失败处增加typed observer及终止fence；保持原校验/失败/claim不可回收/绝对budget和数据销毁。需写清first-error typed字段与不可逆token输出、unknown闭锁、不可从旧safeSummary恢复的信息、以及失败后的实际停止确认。

原795两slots已永久耗尽，不复用、不第三次、不reset/延期、无任何真实解密/恢复/capture。E/targetapply/sharedDBwrite/GRANT/provider费用/ProdTF均排除。新scope是否允许、能否真实诊断以及何时执行，由BestJ/JT另行决定；当前实际根因仍UNKNOWN，#230/#683不得假闭。
