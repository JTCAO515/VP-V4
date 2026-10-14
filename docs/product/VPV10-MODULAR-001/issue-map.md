# 当前开放 Issue 旧新映射

执行时读取 52 张开放票。每票保留 ID、原文全部字节和验收勾选；未修改 closed 票、评论、assignees 或原生依赖。已有 priority 标签的必要差异按 priority-readback.json 同步，其它标签保持。下面是正文规划映射，实际写入结果见 readback.json（存在后才构成写入证据）。

| Issue | 工程 | 优先 | 用户结果 | 复用与差距 |
| --- | --- | --- | --- | --- |
| #683 | Web | P0 | 交付可登录且真实问答的 QA Web | 复用既有 Vercel QA 分支和域名，补目标 Auth/provider/刷新/多轮完整读回；当前只记录部署适配计划 |
| #682 | Agent | P0 | 同 Session 的追问真正使用许可内历史 | 复用 qa-context/1 消费者；补真实 provider 多轮、隔离、纠正、拒绝与超时证据 |
| #681 | Web | P0 | 用户新建切换 Session 并刷新恢复消息 | 复用 /qa 与已合会话界面；补真实登录、首答和浏览器恢复证据 |
| #680 | Agent | P0 | 浏览器请求获得可持久读回的真实回答 | 复用 qa-agent、ModelGateway、持久 worker 与预算；补获准目标的真实首答和失败幂等证据 |
| #507 | iOS | P1 | 单图经校正和明确确认加入同一 Trip | 复用 Photo Picker/Vision 与 PR472/474；补真实登录→收件箱→Proposal→确认→双端重载 |
| #506 | iOS | P1 | Today 展示同版本日程和中文地址 | 复用 Today 证据函数；核中文地址 producer 和原 owner 交接，补确认 Trip 的原生展示 |
| #504 | shared | P1 | 用户删除 Trip 后收到可信回执 | 复用删除请求、执行与原生消费者；补真实取消/跨端/迟到响应和删除状态一致性 |
| #503 | shared | P1 | 一次官方测试购买在两端产生同源 grant | 复用 StoreKit 与权益投影；补官方测试购买链，不以本地 StoreKit 代替真实交易 |
| #367 | Agent | P1 | 地图主供应商失败时受控补查 | 复用高德/腾讯适配与原父票；补用途、成本、归因与降级实测 |
| #364 | iOS | P1 | 用户比较路线并导航到准确目的地 | 复用路线入口；补步行/公交/驾车与坐标实体的实际交接验证 |
| #363 | iOS | P1 | 搜索地点与地图始终选中同一实体 | 复用地点消歧、双语输入与地图；补跨语言实体同选中闭环 |
| #360 | Agent | P1 | 回答引用已发布 Wiki 和原子声明并说明缺口 | 复用知识检索与来源资格；补真实 consumer 的证据完整性和不可访问拒绝 |
| #359 | Agent | P1 | 新来源形成可审查并可发布的知识变更 | 复用现有 Wiki 生成和审核；补来源到发布版本链，不自动发布模型候选 |
| #268 | Agent | P1 | 按核心任务证据判断发布与停用恢复 | 复用 Harness 和运营合同；补实际候选/恢复证据，不能用矩阵通过冒充目标可用 |
| #267 | Agent | P1 | 对模型或提示词候选做可比评测 | 复用冻结案例与配对工具；补实际许可 provider 输入、usage 与校准，不改客户模型选择 |
| #266 | Agent | P1 | 取消与重连不伪造完成或重复提交 | 复用故障 Harness 与持久执行；补 #265 和规划恢复输入上的取消/未知结果链 |
| #265 | Agent | P1 | 少走路改稿保留已确认晚餐 | 复用 scoped-edit、TripProposal 和 Memory；补真实已有 Trip 的候选→diff→确认闭环 |
| #264 | Agent | P1 | 只读问答返回有依据结果与回执 | 复用文本 Harness 和知识消费者；补真实许可 provider 的来源、结果和拒绝证据 |
| #252 | shared | P2 | 凭经营证据决定年订阅与交易扩展 | 保留 activationEvidence；不把商业全矩阵前置到 QA 首答 |
| #251 | shared | P2 | 有需求证据时再设计 Android 与新语言 | 保留 activationEvidence；本轮不新建 Android/SDK 工程 |
| #250 | Agent | P2 | 授权航班变化触发相关行程重验 | 复用来源和影响合同；等待本票激活证据及 #249 实际数据，不制造状态 |
| #249 | Agent | P2 | 有证据时验证中国航线来源 | 保留来源用途、授权和激活条件；不把数据采购前置到三工程入口 |
| #248 | Agent | P2 | 真实召回失败时引入混合检索与重排 | 复用现有知识索引；先保留失败证据和 activationEvidence，不预先换架构 |
| #247 | shared | P1 | 观察真实激活、付费与人工成本 | 复用事件与经营定义；补真实发布后的观察，不把 synthetic 当经营结果 |
| #246 | shared | P1 | 两周客户发现产生可执行结论 | 复用既有试点和访谈定义；保留真人与对外联系授权边界 |
| #245 | shared | P1 | 用户收到产品后有支持和关账证据 | 复用运营交付链；补真实交付观察和回滚，不因工程拆分重做发布史 |
| #244 | iOS | P1 | 提交可审核的 App Store 1.0 | 复用已验签名/隐私/商品材料；补真实提交与审核权限，方向阶段不提交 |
| #243 | shared | P1 | 客户环境具备明确隔离与回滚能力 | 保留未来 Production 交付目标；当前 QA 固定共享 dzt，不在本轮新建库或迁移 |
| #242 | iOS | P1 | TestFlight 真机贯通规划准备与旅途 | 复用四 Tab 和已合功能；补真实设备整链，不把 iOS 总验收设为 Web 独立交付前置 |
| #237 | iOS | P1 | 获得签名 Archive 与可安装 TestFlight 包 | 复用已关闭 #508 的 unsigned Archive/CI 成果；补签名、上传与安装原范围 |
| #234 | Web | P1 | Web 用户独立完成同 Trip 规划与确认 | 复用 TripCanvas、成果工作区及既有 Web 验收；QA 首体验由 #680–#683 承担，不要求复制全套 iOS UI |
| #233 | iOS | P1 | 原生完整体验可访问且性能可接受 | 复用已合原生四 Tab/动效/组件；补实体 VoiceOver、性能与整链观察 |
| #232 | shared | P1 | 用户在境内外网络得到真实可用服务 | 按 iOS/Web/Agent 分别记录媒体酒店IAP通知网络证据；复用现有适配不推导全国覆盖 |
| #230 | shared | P1 | 恢复演练保持对象和删除状态一致 | 复用历史恢复工具与失败；保留原 Main A–D/条件 E，当前无 START/actual capture 不执行 |
| #229 | Agent | P1 | 运营看见质量成本故障并安全停用 | 保留 PR679/W2 安全暂停及全部未完成证据；不前置恢复整票到 QA 首答 |
| #227 | Agent | P1 | 完整任务额度与实际尝试成本受控 | 复用 durable budget/ServiceTask 账本；补消费与恢复边界，不重建账本或扩大收费 |
| #226 | shared | P1 | 官方购买与旧订阅得到同源权益 | 复用购买/权益合同与 #503；补原真实验收，三工程不各自创建权益权威 |
| #225 | shared | P1 | 用户理解 Free/订阅和旧 Pass 边界 | 复用现行商品策略；工程划分不改变定价与旧 Pass 兼容，不自动启用年订阅 |
| #222 | shared | P1 | 人工服务只访问按任务授予的资料 | 复用 ServiceCase 与许可；保持用户同意和接收方隔离，不让 Agent 默认读取私有资料 |
| #216 | iOS | P1 | 旅途中展示可信中英表达与大字卡 | 复用原生卡片和文本能力；补实际来源/语言/失败处理，媒体能力单独验证 |
| #212 | iOS | P1 | 酒店需求通过可信官方出口交接 | 复用酒店 allowlist/归因合同供双端消费；补参数实测，opened 不当 booked |
| #210 | iOS | P1 | 用户发现保存地点并交给 VP | 复用 Explore/地点/目标入口；补真实成果交接，不改 Trip 确认路径 |
| #209 | iOS | P1 | 地点消歧地图和路线出口保持一致 | 复用地图接口和 #363/#364；补准确实体/坐标/导航证据，provider 资格归 #208 |
| #208 | Agent | P1 | 高德主选腾讯补充具有用途与成本证据 | 复用既有供应商适配和 #367；补真实输入和许可范围，不额外采购 |
| #206 | Agent | P1 | 回答有依据且诚实显示部分答案和缺口 | 复用 evidence/eligibility/receipt；补当前 consumer 的真实引用与拒绝，文本成功不等于知识合格 |
| #205 | Agent | P1 | 旅程内容从登记来源到审核可用 | 复用来源和编辑审核工具；补真实来源权利、定位和发布收据，保留作者审核分离 |
| #203 | iOS | P1 | 首访委托与回访继续同一目标 | 复用 VPJ77 四 Tab 与 JourneyEntry；保留 E2 生命周期安全暂停，真实回访缺口不前置为全部 QA 阻塞 |
| #201 | iOS | P1 | 单张旅行截图经校正加入 Trip | 复用单图解析审阅及 #507；补许可内材料与确认链，不重做已否决 Docling |
| #200 | Agent | P1 | 图片语音 provider 中英数据流可验收 | 复用 C0 适配器；保留 DeepSeek HTTP400 与真实 Qwen UNRUN，文本资格不代媒体资格 |
| #199 | shared | P1 | 显式 Memory 影响结果且可纠正遗忘 | 复用唯一 Profile/Memory 权威与原生页面；补真实消费/撤回链，不复制画像库 |
| #195 | Agent | P1 | 持久文本任务执行并可恢复 | 复用完成文本纵切、hosted queue 和 worker；补剩余真实执行/恢复，QAWEB 是消费者不另建执行系统 |
| #187 | shared | P0 | 统筹三工程与首个真实可体验交付 | 保留全部历史成果；先方向/文档/开放票重排，再由唯一 Main 接续真实 ready 前沿 |

