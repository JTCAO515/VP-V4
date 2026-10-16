# 新诊断窗口候选：供 Main 审阅，当前未批准、不可执行

当前精确候选已更新为已合QA `4abeeb41e87f2ac36f0efdb9ba94780ce0049a13` 的162/75/87；下方161/86为保留的历史阶段。当前source/hash及验证见candidate162-delivery-20261016.json。

当前固定 Go2China `dzqdzetcctkhbrhlxxgn` 与 Production 同数据。旧 capture `f97d05db-c706-4ce9-82d8-579cbb0b9310` 的四 AGE 密文、manifest SHA `668f0bb3a34319310a7bee2a07e514f47c11442d08cd78fe4e772856c3f61085`、同一 identity 及三份 consumed claims、两份 FAIL/cleanupPASS、原 START 原字节全部保留。旧 locale 失败与 post-data `RESTORE_PERMISSION_DENIED` 仍是历史实际失败；后者不是已确定的 PG 协议错误事实，具体 ACL/command 原因仍 UNKNOWN。未完成实际 owner/ACL/count 验证，不称恢复成功，不闭 #230/#683。

## 拟向 JT 一次集中说明的动作（本文件不申请、不授权）

- A：复用同一四密文、原 manifest 与 identity；验证完整性，仅在本机私有 FileVault 中读取、解密。包括原14 schema的真实用户数据，不是QA样例；不新capture/key，不把数据送模型或外部服务。
- B：新的准备完成后60min维护窗口，普通DML继续；请真实确认该窗口无其他 planned DDL/role/ACL/Realtime/extension变更安排，由Main协调。不是全DML冻结或未来vendor保证；source仍只读，无新live GRANT。
- C：最多两次独立消费slot、自有无网/无端口/无mount PG17.6.155恢复副本。先恢复及全部schema/ownerACL/roles/count/ledger/sequence验证，采集安全枚举诊断和独立连接caller布尔；仅全部PASS后，才在同一副本作固定候选75→161/86本地演练。结束销毁副本；失败也消费slot并保结果。第二次必须前次真正FAIL+cleanupPASS、无inflight、用新证据确认原因、修复的新code/source经Main固定review及必要tests通过。不能同源同错误重跑。
- D：密文及identity沿原私有目录/0600/0700/FileVault，保留至2026-10-20 23:59:59+08。中断/未知cleanup/写claim或fsync失败保消费状态与active围栏；不自动回收旧marker/锁，不自动创建第三次、延时或新UUID。

本新scope不含E/target升级、live restore/覆盖later writes、provider/模型/费用、部署、生产/TF、别的数据库或新权限。捕获点中的旧同意/角色不构成当前dispatch资格。当前C/E、实际cipher/identity/clone I/O继续STOP；实际operator仍只有Main。

## 当前来源与兼容边界

新文件 `candidate-replay-manifest-20261016.json` 固定QA `3d99a8af1805d714b71dce959b0811da468c24ea`，161源/75原版本/精确86差集/targetOnly0；与Main只读差集文件（sourceHead5e96）的161 migration hashes相同，非迁移源码变化不被混为SQL变化。每个Git blob/hash/顺序/原事务边界已离线核对。旧155/80 manifest原字节不变，旧CLI不能借旧授权送入新候选。

当前Docker只读检查没有server。新86与managed Auth/Storage/Realtime/vault权限兼容的物理恢复/重放未验；不启动daemon、不借别人的container/旧nonce/PG16、不加no-owner/no-acl或权限宽放。仅复用既有完整假数据成功证明的原scope；它不证明本轮161、真实角色或实际恢复PASS。实际post-data失败未独立复现为具体原因，本轮没有臆造ACL修复或supabase_vault兼容。

## 未配置门禁与 Main 真正缺项

入口：`controlled-snapshot-restore.py --restore-diagnostic-window-from-direct-record <new-packet> <original-manifest> <same-identity> <candidate-plan>`。

独立 `reviewed-diagnostic-window.py` 的 HUMAN_SHA256、QUESTION_ITEM_ID、IDENTITY_PATH_SHA256、PRESERVED_PINS 均故意None。真实新JT回复和Main pin/source review之前，在packet/manifest/identity/clone I/O之前拒绝；旧5637、旧维护回复、proposal或owner自写JSON不能开启。Main将新直接回复保存至自身私有 `diagnostic-window-human-authorization-20261016.json`；actual question item和原字节SHA只能事后真实绑定，不预填假答案。启用pin导致source/code hash变化，必须重新固定review，不能仅填JSON绕过。

Main需提供/保全以下具体字段与证据：

