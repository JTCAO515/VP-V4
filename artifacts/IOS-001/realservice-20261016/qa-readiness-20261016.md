# iOS 真实 QA 可测剩余：当前源码核验

结论：**尚不能通过现有 bundle/profile 直接完成 Native Bearer → Web QA 同 Session 首答/重开。PR730 已完成真实服务入口准备，不包含 NativeQA 业务适配。** 同域名/同数据库不等于同一业务端口。当前 lease 内没有可独立完成的缺陷修复；先确定下述 server/NativeSession 合同，才有新 NativeQA consumer 的真实实现输入。本次不创建空壳、重复队列、身份或 journal。

## 实际基线与验证

- 原 worktree `p0-ios-realservice-20261016`，branch `codex/p0-ios-realservice-20261016`，head `74a17a0b3877407a66b6bc73065464053562821f`；开工 clean，无本线程残留进程或在途工具，未占运行资源。共享两 hunk 已归 Main，本轮未重授。
- fetch 核实 QA=`4abeeb41e87f2ac36f0efdb9ba94780ce0049a13`；只读 git show 分析其实际内容，没有把本 WT 切换或覆盖为 QA。
- 复用 QA 中 `main-verification.md`：PR730 测试源 e2b39c8f；实际 App build/run、129 discovered=127PASS/0FAIL/2原 opt-in SKIP；新增 resolver8/8、菜单UI1/1、中英文最大字/滚动 PASS。独立 AppEntryView.ask 仅编译/源码分支，未独立 runtime。未重跑这些套件。该文档和 Main 已传验收不是本线程新执行。
- 本次 PASS：固定 QA 实际 browser-boundary.ts/native-config.ts 原字节纯函数离线运行7断言，确认拒绝 Bearer 的浏览器边界和 Native server 的 QA origin 缺口，兼容 preview/staging 对照；脚本 `verify_qa_boundary.py` 使用临时文件和不含账户凭据的环境，零 HTTP/Auth/数据POST/provider/额度。
- 本次不新验目标状态。HANDOFF 报告的 QA503、75installed/87missing、worker image准备而未启动/配置，均是当前 Main/owner 报告；未由本线程重新证明运行环境。代码差集不代表最小 apply 闭包或新 apply 权限。

## 当前真实调用链（以下路径/行号固定 QA4abe）

| 链路 | 实际调用与边界 |
| --- | --- |
| 显式入口 | `App/AppShellView.swift:20–23` flag确保四Tab；`Navigation/AppRoute.swift:235–247` 只在 explicitflag+endpoint disabled显示Disconnected，enabled仍原AskView。 |
| 模式选择 | `App/NativeSession.swift:173–180` 从 installed VisePandaNativeTaskContext 取 NativeAskMode；默认currentInput/v1，service_task_v1才v2；HTTP loopback特定flags可选v3/v4/v5，远程不能靠launch URL选endpoint。`Features/Ask/AskView.swift:17–21` assistant→旧v5，其他→旧NativeAskView。没有QA mode。 |
| Native登录 | `Features/Profile/ProfileView.swift:94–117` → `NativeSession.login:2398–2431` → `/api/auth/native/v2/credentials` → login；`lib/server/identity/native-http.ts:23–74` 普通Auth凭据+native_prepare_v2/native_session_v2，`native-credentials.ts` JWT subject/session_id校验，拒Cookie/Origin。旧安全凭据持久化复用，不读/搬Chrome Cookie。 |
| Native业务 | `NativeAskStore.swift:414–426,553–558` 原journal先持久原request，原NativeSession.askRequest路径→native/v1 policy/consent及mode.base turns；`NativeSession.swift:2027–2050,2194–2217` cookie-disabled Bearer+scope、原path白名单。无api/qa-agent路径。 |
| 原v2服务端 | `app/api/chat/native/v2/turns/route.ts:4–5` → nativeTextHTTP task-history/submit-task；`lib/server/turn/native-http.ts:12–17,43–58,88–97` 独立Native配置/active authsession → list_service_task_turns/submit_service_task_turn。不是QA HTTP或qa_submit_message_v1；原Store:544–550最多4Turn、clarification/technicalFailure续接，不等同QA的8Turn followup。 |
| Web QA | `lib/server/qa-agent/http.ts:14–32` browserBoundary→Cookie user-data-adapter→createQaService；`browser-boundary.ts:4` 明确拒Authorization；user-data-adapter.ts:190–218再次拒Authorization。原Web消费者`components/qa-agent/api.ts`通过same-origin Cookie调用sessions/history/message/recover。 |
| QA Session/Task | `qa-agent/contract.ts:1–25` wire为qa-agent/1，Session id是原chat_threads.id；`service.ts:138–184` detail/recover和qa_submit_message_v1，requestId=turnId=idempotencyKey，qa_session_history_v1资格及Task沿原SQL；不是新队列。 |
| QA worker | `qa-agent/hosted-profile.ts:61–69` profile /4 只接受qa_session_history_v1及精确owner/policy/notice/scope；`jobs/hosted-text-worker.ts:115–116` /3或/4不走legacy planGroup。/4是worker profile版本，**不存在名为QA Session/4的客户端wire**。旧worker /1、/2有current_input_v1/task_history_v1/knowledge_intent_v1代码，但未授权切换/启用，不是当前QA /4的消费证明。 |

上述 iOS 短路径相对 `ios/VisePanda/VisePanda/`。完整源 SHA 在 `qa-readiness-source-pins.json`。

