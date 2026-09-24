# VPJ-02 Vercel维护与v2部署切换附录

版本2026-09-11；Related to #189。补充[冻结26→33包](staging-26-to-33.md)，不改变其33文件manifest。
状态：**本轮已执行维护停流、Staging27–33和Web v2配置/部署收尾**。见[执行记录](../../artifacts/VPJ-02/staging33-execution/verification.md)。下面的“当前”快照与待授权模板保留为执行前设计依据，不代表仍缺本轮授权。

## 真实绑定与受影响范围

[当前脱敏快照](../../artifacts/VPJ-02/vercel-maintenance/metadata.json)来自现有CLI59.15.1认证。
连接器的空列表/404不代表Vercel整体不可用：CLI project/env/deployment/firewall读取均成功。

| 对象 | 已验证事实 |
| --- | --- |
| 项目 | `prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2`，`jtcao515s-projects/vp-v4`，团队`team_vLT8SL2mQJJSnXbD9GzVLP4K`，Pro active |
| Production | main分支，3个项目变量：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_JOTFORM_EARLY_ACCESS_URL` |
| Preview | 同样3个变量；全部无gitBranch或customEnvironment覆盖 |
| Development | 前两个Supabase变量；也无分支覆盖 |
| 三环境数据库 | 分别只读取PUBLIC URL值，均为`https://dzqdzetcctkhbrhlxxgn.supabase.co`，即指定Staging |
| 已部署证据 | 抽查Production `dpl_BYMjENfmkBnqShHwWQ4MMHQNtDoT`（1cbab642）及Preview `dpl_Gqn3JX36DNJJj7Y7uyaY3Fgq4PSu`（3db8936）的登录页静态JS，均含上述Staging origin；未提交登录或读取用户数据 |
| 协议flag | 项目变量及所查deployment环境名称中没有`VISEPANDA_TRIP_PROTOCOL_V2`，现有源码据此走legacy；未读取其他变量值 |
| WAF/保护 | 当前active=null、draft=null、versions空；CLI显示firewallEnabled=false、规则0、bypass0、草稿0。ssoProtection=null，password/trusted-IP未配置 |
| 函数地区 | 所查部署API的regions为`iad1`；它不是Supabase的新加坡地区，也不是模型处理地区证明 |

`vp-v4.vercel.app`、`vp-v4-jtcao515s-projects.vercel.app`和`vp-v4-git-main-jtcao515s-projects.vercel.app`
是所查生产部署的aliases。当前配置不能证明每个历史deployment的环境值；历史URL一律作为潜在Staging入口处理。
因此只保护Preview不充分，**本项目Production也必须进入本次停流授权范围**，不涉及其他Vercel项目或Production数据库。

### 共享数据库迁移注意事项（2026-09-24）

- 生产站与Staging共用`dzqdzetcctkhbrhlxxgn`：对该库的任何迁移都同时作用于生产站。执行前须由JT先备份并决定；独立Production数据库属#243。
- 本机经代理访问时，直连`db.<ref>.supabase.co`因代理fake-IP失败；备份与`supabase db push`须经`aws-0-ap-southeast-1`的IPv4 Session pooler。连接串与密码只在本机使用，不写入仓库或聊天。
- 2026-09-24 JT经该pooler先备份（schema与data文件只存本机、不入库），再以`supabase db push --include-all`应用14个迁移，`migration list`本地/远端一致；记录见`docs/handoff.json`与`docs/program/2026-09-05/CURRENT-STATUS-2026-09-24.md`。
- `--include-all`会补应用早于远端最新版本的未登记迁移；执行前先`supabase migration list`核对差异，确认补齐项是预期的。

## 可用控制与局限

[WAF自定义规则](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)是项目级实时配置，不需应用重部署；
[规则参数](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)支持environment、host、method。
本方案选择`path pre /`的deny，**不限定host/environment/method**：覆盖该项目所有Vercel deployment URL和别名、
Preview与Production、所有HTTP方法，避免遗漏GET副作用、Server Actions或旧路径。短时连首页/静态资源也不可访问。
配置尚未执行；须以窗口中的实际请求探针验证覆盖，不能将文档支持当作已观测阻断。

当前[WAF价格](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)说明自定义规则免费，WAF拒绝的请求无CDN/FDT费用。
不添加rate-limit、OWASP、持久封禁或其他收费/附加功能；无升级套餐采购。无duration，避免规则撤销后仍残留按IP时长封禁。