1. 新直接human记录：source为当前Main async直接回复、完整问题和原回答、questionItemId、固定target/原capture/manifest/同identity路径SHA、独立新windowId、60min/最多2copies/普通DML继续/无其它planned DDL/复用原数据/无新capture-key-liveGrant-provider-E，含“只有full restore PASS才本地候选演练”的明确范围。
2. 原7份证据路径+原字节SHA：capture claim、restore claim、retry1 claim、两个真实FAIL/cleanupPASS、两个原START。SOURCE pin后逐次检查，原failure.oneTimeRestoreClaim和START hash/old code/同UUID/window链必须一致。未知链拒绝，不改旧文件。
3. 新私有START `diagnostic-window-main-start-20261016.json`：Main固定source commit、current code SHA、newHuman SHA、windowId/attempt、原bundle/identitySHA、同60min起止/maximumCopies2、固定actions、无其它actual attempt、原7证据digest及fresh locale SHA。每次启动须仍至少余30min；第二次起止必须等于第一次，不新开60min。
4. 新packet：同START及原bundle/resolve identity路径，original manifest SHA、retention、candidateMode/hash、固定actions、parentFailure SHA、START真实SHA。attempt1 parent为原retry1 FAIL；attempt2 parent只能为此window slot1的不可覆写结果及matching used claim。
5. 当前只读locale补件<=5min、原capture关联及基础facts一致；仅已验证en-US/ICU153.121/null rules，不猜版本。原FileVault/原restore完整性、sequence等门禁保留。
6. slot2附Main diagnosis/test证据及hash：前次FAIL fingerprint、新因果证据、causeIdentified、独立review、修复commit/不同code SHA、必要tests精确匹配该修复。仅改doc/hash或重发相同code/source不行；前次PASS/cleanup非PASS/无结果/active均不行。

每次在archive读取前O_EXCL创建独立window/attempt used；原capture全局active锁挡并发。result只写一次；只有记录完成且cleanupPASS才释放当前active锁，消费标记始终保留。无过期锁自动清理、无重试循环。

post-data前caller仅新路径采集独立metadata连接的 roleClass=bootstrap/postgres/unknown、effectiveSuperuser/sessionUserIsBootstrap布尔。明确 `SEPARATE_PRE_POSTDATA_CONNECTION_NOT_PG_RESTORE_RUNTIME_CALLER`，不读配置值、对象名、用户行，不冒称观测pg_restore中途/SECURITY DEFINER caller。stderr诊断沿已交f31：SQLSTATE总是null，其它只是非PG事实的提示。

## 当前可交付与未运行

代码门禁/原子claim/负例与精确candidate source绑定可以审阅；真实新授权、真实窗口、slot/identity pins、fresh运行字段尚缺。新窗口/实际恢复/完整ownerACL/managed-extension新86重放均UNRUN，历史失败保留。Main完成review后统一向JT申请上述具体新动作；本owner不自行请求或执行。


## 新鲜catalog预填补件（只读，不是备份或稳定窗口）

Main原同link/target执行metadata-probe的BEGIN READ ONLY/ROLLBACK，current_user=postgres/read_only=on。只读文件SHA `a5e5efdb3d897357470628d913952edd71af9edcb3286f2370f394c0a7d31a49`，93650 bytes。20非系统schema、31roles、25memberships、119业务relation元数据、243function ACL、4platformrelation元数据、7event triggers、25default ACL，五extension版本/owner被现有supabase-17.6.1.155-five-extensions/1 classifier识别；14个原数据schema都存在。数据范围/原schema名及计数参见new-window-catalog-coverage-20261016.json。

这些数字是catalog覆盖，不是119张表恢复/ACL正确、数据行计数、managed服务验收或整个60min无DDL的证明；没有vaultsecret/平台表行读取，没有新dump/密文/identity访问。未来依然full schema/ownerACL+无密码globals、14 data schemas+原已批准Realtime89账本；其余platformdata不自动扩展。实际前置还需Docker server可用且固定image/依赖真实验证、新直接JT新窗口范围及无其它planned DDL事实、新Main START/原证据及同identity pins、slot/fresh locale；当前全未因此转为可执行。

维护独占仅由Main协调本已接受范围，普通DML照常；单时点健康/catalog不替代稳定窗口，也不宣称控制所有vendor非计划变化。本补件没有引入代码缺口，复用已交候选与47项focused证据，不增加wrapper、不重跑矩阵。新scope仍仅诊断恢复和获准的同copy本地候选验证，绝无E/target升级授权。


## 新路径绝对deadline返修

新诊断入口在首次授权校验后只创建一次monotonic窗口终点，不随阶段/命令/重试重置。数据处理截止预留120秒cleanup；secret/archive/hash/SQL/restore/replay子进程timeout取原上限与同一剩余预算的min，过期不发下一命令。在途子进程由timeout中断，取消/回收本调用创建的host children；不能把docker exec客户端被kill当容器已停，须验证本nonce/ownedlabel、按不可变containerID删除并确认消失。容器启动请求已发但created旗标未置真时也执行该fence。