## 确切剩余与责任

1. **Native Auth 目标资格（server identity + Main）**：客户端resolveEndpoint:353已接受qatesting，服务端`identity/native-config.ts:19–29`却只接受deployment URL或固定staging.go2china.space customOrigin；即使env customOrigin填写QA也不接受。需要原owner审查精确非生产QA目标适配，不可放开所有host/跨环境。登录profile/refresh同样要真实Auth/session SQL及安全proof配置；QA flag本身不能开启Native Auth。
2. **NativeQA server业务适配（server owner）**：当前app/api没有Native QA路由，browser API双重拒Bearer。需要独立Native边界，普通Bearer+当前native_session_v2验证后复用createQaService/QaStore与原chat_threads/RPC；浏览器boundary不改、不嵌网页/搬Cookie。沿原target/policy/context/worker tuple。返回原qa-agent/1语义，确定有限action/path、body cap、错误ack与cancel归属。不是另建队列、SQL身份或绕RLS。
3. **NativeSession受限QA端口/恢复接缝（Main共享writer）**：现session private credential/transport及原askRequest whitelist不能从新namespace直接用。建议只暴露typed QA actions+captured NativeDataScope的受限异步端口，不暴露token，传输前后和refresh后重新核actor/epoch/endpoint/foreground generation；保留失败ack，不能用现dataRequest丢失ack后猜not_submitted。pending必须复用原journal权威；QA policy无原NativeTextPolicy.noticeVersion，requestId/Task映射也不能强塞旧payload或伪造版本，需要Main和原journal/identity owner确定最小兼容接缝。此时没有可安全提交的shared patch：路径/actor/notice/原journal合同尚未确定；接口确定后再给当前源码精确before/patch/after，不抢旧holder。
4. **新NativeQA consumer（本owner原新namespace，可在2/3合同就绪后实现）**：最小真实UI包含policy/原生登录入口、Session列表选择/新建、首问/终态/已保存读回、重开从server列表回同session、身份/前后台变化清投影及取消本地在途；未知ACK保原key按原权威recover，不复制旧AskStore/新journal。Root/PBX只Main接。新域有必要，但现在没有获准server端口与原session/journal接口，单写consumer会成为未连接空壳，不能算产品线。
5. **目标与安装（Main/原Deploy及独立设备owner）**：Auth/QA依赖SQL、policy/notice/context、budget/worker绑定和provider均需原权限的真实就绪；ECS镜像/页面200/CI不足以证明。版本实际安装包/设备/签名状态UNKNOWN，本线程未查真人设备/账号。当前QA PBX默认VP_NATIVE_ENVIRONMENT/TASK_CONTEXT/STAGING_API_ORIGIN均空、plist四Tab默认false；不能推断已安装App含正确目标。已有包仅在实际build含本代码、相符的installed endpoint/mode/entry及原签名资格时复用，否则由原设备owner更新安装，非TF前置。

## JT直接打开测试的条件步骤（尚不可据此开始真实POST）

1. Main先交明确“哪个构建/哪个QA端点/普通测试账号资格/已批准数据用途和费用窗口”的就绪回执；真实Web首答、保存及重开同session先通过。账号在App安全登录界面输入，不发聊天、不搬Cookie。
2. 原设备owner核已安装build与installed QA配置、入口及原签名资格。若包内目标为空/模式是旧v1/v2或只有样例，更新正确非生产构建；远端endpoint不可用launch参数临时覆盖。显式flag目前只有开发launch入口，普通点App图标不自动带flag，Main须在其Root/config范围交付明确可达真实入口，不能让JT猜flags。保留原发布权限边界。
3. 在真实Native登录页登录；服务未就绪准确显示，不显示样例答案。server证明是同账号同后端QA policy/context，列表选Web已保存session；若约定仅同后端且新session，也明确记录身份和sessionID，不声称跨端同会话。
4. 获准后进行一条问题→真实终态/答案→刷新保存读回→退出进程重开→同session读回；继续一条许可内followup。未知ACK恢复、另一账号/epoch隔离、前后台清投影列定向负例。真实provider/数据提交由获准operator执行，本线程当前未执行。

## 条件式工时（工程估算，不是交付承诺）

| 阶段 | 条件齐备后的量级 | 不包含/未知 |
| --- | --- | --- |
| 实现 | server NativeQA适配和Main session/journal接口明确后，server/Main接缝约0.5–1工程日；新NativeQA consumer及受影响定向验证约1–2工程日，可按独立writer并行；总elapsed不能简单相加或保证当天 | 原holder释放、缺失合同决策、Auth/SQL/权限/预算恢复时间未知；发现journal兼容变化需重估 |
| 构建/交付安装 | 代码整合与原有效签名/设备通道已具备时约1–3小时，Main构建/PBX/CI与设备owner安装 | 签名/证书/设备信任/下载通道若未齐，没有可据源码估算的固定完成时间；不要求先TF |
| 真实联调 | Web+Auth/SQL/policy/worker/provider均就绪后，首轮目标+设备闭环约2–6小时；每次发现实际问题另估修复 | 当前目标未就绪的等待不计入，不把fixture或129本地方法当完成 |

## 停止与下一步

仅提交本次源码事实、固定pins和无IO proof；产品/UI/旧Ask/Root/NativeSession/PBX/配置均未改。由Main先协调1–3及原目标owner；有稳定接口和精确写权后续原线程实现4。本次结束即STOP，无资源/子agent/新chat/在途任务。未闭#203/#681，未承诺今天可测。
