# VPJ-02 Staging26→33冻结升级与兼容性包

状态：**准备完成，远端执行BLOCKED**。基线`cd2201194402b87e6322f4b703dd780707fcae2e`；Related to #189。
当前仅指定`VP - V4 / ap-southeast-1`测试项目；不是Production迁移或真实C2授权。
最新[只读元数据](../../artifacts/VPJ-02/staging-33-preparation/staging-metadata.json)确认26条版本/名称匹配、3 Auth/2 Trip，
不是空库，也不是本轮重新证明“无真实业务用户”。原经营者声明沿用；未读取这些记录正文/身份。

## 真实阻断与修复准备

第27条迁移冻结15个authenticated可执行public SECURITY DEFINER函数，实际Staging有18个。
预期15个源码MD5全匹配；另外三个如下。第27条原始文件未改，不能放宽库存检查或repair历史。

| 额外函数 | 已核定语义 | 实际多余访问与拟归一 |
| --- | --- | --- |
| `append_chat_turn_event(uuid,text,text,text)` | V4-08/后续RPC修复中的service-only事件写入器；不是普通用户事件生产入口 | 实际anon/authenticated显式EXECUTE；撤销它们及PUBLIC（若有）；保留service_role/postgres |
| `capture_initial_trip_version()` | Trip插入时执行的初始快照trigger | 撤销anon/authenticated/PUBLIC直接EXECUTE；保留触发器本身、owner/service权限 |
| `rls_auto_enable()` | 平台event_trigger，针对public建表启用RLS；非业务RPC | 实际还含PUBLIC EXECUTE；只撤销三类直接EXECUTE，不drop/disable事件触发器 |

[归一SQL](../../scripts/db/staging-33-pre27-normalize.sql)是**待授权的独立管理步骤**，不插入/伪造迁移历史。
同一事务先校验实际仍26、无identity_private、15个冻结源码与18总库存，再校验额外3个准确signature、
源码MD5、return type、owner、language及完整ACL集合；任一未知变化失败，无部分撤权。
成功只撤销额外三者的PUBLIC/anon/authenticated EXECUTE，后验15库存、service/owner保留且普通角色无执行权。
要求独占本轮schema/权限维护窗口，期间不得由其他操作者执行DDL/GRANT；不以并发目录快照替代该条件。

本地已用实际平台函数定义与三组有效ACL复现原27失败/整个事务回滚，再验证精确归一后27→33、
平台RLS event trigger及Trip初始快照trigger仍工作。实际远端权限未修改。
不要将“触发器不能普通RPC调用”理解成允许忽略多余ACL：冻结迁移会明确拒绝，必须精确审阅。

## 冻结文件与包生成

[完整33文件manifest](../../artifacts/VPJ-02/staging-33-preparation/migrations.json)包含前26的SHA256及7条新增迁移；
另冻结管理归一/恢复/只读SQL的SHA256。它不包含任何policy seed、角色文件、凭据或现有链接缓存。

| 序号 | 文件 | SHA256 |
| --- | --- | --- |
| 27 | `20260909223841_vpj_04_native_mobile_sessions.sql` | `21fa91dd7e352edccf80ee6ec485e28f85f2f6ba0ee39d40c55f7d3da0618d79` |
| 28 | `20260910002858_vpj_05_confirm_intent_authority.sql` | `0818eb4fd8666f5385d5995a8a95d41d1fa5c82220b02fb92522056a2c88f587` |
| 29 | `20260910163426_vpj_07_durable_turn_work.sql` | `e7d04e2c0598ed0707c05e90d8720e5eca08da22b1c78d59f52b03ac89912705` |
| 30 | `20260910171836_vpj_07_text_authorization.sql` | `60ee64bc586921a8ea2972fe9d4aa7fdccade9a4ff2da7f44d8b9345aaacea81` |
| 31 | `20260910174748_vpj_07_native_text_consumer.sql` | `156ec168fabffa251df49e4b255d5f6f6d2f1711adf06d0a5736c4aee7f1cc75` |
| 32 | `20260910190526_vpj_59_stop_model_budget.sql` | `44b3d19177c2d4f5c73f3ed4cf556054af57a45e517af396193eb563c6717330` |
| 33 | `20260910190658_vpj_37_ops_scope_read_model.sql` | `e000845700f84b86da70c9cbddb23b95eb25e07f9f24ce263e93b4915656677a` |

```sh
node scripts/db/staging-33-rehearsal.mjs --verify
node scripts/db/staging-33-package.mjs --out /absolute/new/unlinked-package
```