必要cleanup允许到期后继续、独立总预算60s，仅inspect/remove/reap自有对象，不恢复data预算。foreignlabel/daemon未知/无法确认清理则cleanupFAIL/UNKNOWN、消费和active围栏保留，不授权下一attempt。原严格base字节、旧路径默认行为、47项既有证据与parser不动；新的合成时钟RED/GREEN及10项focused负例见window-deadline-delivery-20261016.json，无真实copy或新窗口。新runtime-binding迁移仍未合QA，不假造hash；当前候选仍161/86，待Main给稳定source再由本manifest owner独立更新。


### UTC/monotonic双上界闭合
批准边界是原绝对UTC windowEnd，同时以一次monotonic end限制最长运行；check/timeout始终取两者剩余预算min（同预留120s）。monotonic anchor在wall取样/授权校验前捕获，校验延迟不增加时间。UTC前跳可使数据立即过期，后跳不能延长monotonic；过期后不重新开放。
在途等待按<=0.25s切片复查两钟，只继续等待同一进程、不新spawn/重送SQL/input，原命令timeout总上限不重置。发现过期后中断tracked进程并沿原nonce/immutable-ID fence清理，unknown仍保active/consumed结果。新18项focused含旧742UTC-forward RED；未执行真实数据/新窗口/clone。


### 启动未知与中断证据围栏
run-issued与daemon完成返回immutableID分开记录。启动unknown时一次或多次absent都不能推无副本；即使观察到同nonce ID并停止删除、确认消失，未确认的launch仍UNKNOWN，保active/consumed/result，不自动slot2。confirmed launch的按name缺失还需记录ID的缺失确认；foreignlabel/ID冲突不删。结果保name/nonce/ID/launch确认/移除确认等自有资源链，无用户数据。

KeyboardInterrupt/取消不丢已完成阶段。保completedRestoreResult、后续已过验证、诊断、completedIO列表和已ack的migration前缀；第N步在途结果UNKNOWN，不推rollback或自动retry。cleanupFAIL也持久化这些证据并保active。原23focused（含旧18）RED/GREEN见window-launch-interrupt-delivery-20261016.json。真实数据I/O仍STOP，新窗口未批准，无新capture/key/provider/E。


### CLI协议及环境事实更新
Main用独立无数据空sleep fixture证实Docker29.8的not-found可为小写 `error: no such object: <exactid>`。新识别只扩有限前缀，仍要求exit1、stdout空/[]、exact identifier，不能把daemon错误/别的id/其他exitcode当不存在。unknown launch仍UNKNOWN，绝不absent转PASS。25项focused含旧59小写协议RED。
Main另只读确认desktop-linux daemon29.8/API1.56及原缓存strict镜像3866/linuxarm64可用（替代前述server不可用的单时点事实）；没有pull/tag改动/PG副本/真实数据操作。它不构成managed-ownerACL实际恢复证明或新增窗口授权。当前仍C/E STOP；新runtime-binding追加迁移未合QA，候选暂161/86，不虚填162/87的来源相等布尔。


## PR731正式合QA后的162/87候选

实际QA4abe Git对象新增且仅新增 `20261016040522_qa_runtime_binding.sql`，SHA `a83928dacb9a7177c07b8d7f29bade5505414faa097fd072d90a2c6c77b2403c`，原161全部hash不变。原155/80 manifest不动；新candidate mode明确75-to162。Main新鲜官方75 baseline逐项等于原capture75，全162 source map/87missing/targetOnly0补件实算SHA `9428747d5e6506f98706716c0693b26ce794a6c503a018c62fdaa2a06912bb6e`，sourceMetadataHead现在4abe；旧5e的161覆盖另保历史，不以它的“全相同”冒162证明。

只有fullrestore PASS、同copy exact87完成且原v2/生命周期/开关全部门禁已过，candidate分支才查询两个新port的pg_catalog：qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text)、qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text)。返回/可选journal仅保观察到的布尔事实：exists/ownerIsPostgres/securityDefiner/emptySearchPath/serviceExecute true，anon/authenticated/publicExecute false。实际SQL不调用port、不发claim/userwork/provider、不创建fixture用户或预算，不吐角色名/配置值。缺失/ACL漂移/错误shape均FAIL；未查询不报告PASS。

本轮4项manifest与5项port focusedcases（含多ACL负例）、旧89→新legacy返回/SQL序列golden PASS；原25+5证据复用，不重矩阵。真实保护副本、87重放与新port物理metadata查询仍UNRUN；全部新授权pins仍None，无新window/slot/claim/identity/AGE/host动作。Main仍soleactualoperator；实际C/E继续STOP，待集中具体新批准。
