# VP-V4 当前三工程交付计划

生成自 current-plan.json。原52是迁移输入；当前35张工程任务加原Program，不以固定数量验收。

## B1

先复用已可体验 sample，同时补真实QA闭环；恢复只在原门禁与新有效窗口内由Main执行。

WEB-001样例后续与AGENT-001/002真实链、AGENT-011恢复诊断准备可独立推进；实际资源写入串行。

## B2

真实结果接入同Trip规划、Memory、地点/材料和原生旅途功能。

按可用端口分配iOS/Web/Agent owner，不等待全部B1/B2任务关票。

## B3

跨端真实质量、TestFlight、生产发布与客户观察。

签名准备、质量与产品协调可先准备；真实发布仍按原具体门禁。

## EXPAND

只有原activationEvidence满足才考虑扩展。

不是当前实现承诺。

| ID / GitHub | 工程 / 主责 | 批次 / 优先 | 用户结果 | 原票承接 |
| --- | --- | --- | --- | --- |
| [PROGRAM #187](https://github.com/JTCAO515/VP-V4/issues/187) | agent / 唯一 Main；产品取舍沿 BestJ/CoolJ/JT | OVERVIEW / P0 | 先看到可体验样例，再获得真实 Agent 问答，再扩展同 Trip 结果和原生旅途体验 | #187 |
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
| [IOS-001 #203](https://github.com/JTCAO515/VP-V4/issues/203) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 首访委托和回访继续同一旅程目标 | #203 |
| [IOS-002 #201](https://github.com/JTCAO515/VP-V4/issues/201) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 单张截图经校正和明确确认加入同一 Trip | #201, #507 |
| [IOS-003 #209](https://github.com/JTCAO515/VP-V4/issues/209) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 地点发现保存消歧和导航保持同一准确实体 | #209, #363, #364, #210 |
| [IOS-004 #506](https://github.com/JTCAO515/VP-V4/issues/506) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | Today 显示确认版本行程和中文地址 | #506 |
| [IOS-005 #216](https://github.com/JTCAO515/VP-V4/issues/216) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 旅途中以可信中英表达和大字卡沟通 | #216 |
| [IOS-006 #212](https://github.com/JTCAO515/VP-V4/issues/212) | ios / iOS 酒店交接原 owner（与 Web consumer owner 协作） | B2 / P1 | 酒店官方出口在原生与 Web 正确交接 | #212 |
| [IOS-007 #237](https://github.com/JTCAO515/VP-V4/issues/237) | ios / ios 原实施 owner，Main 按现 lease 协调 | B2 / P1 | 签名 Archive 产出可安装 TestFlight 包 | #237 |
| [IOS-008 #233](https://github.com/JTCAO515/VP-V4/issues/233) | ios / ios 原实施 owner，Main 按现 lease 协调 | B3 / P1 | 原生整链交互可访问且性能可接受 | #233 |
| [IOS-009 #242](https://github.com/JTCAO515/VP-V4/issues/242) | ios / ios 原实施 owner，Main 按现 lease 协调 | B3 / P1 | TestFlight 真机贯通规划准备与旅途 | #242 |
| [IOS-010 #244](https://github.com/JTCAO515/VP-V4/issues/244) | ios / ios 原实施 owner，Main 按现 lease 协调 | B3 / P1 | 满足原门禁后完成 App Store 1.0 审核交付 | #244 |
| [WEB-001 #681](https://github.com/JTCAO515/VP-V4/issues/681) | web / web 原实施 owner，Main 按现 lease 协调 | B1 / P0 | 从已可体验样例走向真实持久会话 | #681 |
| [WEB-002 #234](https://github.com/JTCAO515/VP-V4/issues/234) | web / web 原实施 owner，Main 按现 lease 协调 | B2 / P1 | Web 独立完成同 Trip 规划成果审阅与确认 | #234 |
| [WEB-003 #683](https://github.com/JTCAO515/VP-V4/issues/683) | web / web 原实施 owner，Main 按现 lease 协调 | B1 / P0 | QA Web 交付版本与真实问答验收一致 | #683 |