## shared 与酒店交接的主责分类

这是责任分类，不增加运行工程；业务数据、横向质量交付、产品运营分别由原 owner 承接，Main 只协调共享 lease。

| Issue | Category | Lead | Affected consumers |
| --- | --- | --- | --- |
| #504 | business-data | 删除与数据生命周期原 domain owner | iOS / Web / Agent |
| #503 | business-data | 购买与权益原 domain owner | iOS / Web |
| #252 | product-operations | 产品商业策略负责人（沿原决策归属） | iOS / Web / Agent |
| #251 | product-operations | 产品需求与语言范围负责人（沿原决策归属） | iOS / Web |
| #247 | product-operations | 经营观察原 owner | iOS / Web / Agent |
| #246 | product-operations | 客户发现原 owner | iOS / Web |
| #245 | quality-delivery | 发布交付与支持原 owner | iOS / Web / Agent |
| #243 | quality-delivery | Production 环境与回滚原 owner | iOS / Web / Agent |
| #232 | quality-delivery | 跨端网络验收原 owner | iOS / Web / Agent |
| #230 | quality-delivery | 恢复演练与数据生命周期原 owner | iOS / Web / Agent |
| #226 | business-data | 购买与权益原 domain owner | iOS / Web |
| #225 | product-operations | 商品策略原 owner | iOS / Web / Agent |
| #222 | business-data | ServiceCase 与资料许可原 domain owner | iOS / Web / Agent |
| #199 | business-data | Profile/Memory 原 domain owner | iOS / Web / Agent |
| #187 | product-operations | 唯一 Main 统筹，产品取舍沿 BestJ/CoolJ/JT 原职责 | iOS / Web / Agent |
| #212 | business-data | iOS 酒店交接原 owner（与 Web consumer owner 协作） | iOS / Web |
