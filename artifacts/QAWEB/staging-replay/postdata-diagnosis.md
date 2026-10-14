# post-data 权限拒绝：本地诊断结果，实际根因仍 UNKNOWN

Main 的真实 retry-1 已通过 ICU bootstrap，随后 schema post-data 权限拒绝并 cleanupPASS；没有开始80 replay，owner/ACL/counts等最终验证未到达，不报告完整恢复PASS。初次和retry-1消费标记仍保留。本owner未接管实际I/O、读取cipher/key/用户行或发起retry-2、新UUID、新窗口。约束和30min余时门禁不变。

本轮只读 Main 的 actual-restore-safe-role-profile 与实际失败result，以及已提交历史安全metadata。真实5角色flags不能还原配置值、membership和失败发生时的 effective caller；不猜 config_sha256、不暴力枚举配置值。现有generic失败result没有保留 offending TOC/对象类别/SQLSTATE，不能据此选择live GRANT、superuser升级、跳过ACL或错误抑制。

## 已实际运行的反馈实验

`postdata-permission-probe.py --synthetic-only`，固定同image、唯一自有no-network/no-port/no-mount PG。

- fake Auth/storage/Realtime角色按已知flag建模，supabase_admin superuser；Auth/schema/table owner、defaultACL和DDL watch函数/trigger。拥有superuser caller时 pre/post-data均成功。故仅这些已知角色flags或普通defaultACL不足以复现实际失败。
- 原“事件trigger先于函数ACL导致restore失败”猜测没有复现；verbose证实函数ACL在pre-data，而eventtrigger在post-data。probe01/02的FAIL是该猜测被证伪，保留原结果；仅移除了纯synthetic原SQL文本。
- 明确改变自有负例的 pg_restore effective role为postgres（实际执行路径未采用该flag），同样schema post-data报permission denied。诊断显示TOC CONSTRAINT、permissionObjectClass=SCHEMA、operation=ALTER TABLE；未输出对象名/SQL。该负例验证诊断loop，不证明真实caller被降权或真实offending object相同。

`postdata-permission-probe-04.json` 记录成功的诊断负例和双copy清理。真实问题的正确最小复现尚未建立；不给假root cause或未经证据的修复。

## 最小安全诊断候选

新增 safe-restore-diagnostics.py，通过 snapshot adapter 私有import模块临时替换pipeline，再在finally恢复原factory。strict文件不动。过程、超时、失败、producer完整消费/SIGPIPE规则及cleanup沿原实现；只为pg_restore添加verbose，stderr仍只在内存解析，不打印/保存原文。

失败仅返回固定enum category/objectClass/permissionObjectClass/operation/phase与数字TOC位置；SQLSTATE只在实际错误包含该字段时提取，否则null，不按“permission denied”猜42501。unknown对象/语句返回null；不返回SQL、stderr、对象名、角色名、context/detail/hint或用户值。既有拒绝与失败保持失败，不自动更换角色、忽略错误或继续replay。

4项安全parser/真实子进程测试覆盖秘密/对象名字剔除、prefix SQLSTATE、unknown、child失败和成功stdout保持；另复用/补验25项已有权限/locale/one-time gates，总29项PASS。`owned-icu-diagnostics-proof-01.json` 在同真正en-US/153.121 ICU完整假数据恢复+80+10gates+cleanupPASS，验证添加诊断未改变成功路径。原源/strict/权限及E不动。

## 下一步证据边界

稳定候选给Main formal delta review。既有实际失败的TOC/error已被原pipeline丢弃，无法从role profile补造。确认实际原因需要真实失败对象类别/TOC与当时caller权限上下文的安全证据；不由本owner重新解密或重建真实copy去取。当前新增诊断不是实际permission repair，不构成再次尝试、新window或无限copy授权。Main集中决定合法证据取得与后续修复；在正确源复现/修复证明之前继续STOP actual attempts。

分区、ACL/owner行为参照 [PG17 pg_restore官方文档](https://www.postgresql.org/docs/17/app-pgrestore.html)，物理证明以本轮自有fixture为准，不用文档或fixture替代真实恢复验收。


## 41c7fc1d parser 独立审阅返修

旧全stderr搜索SQLSTATE/关键词/TOC会接收用户SQL/DETAIL/对象名内的伪header，并被verbose成功进度污染分类。最终oracle直接载入Git41c7fc1d原bytes运行：10项测试中15个预期失败断言；新parser同oracle全PASS。失败日志和新PASS日志保留。

现在仅接受首个合格pg_restore query错误头的首字段，并仅允许固定公开SQLSTATE集合；无实际字段/unknown token为null。不重新扫描SQL、DETAIL、CONTEXT、名字、progress或后续伪header。类别只由该错误头的标准消息模板/公开state决定，绝不搜整个stderr关键词。TOC须来自fatal头前紧邻的固定PROCESSING TOC/单一entry框架；无可靠框架或多行/歧义名字为null。operation无法从该纯stderr接口独立确认，统一null，不从Command was提取。可信version格式的client错误仍保留原unsupported archive分类。

只变parser和focusedtests；pipeline/caller/timeout/cleanup/strict文件/marker/窗口不变。复用同源完整假数据成功证据，不重跑80或再次实际尝试。最新hash/验证见diagnostics-header-repair-delivery.json；实际权限根因仍UNKNOWN。
