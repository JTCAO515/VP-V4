# 新 A–D 诊断窗口审批包

**用途：复用已捕获副本，诊断并验证本地恢复保护；不是正式库升级或上线回滚批准。当前尚未批准、不可执行。** 实际 operator 仅 Main。原 Go2China `dzqdzetcctkhbrhlxxgn` 与 Production 同数据，普通业务读写继续。

## 当前准备事实

- 精确已合 QA：`4abeeb41e87f2ac36f0efdb9ba94780ce0049a13`。候选包含162份迁移，原捕获 baseline75，精确缺失87，targetOnly0。每份 Git blob/hash、顺序及事务边界已核对。
- 候选 manifest SHA：`c61012425c7468d7ec67258462d70991c88a71e497f82baf73ab446fa13a4688`；当前未配置源码 code SHA：`e17f957e3a14f5011adaa863c1f561ff56d710a738d920711aeb694edccca59c`。新鲜官方 baseline/source 补件 SHA：`9428747d5e6506f98706716c0693b26ce794a6c503a018c62fdaa2a06912bb6e`。见[当前162候选证据](candidate162-delivery-20261016.json)。
- Main 已确认 FileVault ON、desktop-linux Docker29.8/API1.56 ready，缓存 PG17.6.1.155 linux/arm64 image ID 精确为 `sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`。这是运行前置就绪，不是实际恢复或 managed-extension 验收。
- Main 已只审原 metadata/receipt，核实7份旧证据私有0600、单hardlink及 claim/START/FAIL链；同一 identity 路径 SHA 为 `58aa1f73d84e1c265bf64beffe6718ebd1b981d22165ef133fbc1569816451d7`。未读取 identity 内容。新 human/identity/preserved 配置仍 None，未开新 window/slot/claim。

## 请求集中批准的 A–D 范围

| 组 | 具体动作及影响 | 限界 |
| --- | --- | --- |
| **A：复用原保全材料** | 只复用 capture `f97d05db-c706-4ce9-82d8-579cbb0b9310` 的原四份 AGE 密文、原 manifest 和同一 identity。原 manifest SHA 为 `668f0bb3a34319310a7bee2a07e514f47c11442d08cd78fe4e772856c3f61085`。验证完整性后在本机私有 FileVault 范围解密。材料包含原14 data schemas 的真实身份/会话/Trips/同意等数据，另有完整 schema/owner/ACL、无密码 globals，以及原 Realtime89账本补充。 | 不新 capture、不新 key、不扩大平台数据范围，不读取 vault secret；不向模型、外部服务或公共日志发送数据。这是旧捕获点，不作为今天上线或正式升级的回滚备份。 |
| **B：一个新的60分钟窗口** | 准备和 Main 固定审阅完成后，由 Main 协调开始一个新窗口；需直接确认该窗口无其他 planned schema/migration、role/member、ACL/policy、Realtime/extension 变更安排。普通 DML 照常。 | 不是全DML冻结或对 vendor 非计划变化的保证；不新增 live GRANT。所有尝试共用同一个绝对结束时刻，不复活旧过期窗口、不延长、不另开60分钟。 |
| **C：最多两个本地诊断副本** | 每次只建立一个自有 PG17.6.1.155 副本，无网络、端口或 mount。完成 schema/ownerACL/roles/count/ledger/sequence 恢复核验，采集安全诊断提示及独立连接 caller 布尔。只有 full restore PASS，才在同一副本完成固定87条本地演练和原全部 gates，再查询新 v3 readiness/v2 dispatch 的 catalog/ACL。结束销毁副本。 | 最多2次独立消费 slot，失败或取消也消费。每次启动至少剩30分钟，第二次仍须使用第一次相同结束时刻。第二次仅在第一次真实 FAIL、cleanupPASS、无 inflight、原因已由新证据确认、不同修复 code/source 经 Main 固定 review 和必要 tests 通过后可开始；不机械重跑。 |
| **D：保密、保留与失败围栏** | 原密文和 identity 沿原私有目录0700/文件0600保留至 **2026-10-20 23:59:59+08**。保留旧三份 consumed claims、两份 FAIL、原 START 原字节及每次新结果。 | 不清旧 marker，不伪未使用；无第三次、自动换 UUID、自动解锁或自动 retry。UNKNOWN 必须保留消费状态、active围栏和证据，待 Main 处理。 |

## 窗口、取消与 UNKNOWN 处置

同一 UTC windowEnd 与一次 monotonic 上界共同限时，取两者剩余预算的较小值；校验耗时不延长窗口，UTC 后跳也不增加运行时间。数据处理预留 **120秒清理预算**；子进程/SQL/replay 受原上限与共享剩余预算双重限制。在途等待每≤0.25秒复查，不重发命令、SQL 或 input。

取消不能只杀 Docker exec 客户端。只对本调用的 host children 和已核 nonce/owned-label 的容器处理，按观察到的不可变 container ID 停止、删除并确认消失；不借用或清理 existing stack、f4、Stage、系统 PG 或其他 owner 资源。必要自有 cleanup 可在窗口到期后继续，独立总预算60秒，不能重开数据预算。

启动请求已提交但完成未知时，暂时 absent 不能证明没有副本；即使观察并删除了同 nonce ID，未确认 launch 仍保持 UNKNOWN。foreign-label/ID冲突、daemon错误、无法确认清理均不得释放 active或开始第二次。中断保留已完成恢复/验证、sourceGuardDiagnostics、已确认 migration 前缀；在途项标 UNKNOWN，不推断 rollback 或自动 retry。

## 诊断与数据边界

