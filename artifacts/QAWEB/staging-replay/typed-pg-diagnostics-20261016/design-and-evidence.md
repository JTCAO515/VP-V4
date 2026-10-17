# 首个失败的 typed PG 诊断：独立合成原型，未接真实恢复

## 当前实际事件能够说明什么

依据 Main 已提供的终态脱敏事实：Window7957890d 两个 slot 已耗尽，attempt2 在 schema post-data 失败，category=LOCAL_RESTORE_CONSUMER_FAILED，SQLSTATE/object/operation/TOC 均 null，cleanupPASS。不能由该结果确认实际权限拒绝、首个失败对象/命令或 pg_restore 的中途 caller；独立 pre-postdata 连接的 bootstrap/superuser=true 不等于失败 SQL 的 effective/SecurityDefiner caller。

源码原因可以精确界定，但不能倒推出实际 predicate：`safe-restore-diagnostics.error_frame` 对多/嵌入框架、metadata续行、未知格式等保守拒归因；即使单帧，message也可能不匹配允许提示。`pipeline` 只保留安全枚举，原 stderr 字节没有持久化；stderr API本身也不提供可证明来源的typed SQLSTATE。容器已清理，现有summary没有足以逆推出原错误的信息。**实际首因仍UNKNOWN，不能从null选择GRANT、跳过owner/ACL或盲重跑。** 本轮未尝试读旧AGE/identity、Docker内部FS或恢复已清理日志。

## 已实现的新独立 helper

`typed-pg-diagnostic-proxy.py` 是无operator CLI的标准库原型，仅用于本次自有合成fixture；旧strict/parser/core/deadline/window/claim全部未改。

- 在两个当前用户拥有的0700目录之间透明转发AF_UNIX PostgreSQL protocol3，socket0600；不使用TCP、DSN、外部账号或实际服务。SSL/GSS/不支持startup failclosed。
- 只从 backend ErrorResponse `E` 的 `C` 字段读取协议SQLSTATE，不解析人类消息 `M`/DETAIL/CONTEXT/名字/SQL，NOTICE和DataRow中的伪错误头无效。公开固定集合以外code统一null，避免用户自定义五字符code泄漏。
- 只保留第一个完整错误；不输出原SQL/对象名/用户值/原stderr。commandClass/objectClass明确UNKNOWN，不把RAISE或SQL字串当对象事实，也不因42501就断言某条ACL需要修复。
- simple Query使用会话随机key的HMAC token和unit序号；key不导出/不落盘、结束释放引用。token仅定位同一连接的一条Query消息/批次，不承诺精确statement/TOC映射，也不支持跨会话比对。不是可离线猜测的裸SQL hash。
- 不拆SQL、不改SQL、不逐条重连，保留原连接/会话语义；extended Parse/Bind/Execute不伪装为已关联simple Query。
- timeout仅证明relay socket关闭，**不证明backend query已停止**。结果明确UNKNOWN_REQUIRES_CALLER_OWNED_SERVER_FENCE。本fixture另以自己Popen PID+dataDir核验后pg_ctl immediate停止，不能将helper代替已有nonce/immutableID外层fence。

协议依据：[PG17 ErrorResponse字段](https://www.postgresql.org/docs/17/protocol-error-fields.html)明确区分C(SQLSTATE)与M/D/W等可含多行的消息字段，且对象字段也不能保证代表当前实际对象。本原型不把这些名称字段发送给模型。

## 物理合成证明

`test-typed-pg-diagnostic-proxy.py` 使用本机已有 `/opt/homebrew/opt/postgresql@17/bin`，实测server170011；不是PG16，也不是managed17.6镜像验收。独立临时PG目录/常规文件0700/0600、无TCP监听、原SQL/error不写log文件，stdout/stderr只在测试进程内处理或丢弃。只建合成row/index/本机restore-target DB，不建平台DB、应用用户或预算；未用17个既有Docker容器/f4/Stage。

8项测试PASS：

- 真正pg_restore通过proxy重放纯合成dump，expression-index函数ERRCODE=P0001、message以42501开头，收到的typed code确为P0001。
- 真正PG错误42501/42601/42P01/42P07及statement_timeout57014被正确区分；42501使用内置低权限角色的合成拒绝，没有新增app账号。
- NOTICE/DataRow/DETAIL中的伪header、未知TOKEN SQLSTATE、同一错误消息中的42501不会被误当协议字段。
- 非公开code被mask；同SQL不同会话HMAC token不同，输出不含合成secret marker或对象名。
- typed statement cancellation与proxy deadline不混为一谈；超时没有PG error时不造57014。
- fixture权限、无plaintext日志、proxy sockets关闭、自有PG PID/dataDir停止与临时目录销毁均已验证。所有资源仅合成；实际数据I/O为0。

见[物理测试日志](physical-synthetic-tests.log)和[结构化交付](delivery.json)。

## Main 若考虑未来接缝：before / proposed patch / after

**Before（保持不动）：** snapshot adapter 的post-data私有pipeline调用原 `pg_restore --exit-on-error --section=post-data`，连接本copy `/tmp/restore-socket`；stderr安全提示不是typed事实。

**Proposed patch（设计，未实施、未授权）：** 只在新的明确批准diagnostic路径、该copy的nonce/immutableID核验及同一绝对窗口budget内，启动受控proxy并把该一次pg_restore的Unix socket host改为copy内的私有proxy socket。上游仍是同一copy原socket，认证/角色/SQL不改；typed安全记录从独立通道返回。原strict/parser保留；helper进程与pg_restore共用现有deadline/取消/容器fence，不能用prototype的30秒session参数替换原窗口或清理语义。

**After必须验证：** PG17.6.155容器内Python/启动依赖与AF_UNIX行为、同连接角色语义、完整post-data成功/失败/中断、copy内外deadline、helper失联/超时仍未知并闭锁、秘密字段不落日志；定位token如何在受保护本地关联TOC而不把原SQL/名字给AI。当前container部署/actual core seam全部UNRUN，没有安装依赖、写core或开第三个actual copy。

若这些条件不能以现有环境形成安全小接缝，保持本方案为设计，不声称已解决实际恢复阻塞。任何真实复诊都需Main基于具体修复/证据重新集中处理范围与窗口；旧两slot不复活、不延时、不reset、不新capture。