输出目录必须不存在，其父目录必须存在；工具拒绝覆盖。只有manifest列出的33个SQL被复制到
`supabase/migrations/`，管理SQL放在单独`administrative-preflight/`，不会被db push自动执行。
未来34+显式排除；出现不在清单的更早迁移则失败，不默默漏应用。
不得直接从持续变化的主仓库目录执行db push，也不得将后来第34条等复制进本包。

## 调用端切换矩阵

| 调用端 | DB26/27阶段 | DB28→33后 | 回退边界 |
| --- | --- | --- | --- |
| Web Trip适配器 | 先部署兼容代码，`VISEPANDA_TRIP_PROTOCOL_V2`不启用；保持legacy读取/确认协议 | 在维护窗口内完成28及验证后设置`VISEPANDA_TRIP_PROTOCOL_V2=true`，恢复匹配的Web确认/拒绝/回滚调用 | **不能把flag改false当可运行回滚**；DB28已拒绝旧digest/直接reject/伪造receipt。保留v2代码或暂停相关写流量 |
| Native身份v2 | `VISEPANDA_NATIVE_LOCAL_SESSION`及服务密钥只用于已有loopback本地模式 | 当前服务端`native-http.ts`仍硬拒绝非本地HTTP；另需reviewed远端配置接线/身份验收 | 不以迁移27或flag=true假称远端登录开启；保留移动session tombstone/epoch |
| Native Trip v2 | `VISEPANDA_NATIVE_LOCAL_TRIP`只接受loopback；无legacy fallback | 同样需要独立远端接线；不能用本地flag绕过地域/部署门 | 与Web一致保留v2确认安全；不能撤销DB guard |
| Native Text Ask | `VISEPANDA_NATIVE_LOCAL_TEXT`与`VISEPANDA_NATIVE_LOCAL_TEXT_POLICY`不得为本次启用 | 当前接口只接受loopback；30/31空registry，没有provider资格或用户同意 | 不安装policy、不启用真实文本；已有隐藏/撤回记录不能恢复 |
| iOS目标地址 | `-VisePandaNativeAPI`仅接受http localhost/127.0.0.1 | `NativeSession.swift`仍拒绝远端URL；需独立客户端配置/签名/真实Auth核验 | 不把构建通过、SQL claims fixture当真机/GoTrue验收 |
| Worker、预算、Ops | 先停止/排空新增工作，保留未知成本hold，核实部署身份；没有本包自动启用开关 | 29新增队列；32可停止预算scope；33仅service-only聚合读。无policy、无scope seed、无scheduler/团队权限激活 | 停新claim/dispatch；32仅释放reserved、dispatched转pending、pending金额保留；不可把unknown作退款 |

准确实现位置：[Web协议选择](../../lib/server/identity/user-data-adapter.ts)、
[原生身份](../../lib/server/identity/native-http.ts)、[原生Trip](../../lib/server/trip/native-http.ts)、
[原生Ask](../../lib/server/turn/native-http.ts)、[Swift地址限制](../../ios/VisePanda/VisePanda/App/NativeSession.swift)。
远端缺口已交原任务独立处理，本包不修改这些文件。

## 待授权执行序列

1. 在明确维护窗口重新运行下面只读命令，核唯一项目名称/地区、26版本和准确function/ACL差异。
   目前exit2/BLOCKED是预期观察结果，不能为了通过而将18当允许库存。元数据若变化，重新审阅包。
2. 盘点所有部署和调用端（Web确认/拒绝/回滚、旧原生、worker、批处理）；停受影响写入/新dispatch并记录在途工作。
   不存在已验证的全局维护flag；需要部署层明确停流量方案，不能自行假定已有开关。
3. 获得对**指定Staging、精确三函数权限归一、准确27–33文件、维护切换与验证范围**的明确授权。
   旧25/26迁移授权不自动扩展至本包；生产、团队身份、真实policy/provider流量仍不在本包。
4. 使用既有安全凭据通道创建新的加密备份，覆盖public/private/auth/supabase_migrations及当前可能新增的identity_private/turn_private；
   在独占恢复实例验证数据/权限/函数可恢复。只记录摘要；不输出密码哈希、session内容、key、连接串。
   既有2026-09-10备份不能替代新备份。Storage对象/物理项目/角色密码与PITR、RPO/RTO不由逻辑SQL演练证明。
5. 从冻结包调用归一SQL，仅在步骤1–4满足后；核结果15且预期源码未变。可经已验证Management API执行该明确管理动作，
   不复制或改写原迁移。归一成功不是27–33已应用。
6. 用冻结包目录执行原生CLI dry-run，严格要求只列7条27–33。生产URL、extra migration、缺失历史均停止。
   原始direct-host路径仍曾失败，不能忽略；可用的Session pooler/verify-full/官方CA路径必须重新验证，
   连接秘密只由受控调用器注入，不放命令文本、env文件或公开日志。不得关闭TLS验证。
