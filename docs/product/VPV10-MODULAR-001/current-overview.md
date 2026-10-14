# VP-V4 当前三工程交付计划

生成自 current-plan.json。原52是迁移输入；当前37张工程任务加原Program，不以固定数量验收。

当前优先：JT 已批准 Muse 参考规划并恢复整套连通 iOS 前端：Main 统一四 Tab/导航/PBX/前端内存状态与跨页对象 ID；IOS-001 对话与成果确认、IOS-003 旅程层级与地点路线、IOS-005 表达大字卡，以及独立资料库/记忆、头像详情切片一并覆盖。真实 QA/DB/provider 不是前端开工前置；真实功能 AC 与权限边界不变。

## B2

当前最高优先：整套连通 iOS 前端，含 Main 四Tab整合、IOS-001/003/005及新IOS-011/012独立切片。

原owner/dirty/PR复用，独立目录并行；共享导航/PBX/Conversation/前端对象状态由Main单writer整合。不因HTML尚未定位或真实QA/DB/provider未验暂停已批准页面范围。

## B1

真实 QA 未完成部分作为 iOS 必需依赖或必要安全收尾推进；已可体验的 QA873 sample 不重做。

不作为全部 iOS frontend 的前置完成门；恢复/目标操作仍受原具体授权、有效窗口与实际资源门禁约束，本次没有新增运行权限。

## B3

跨端真实质量、TestFlight、生产发布与客户观察。

签名准备、质量与产品协调可先准备；真实发布仍按原具体门禁。

## EXPAND

只有原activationEvidence满足才考虑扩展。

不是当前实现承诺。