post-data 前仅采集独立 metadata 连接的公开角色类别 bootstrap/postgres/unknown、superuser/session匹配布尔；不读取配置值、对象名或用户行，且不冒称等于 pg_restore 中途或 SECURITY DEFINER caller。stderr-only SQLSTATE 始终 null，类别等仅为明确标注的非 PG 错误事实提示。

新 port 只读 pg_catalog，确认存在、owner postgres、definer、empty search path、service EXECUTE，以及 anon/authenticated/public 无 EXECUTE。未查询不报告 PASS；不调用业务 port，不发 userwork/claim/provider，不新增 fixture 用户或预算。候选源码/单时点 catalog/合成门禁 PASS 均不能代替真实恢复、ownerACL 或服务链验收。

## 明确不在本批准中

**不包含 E、正式库或共享 target 升级、live restore/覆盖 later writes、新 capture/key、provider/模型调用或新增费用、部署/生产/TF、新数据库、权限宽放。** 捕获点中的旧同意/角色不赋予当前 dispatch 资格。后续 shared 升级如有需要，由 Main 对 fresh保全和最小必要源集另审，本包不自动申请或启用。

## 执行前仍缺的真实条件

Main 集中取得本 A–D 的新直接 JT 回复及窗口无其他 planned DDL 的事实；保存完整问题、原回答、question ID与真实文件 SHA。 来源支持原 Main 直接 async，或 JT 在固定 BestJ 主对话 `01a1330e-5008-7061-909b-8abb26792003` 的原始 async 问答或下节固定普通消息问答（引用模式不可混用），经官方 `send_message_to_thread` 两跳 `BestJ → Mac relay 01a13313-19fd-77be-959c-9448bfab80ce → 唯一 Main 01a13311-9212-7db3-8c75-691eac0f03ea` 完整传递，由 Main 按实际收到的官方消息保存两份私有原字节证据/各 SHA、上游 hash 链、原 question ID/完整问题/原回答并固定新 human SHA，不能把 relay/BestJ 自身意见当 JT 批准，未取得原证据则 pins 继续 None，且不冒称有平台签名或已读到原聊天人类 turns。然后绑定同一新 windowId、7份原证据和同 identity pins、精确 code/source/candidate hash、新 Main START、当前 slot/parent-failure 链及≤5分钟 locale补件。启用 source pins 后须重新固定 review/hash；proposal、旧5637授权或 owner 自写 JSON 不能开启执行。全部条件就绪前，实际 cipher/identity/clone I/O 和 C/E 继续 STOP。

## 历史证据与当前未验

原 locale FAIL、post-data `RESTORE_PERMISSION_DENIED` 历史失败及 cleanupPASS 不删除；具体失败命令/PG原因仍 UNKNOWN。参见[历史诊断及证据缺口](postdata-diagnosis.md)、[启动/中断围栏证据](window-launch-interrupt-delivery-20261016.json)、[journal已完成事实证据](replay-journal-delivery-20261016.json)、[catalog覆盖准备](new-window-catalog-coverage-20261016.json)。历史测试及初始 source pins 在[阶段化交付记录](future-diagnostic-window-delivery-20261016.json)中分列，不冒称当前162全矩阵重跑。

当前新窗口未批准、未启动；真实保护副本、完整 ownerACL、87重放及新 port 物理查询均 **UNRUN**。旧真实恢复仍 **FAIL**，不称已恢复，不闭 #230/#683。


## 固定 BestJ 普通消息接收 schema（未有原答，不是批准）

BestJ 已用 `user_message.send_message` 发出同一A–D问题：question message ID `Sentinel_90d9e98b22488191ac8a1eb87cff898e`、room `6acd9506863c81958e1176881961131c`、created_at `2026-10-16T06:27:09.115944+00:00`、status accepted。accepted只表示问题已接收，不是JT同意；没有questionItemId，不构造async、不重问。JT原答尚未有，所有真实pins继续None。

普通分支human record沿原status/scope/window/identity/7旧链，来源字段最小新增为：

- source精确为 `Direct JT reply to fixed BestJ user_message.send_message question via official BestJ-to-Mac-to-Main relay`。
- questionMessageId=上述真实问题ID；answerMessageId=未来实际JT原答的不同Sentinel message ID；roomId=上述固定room；record不得含questionItemId/originalQuestionItemId。
- sourceThreadId=固定BestJ主对话01a1330e，relayThreadId=Mac01a13313，relayTargetThreadId=Main01a13311；authorizer=JT，relayIsAuthorization=false；humanQuestion/humanAnswer分别为完整原问题/原答。
- officialRelayEvidence沿原两份私有600记录的path/真实文件sha256；每份各有原sender/target链及originalHumanSourceThreadId、originalQuestionTransport=`user_message.send_message`、originalRoomId、originalQuestionMessageId、originalAnswerMessageId、originalHumanQuestion/Answer；第二份upstreamRelayEvidenceSha256绑定第一份原字节SHA，第一份upstream为null；不得伪造originalQuestionItemId。

Main仅在实际官方两跳回传原问/原答与真实问答message IDs后核原字节并保存human记录，不生成平台签名、不冒称原turn已读；然后另作pin-only review：普通分支QUESTION_ITEM_ID保持None，QUESTION_MESSAGE_ID/ANSWER_MESSAGE_ID固定两个真实不同消息引用，HUMAN_SHA固定Main真实新记录，其余既有配置/门禁不变。当前这些配置均None，缺原答不能配置、创建window/claim或数据IO。旧Main async/BestJ async保留，但只能用QUESTION_ITEM_ID且两个message pins为None，不能混用普通消息引用。