7. 同一路径、同一冻结目录执行7条迁移，`--skip-vault`，不传`--include-all`、`--include-roles`或`--include-seed`。
   每次失败后查询实际历史prefix及函数/数据状态，不假设7条是一个远端原子事务；未记录的成功DDL同样需要调查。
8. 核历史精确33、原记录摘要/旧receipt保留、15入口guard与新增权限、policy/consent/content/work零激活。
   显式切Web v2，验证正常owner/other/anon、旧digest拒绝、读新digest后确认与幂等，不伪造用户Proposal确认。
   如测试需要新增普通账号/Trip，必须在步骤3的验证范围内，记下精确清理对象；不得碰既有3 Auth/2 Trip。
9. 原生、worker、provider的独立接线/资格未验之前仍停用；远端完成、#189通过、真实C2验收分别记录。

可审阅命令模板（后两条是**待授权写动作**，当前未运行）：

```sh
node scripts/db/staging-33-metadata.mjs --read-staging-metadata
supabase db query --linked --project-ref "$VP_STAGING_REF" --file "$VP_FROZEN_PACKAGE/administrative-preflight/staging-33-pre27-normalize.sql" --output-format json
supabase db push --linked --project-ref "$VP_STAGING_REF" --workdir "$VP_FROZEN_PACKAGE" --dry-run --skip-vault
# 明确授权、连接/备份/只读后验通过后才执行对应无--dry-run版本；不能复制完整CLI原始错误到日志。
```

`VP_STAGING_REF`只从唯一项目元数据核定；以上模板不设置数据库密码。Management API成功不证明direct/pooler/worker路径。
CLI具体连接选项必须沿当前经验证的安全调用器，不能把一个模板当秘密或连接已准备就绪。

## 失败恢复

| 失败位置 | 可执行恢复/保留规则 |
| --- | --- |
| 归一事务任一步失败 | PostgreSQL回滚全部权限变化；查实际ACL，不自动重试未知漂移 |
| 归一已提交，27尚未成功 | 优先保留更窄权限与停用状态。若责任人明确要求恢复原ACL，可用[受限恢复SQL](../../scripts/db/staging-33-pre27-restore-acl.sql)；仅版本26、无identity_private、精确源码/归一后ACL可运行。它会恢复旧广泛执行权，不能当通用自动失败处理 |
| 27失败 | 已本地证明未知库存使27整事务回滚；远端仍须核实际history。禁止repair标记通过，归一事务不随27自动回滚 |
| 27成功、28未完成 | 保留session epoch/tombstone/guards；暂停受影响入口，查实际迁移prefix；经审阅继续forward，不删除新身份表 |
| 28成功以后 | 保留DB28+及v2调用端；旧digest与直接reject不兼容，关闭v2 flag不能恢复旧功能。暂停不匹配写流量，修复/roll-forward；不regrant已撤销receipt/Proposal权限 |
| 29–33部分成功 | 停新工作与policy激活，保留队列、预算hold、正文隐藏/撤回状态；只推进尚未应用的已批准prefix后续文件，不回写旧文件 |
| 需要备份恢复 | 在新隔离目标恢复并重放后续获准迁移；迁移后已新增/撤回/删除的记录必须单独评估补偿/恢复屏蔽，不能用旧备份覆盖现库、复活session或隐藏正文 |

## 本地复现与证据边界

```sh
node --test scripts/db/staging-33-package.test.mjs
node scripts/db/staging-33-rehearsal.mjs --execute
pnpm docs:check
git diff --check
```

演练器不接受目标URL、现有容器或密钥参数；拒绝DOCKER_HOST/DOCKER_CONTEXT覆盖，只固定到已验证的本机Unix-socket Docker context。仅使用本机已有固定PostgreSQL镜像，`--pull=never`、
随机独占容器、`--network none`、无端口，退出只清理自己的owner label匹配容器。
备份仅是合成SQL在进程内的逻辑dump；恢复到第二个全新实例后再roll-forward，未读取真实备份。
**Auth表和claims是SQL fixture，不是GoTrue/JWT/原生/远端证明。**
证据见[本地结果](../../artifacts/VPJ-02/staging-33-preparation/local-rehearsal.json)与
[验证记录](../../artifacts/VPJ-02/staging-33-preparation/verification.md)。

## Vercel维护补充

[具体Vercel停流与v2切换附录](staging-vercel-maintenance.md)已核定Production/Preview/Development
同指Staging、现有CLI可用、WAF未配置。包含全项目deny→只允许已验新v2部署host/alias的恢复计划、
版本/ETag并发限制、回退false空配置的条件及直接DB/worker/在途请求盲区；这些动作尚未执行。