| ID / GitHub | 工程 / 主责 | 批次 / 优先 | 用户结果 | 原票承接 |
| --- | --- | --- | --- | --- |
| [PROGRAM #187](https://github.com/JTCAO515/VP-V4/issues/187) | agent / 唯一 Main；产品取舍沿 BestJ/CoolJ/JT | OVERVIEW / P0 | 优先看到原生持续体验、准确地点动作与表达大字卡，沿已有 Agent/业务端口逐步接入真实能力 | #187 |
| [AGENT-001 #680](https://github.com/JTCAO515/VP-V4/issues/680) | agent / agent 原实施 owner，Main 按现 lease 协调 | B1 / P0 | 真实文本请求经持久执行返回可恢复回答 | #680, #195 |
| [AGENT-002 #682](https://github.com/JTCAO515/VP-V4/issues/682) | agent / agent 原实施 owner，Main 按现 lease 协调 | B1 / P0 | 许可内同 Session 多轮与纠正真正进入模型 | #682 |
| [AGENT-003 #199](https://github.com/JTCAO515/VP-V4/issues/199) | agent / Profile/Memory 原 domain owner | B2 / P1 | 显式 Memory 被正确消费且可纠正遗忘 | #199 |
| [AGENT-004 #359](https://github.com/JTCAO515/VP-V4/issues/359) | agent / agent 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 旅程来源经审核形成可发布的知识变更 | #359, #205 |
| [AGENT-005 #206](https://github.com/JTCAO515/VP-V4/issues/206) | agent / agent 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 回答引用获准知识并显示部分答案与缺口 | #206, #360 |
| [AGENT-006 #208](https://github.com/JTCAO515/VP-V4/issues/208) | agent / agent 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 地图供应商按用途和成本受控补查降级 | #208, #367 |
| [AGENT-007 #200](https://github.com/JTCAO515/VP-V4/issues/200) | agent / agent 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 图片语音模型在中英任务上具备可用资格 | #200 |
| [AGENT-008 #227](https://github.com/JTCAO515/VP-V4/issues/227) | agent / agent 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 完整 ServiceTask 的额度和实际尝试成本一致 | #227 |
| [AGENT-009 #226](https://github.com/JTCAO515/VP-V4/issues/226) | agent / 购买与权益原 domain owner | B2 / P1 | 一次官方测试购买产生双端同源权益 | #226, #503 |
| [AGENT-010 #504](https://github.com/JTCAO515/VP-V4/issues/504) | agent / 删除与数据生命周期原 domain owner | B2 / P1 | Trip 删除后各端与迟到工作均遵守生命周期 | #504 |
| [AGENT-011 #230](https://github.com/JTCAO515/VP-V4/issues/230) | agent / 恢复演练与数据生命周期原 owner | B1 / P0 | 恢复演练保留权限与删除状态并给出可核结果 | #230 |
| [AGENT-012 #229](https://github.com/JTCAO515/VP-V4/issues/229) | agent / agent 原实施 owner，Main 按现 lease 协调 | B3 / P1 | 运营可见质量成本故障并安全停用恢复能力 | #229 |
| [AGENT-013 #264](https://github.com/JTCAO515/VP-V4/issues/264) | agent / agent 原实施 owner，Main 按现 lease 协调 | B3 / P1 | Harness 对真实问答改稿恢复和模型候选给出发布证据 | #264, #265, #266, #267, #268 |
| [AGENT-014 #222](https://github.com/JTCAO515/VP-V4/issues/222) | agent / ServiceCase 与资料许可原 domain owner | B2 / P1 | 人工服务只读取按任务授予的资料 | #222 |
| [AGENT-015 #243](https://github.com/JTCAO515/VP-V4/issues/243) | agent / Production 环境与回滚原 owner | B3 / P1 | 客户 Production 环境具有隔离和回滚保证 | #243 |
| [AGENT-016 #248](https://github.com/JTCAO515/VP-V4/issues/248) | agent / agent 原实施 owner，Main 按现 lease 协调 | EXPAND / P2 | 真实召回缺口触发最小混合检索改进 | #248 |
| [AGENT-017 #249](https://github.com/JTCAO515/VP-V4/issues/249) | agent / agent 原实施 owner，Main 按现 lease 协调 | EXPAND / P2 | 获准航班来源支持变化后的行程重验 | #249, #250 |
| [AGENT-018 #225](https://github.com/JTCAO515/VP-V4/issues/225) | agent / 商品策略原 owner | B2 / P1 | 商品服务边界清楚并凭证据决定后续订阅升级 | #225, #252 |
| [AGENT-019 #246](https://github.com/JTCAO515/VP-V4/issues/246) | agent / 客户发现原 owner | B3 / P1 | 客户试点与真实经营观察支撑下一步产品选择 | #246, #247 |
| [AGENT-020 #251](https://github.com/JTCAO515/VP-V4/issues/251) | agent / 产品需求与语言范围负责人（沿原决策归属） | EXPAND / P2 | 需求证据决定未来客户端与语言范围 | #251 |
| [AGENT-021 #232](https://github.com/JTCAO515/VP-V4/issues/232) | agent / 跨端网络验收原 owner | B3 / P1 | 境内外网络下三工程消费链路有实际证据 | #232 |
| [AGENT-022 #245](https://github.com/JTCAO515/VP-V4/issues/245) | agent / 发布交付与支持原 owner | B3 / P1 | 客户收到产品后的支持和发布关账可追溯 | #245 |
| [IOS-001 #203](https://github.com/JTCAO515/VP-V4/issues/203) | ios / Main 已指定的原/新 iOS owner 01a12dba-36ee-7602-a285-698d04d2cbcc | B2 / P0 | 首访委托和回访继续同一旅程目标 | #203 |
| [IOS-002 #201](https://github.com/JTCAO515/VP-V4/issues/201) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 单张截图经校正和明确确认加入同一 Trip | #201, #507 |
| [IOS-003 #209](https://github.com/JTCAO515/VP-V4/issues/209) | ios / Main 已指定的原/新 iOS owner 01a13928-1a52-7b00-84ac-d6c6523f0396 | B2 / P0 | 地点发现保存消歧和导航保持同一准确实体 | #209, #363, #364, #210 |
| [IOS-004 #506](https://github.com/JTCAO515/VP-V4/issues/506) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | Today 显示确认版本行程和中文地址 | #506 |
| [IOS-005 #216](https://github.com/JTCAO515/VP-V4/issues/216) | ios / Main 已指定的原/新 iOS owner 01a13924-853c-7561-8b51-548950947cc9 | B2 / P0 | 旅途中以可信中英表达和大字卡沟通 | #216 |
| [IOS-006 #212](https://github.com/JTCAO515/VP-V4/issues/212) | ios / iOS 酒店交接原 owner（与 Web consumer owner 协作） | B2 / P1 | 酒店官方出口在原生与 Web 正确交接 | #212 |
| [IOS-007 #237](https://github.com/JTCAO515/VP-V4/issues/237) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 签名 Archive 产出可安装 TestFlight 包 | #237 |
| [IOS-008 #233](https://github.com/JTCAO515/VP-V4/issues/233) | ios / ios 原实施 owner，Main 按现 lease 协调 | B3 / P1 | 原生整链交互可访问且性能可接受 | #233 |
| [IOS-009 #242](https://github.com/JTCAO515/VP-V4/issues/242) | ios / ios 原实施 owner，Main 按现 lease 协调 | B3 / P1 | TestFlight 真机贯通规划准备与旅途 | #242 |
| [IOS-010 #244](https://github.com/JTCAO515/VP-V4/issues/244) | ios / ios 原实施 owner，Main 按现 lease 协调 | B3 / P1 | 满足原门禁后完成 App Store 1.0 审核交付 | #244 |
| [WEB-001 #681](https://github.com/JTCAO515/VP-V4/issues/681) | web / web 原实施 owner，Main 按现 lease 协调 | B1 / P0 | 从已可体验样例走向真实持久会话 | #681 |
| [WEB-002 #234](https://github.com/JTCAO515/VP-V4/issues/234) | web / web 原实施 owner，Main 按现 lease 协调 | B2 / P1 | Web 独立完成同 Trip 规划成果审阅与确认 | #234 |
| [WEB-003 #683](https://github.com/JTCAO515/VP-V4/issues/683) | web / web 原实施 owner，Main 按现 lease 协调 | B1 / P0 | QA Web 交付版本与真实问答验收一致 | #683 |
| [IOS-011 #692](https://github.com/JTCAO515/VP-V4/issues/692) | ios / Main 已指定的独立前端 owner 01a1396d-7aa8-7c70-b717-d9c47866bb28 | B2 / P0 | 在完整四 Tab 前端中查看资料来源和记忆，同一对象跨页一致，清楚区分保存/导出/分享与偏好修改/忘记反馈。 | 本轮批准前端切片；原52映射不变 |
| [IOS-012 #693](https://github.com/JTCAO515/VP-V4/issues/693) | ios / Main 已指定的独立前端 owner 01a1396d-7ce1-70a2-b495-745aca4d18db | B2 / P0 | 用户从助手头像进入详情，理解状态、活动、权限、待办与人格，并可跳过首次定制后继续主体验。 | 本轮批准前端切片；原52映射不变 |