[VercelAuth](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)允许有权限的团队、共享访问者和automation bypass，不是全部请求停写门。
[项目pause](https://vercel.com/docs/projects/managing-projects#pausing-a-project)针对production，不能当Preview维护。
当前CLI请求链把custom WAF rules列为非system bypass跳过项；仍要在授权窗口验证匿名、已登录Vercel及automation访问都被维护rule拒绝，
并查是否新出现更高优先级custom bypass、team级策略或其他配置变化。

**不覆盖：**`*.supabase.co`直连、已打开页面中的直连SDK/Auth刷新、SQL/direct-host/pooler、Management API、
本地开发服务、独立worker/CLI和发布前已进入函数的请求。域名规则无法停止这些请求或召回在途动作。
本轮不新增DB维护门。实际执行前JT须确认窗口内其他操作者/测试者停止这些写入和自动任务；负责执行的agent还须检查
已知worker停新claim/dispatch、在途事务/任务收敛（只查聚合状态，不读内容）。无法列全调用者或确认静默时，DB升级继续BLOCKED。
“暂时观测0个连接/写事务”不是未来不会再写的保证，不能省去操作者协调。

## 配置快照、版本与并发保护

```sh
node scripts/db/vercel-maintenance-metadata.mjs --read-only
```

该固定目标工具只GET；仅PUBLIC Supabase URL可解密，其他环境变量只保留名称/target。
读取config的active/draft版本、updatedAt、对对象键排序、保留数组顺序的全响应canonical fingerprint及ETag（如果响应提供），不自动修改任何内容。
当前响应**没有ETag**，官方[OpenAPI](https://openapi.vercel.sh)也未为这些写接口声明If-Match/CAS参数；
**不能虚构`If-Match`已生效或把一次read→write说成原子比较交换**。

1. 窗口由一个执行者独占，禁止其他人/CI修改WAF、变量、deployment或alias。
2. 每次写前重新GET active/draft/versions；第一笔要求与快照的未配置状态和fingerprint一致。
   后续要求精确匹配本次上一步返回的id/version/updatedAt与配置内容；发现其他草稿、规则、版本或alias变化立刻停止。
3. PUT会创建/覆盖配置；仅因当前明确为空且本次独占窗口才使用这些完整payload。若出现其他规则/managed settings，不套用空模板覆盖。
4. 每笔后再GET核实际active/draft和新增版本。若只生成draft，记录数字版本和完整内容，
   发布前再读并核准本次拥有的同一草稿，再执行官方 `firewall publish`。
   CLI59.15.1实际调用的是`config/draft/activate`并提交JSON空对象；数字展示版本不是可替代的激活路径。
   不发布未核准或发生漂移的草稿。若响应表明已active，按已生效动作处理，不重复激活。
5. 只有受控版本与实际拒绝探针同时符合预期才能开始DB动作。HTTP200/已创建draft不证明规则已启用。

这组检查降低误覆盖风险，但不代替服务端CAS。无法建立独占窗口时，本方案不是安全可执行的迁移维护门。

## 经批准后的明确动作

以下均是**待授权写动作模板**。固定CLI调用前缀使用`CI=1 VERCEL_TELEMETRY_DISABLED=1 pnpm dlx vercel@59.15.1`；
示例中的`vercel`代表此前缀。`VP_PROJECT`/`VP_TEAM`只能取上表核定ID，scope固定`jtcao515s-projects`。
不传token/password、不开debug、不把原始API响应或CLI错误直接留档。

### A. 停Vercel全部部署请求

[deny payload](../../scripts/db/vercel-maintenance-deny.json)显式`firewallEnabled:true`和单一全路径deny，避免依赖未配置状态的默认enable行为。
已按官方PUT schema离线核验；本轮未调用PUT。API可能直接改变active配置，按实时不可访问动作审批。

```sh
vercel api "/v1/security/firewall/config?projectId=$VP_PROJECT&teamId=$VP_TEAM" --method PUT --input scripts/db/vercel-maintenance-deny.json --raw
# 由受控子进程筛选GET输出、核准版本和内容；如果只生成draft才执行下一条。
vercel firewall publish --yes --project "$VP_PROJECT" --scope jtcao515s-projects
```

验证current和older production URL、production aliases、current/older preview URL与branch alias。
对安全的不存在路径`/__vpj02_maintenance_probe`测试GET/HEAD/OPTIONS/POST/PUT/PATCH/DELETE，
要求403且能归因到本维护rule；不存在路径避免规则失效时碰实际写API。再验证实际产品路径GET也受阻。
覆盖包括匿名、已有Vercel登录态与既有automation通道；不索取或在日志显示它们的凭据。
若任一绕过，保持停迁移。边缘403不证明已在途请求已结束；先完成上述外部调用者/worker协调和收敛检查。

### B. 执行独立批准的Staging包；再构建v2调用端

完成[26→33 runbook](staging-26-to-33.md)的加密新备份/恢复、三函数归一及7条迁移。
本附录不把Vercel维护授权扩成DB/账号授权。DB28后仍保持deny，再设置两目标的新变量并重新构建。
当前该变量不存在；故不使用`--force`覆盖未知新值，也不修改PUBLIC URL或任何key。
固定CLI59.15.1的实际`env add --help`确认支持`--type config`、`--value`及逗号分隔多target，见[help证据](../../artifacts/VPJ-02/vercel-maintenance/cli-help.json)；不从其他版本网页猜参数。

```sh
vercel env add VISEPANDA_TRIP_PROTOCOL_V2 production,preview --value true --type config --yes --project "$VP_PROJECT" --scope jtcao515s-projects
vercel redeploy "$VP_APPROVED_SOURCE_DEPLOYMENT_ID" --target preview --scope jtcao515s-projects
```

SOURCE部署必须先核project、准确已审commit、支持DB28+的代码和目标配置，不盲用“latest”。
变量修改不会改变旧部署；redeploy产生新ID，其flag与构建绑定。不能将带旧env的Preview直接promote来假装Production已用新env。
暂不启用Native LOCAL flags、policy、provider或worker；原生远端接线由独立任务验收。

### C. 按host逐步放行，仅恢复新v2

先只把新Preview deployment URL的host列为允许，其余所有项目host仍deny。规则改为
`host ninc [准确核准的新host] → deny`，保持最高优先级，无bypass规则。官方数组上限75；本次预期少于10个。

```sh
vercel firewall rules edit "$VP_MAINTENANCE_RULE_ID" --condition "$VP_VERIFIED_HOST_CONDITION_JSON" --action deny --yes --project "$VP_PROJECT" --scope jtcao515s-projects
# 发布前再次核准本次准确draft/version及完整内容，再按上一节官方CLI发布；不用发布他人的草稿。
```

`VP_VERIFIED_HOST_CONDITION_JSON`完整形式是`{"type":"host","op":"ninc","value":["实际新部署host"]}`。
占位文字不可执行；host必须来自实际deployment metadata，不接受通配符、URL路径或未经核定的域名。
在新Preview完成获准合成普通账号的owner/other/anon、读digest→确认/重放与旧digest拒绝验证后，再创建匹配Production新部署：

```sh
vercel redeploy "$VP_APPROVED_SOURCE_DEPLOYMENT_ID" --target production --scope jtcao515s-projects
```

Production redeploy可能重绑稳定alias；deny此时仍阻断未允许host。先放行其唯一新deployment host并验证，
最后逐个将确实指向该新v2部署的production/preview aliases加入允许数组。
**每次开放前重新核`alias → deployment ID → commit → 此deployment的flag/config`**，不能只检查host名称。
窗口内禁止别人重绑/rollback alias到旧版；发生变化立即恢复deny，不自动回退到旧commit。
旧production/preview deployment hosts继续deny，不因新变量存在而推定它们兼容。
新自动PR部署也不自动进入allowlist；允许前必须核定代码/flag。删除旧部署是另一项授权，本方案不执行。

## 回退与残留

| 时点 | 回退规则 |
| --- | --- |
| 只创建了未激活草稿 | 核它完全属于本次且active未变后才撤销该草稿；不能用全局discard清掉他人的变化 |
| deny已active，DB28尚未成功且决定取消窗口 | 先确认DB仍支持旧调用端、没有未决并发配置变化。用[disabled payload](../../scripts/db/vercel-maintenance-restore-disabled.json)恢复firewallEnabled=false、rules/ips空；同样核版本/激活状态与实际访问。原来active=null，无历史版本可重新activate；这是恢复等价设置，保留新增审计版本，不声称删除历史 |
| DB28已成功 | **不执行disabled模板、不删除维护rule、不把v2设false**。保留deny或已验新host allowlist，修复/roll-forward；否则旧URL和alias会重新暴露不兼容调用端 |
| 新v2失败、alias发生漂移或scope不明 | 保持/恢复全路径deny，并重核当前WAF版本，禁止覆盖未知并发修改；保留DB/预算pending/撤回与隐藏记录 |
| 完成窗口 | WAF保留新host allowlist保护旧URL；准确记录允许hosts、alias绑定、config版本和deployment SHA。后续放开旧host/移除rule需新资格与授权，不自动恢复原空配置 |

disabled模板对应**本次观察到的空配置**，不可用作未来任意WAF状态回滚。其命令同A的PUT，换成该payload；
仅在上表允许时执行。原JSON的sso/password等项目设置从未修改，无需“恢复”。
不要轮换Supabase公钥/撤销所有用户session或pause其他项目来绕开维护缺口。

## 最终一次授权须明确包含

- 本项目短时**全部Production/Preview部署与别名不可访问**，以及必要WAF配置/准确版本切换。
- Production/Preview新增v2变量及新部署，逐host/alias核准后恢复，旧host继续禁用。
- 指定Staging的三函数权限归一、精确27–33、新加密备份/恢复、获准合成普通账号/Trip的精确ID清理。
- JT确认窗口内其他操作者停止直连DB/SDK/本地/worker写入；执行者完成在途收敛观察。缺这项不宣布DB静默。

未授权部分不执行；既有开发授权允许本附录准备与本地验证，不允许上述实行动作。
