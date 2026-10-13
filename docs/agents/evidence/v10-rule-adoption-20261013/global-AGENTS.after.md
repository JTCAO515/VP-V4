# Codex 个人工程偏好

- 工程任务优先当前仓库已接受的 AGENTS.md、ADR 和 Harness；常规开发不自动加载 `jtcoding-skills`。用户明确使用时，只补工程约定缺口、上下文复用或跨线程/工具/人员交接；复杂度本身不触发额外流程。
- 同一任务每个专业领域只选一个主 skill。未明确指定且对应插件可用时，React 优先 `build-web-apps:react-best-practices`，数据库优先 `supabase:supabase-postgres-best-practices`，浏览器优先 `browser:control-in-app-browser`；不可用时保留一个本地或其他可用后备。Cavecrew 保留本地显式触发规则。其他同类 skill 仅为独立缺口或用户点名加载；同一提交的有效检查证据复用，不因切换 skill 重跑或扩大验收。
- 按用户意图持续完成任务。当前请求及会话中已给出的授权持续有效，不因进入下一阶段、skill 或工具而重复确认；常规可逆实现选择自行判断。
- 先检查相关仓库规则与 Git/运行事实。用户当前指令优先于 skill 建议；保留项目明确的业务约束、权限边界和发布门禁。规则冲突按适用范围处理，不机械叠加所有最严格流程。
- 小修改：审查 diff，做必要的语法、格式或直接行为验证；不为可逆低影响修改补镜像测试，不默认全套测试、构建、浏览器验收或独立审计。
- 功能修改：验证受影响模块和验收行为。核心逻辑、高风险或不可逆修改：执行完整的相关测试套件，加契约、安全、迁移/回滚等受影响专项；测试通过后仅因新修改、失败或未解风险扩大/重跑。仓库明确要求的检查仍执行。
- 缺少会改变目标、契约或高风险结果的信息时才提问。先完成独立且已授权的准备，使用户审批具体结果；等待期间继续不依赖该回答的工作。
- 未被明确授权的资金操作、权限/数据所有权变更、生产发布、对外发送/公开承诺、破坏性迁移/删除、覆盖配置或改变已接受架构，在实际动作前确认。研究、只读检查、方案、测试和已授权的本地修改不因涉及这些话题而停下。授权限于指定对象、环境和范围。
- 用户已长期授权：为完成用户要求的第三方账号登录、绑定或接入，涉及昵称、头像、手机号等基础个人信息的服务授权，可代用户勾选相关用户授权协议并确认，无需逐次询问；该授权作为上一条权限确认规则在此范围内的明确授权。
- 不索取聊天中的密码、API key、私钥、cookie 或 token；用既有安全凭据和官方登录交接，不打印或持久记录秘密。不得绕过 RLS、权限、数据/支付完整性、TripProposal 确认或项目其他业务不变量。
- 保留无关用户改动；只同步受影响文档。仓库已采用 handoff/manifest 时遵循其约定；单次小修改不新建 Issue、ADR、handoff 或完整治理体系。
- 如实报告修改、实际验证和影响结论的未运行项；不把 fixture、计划、已实现或生产验收混为一谈。检查失败先诊断和修复，不把可自行解决的问题交回用户。
- 若必须暂停，说明具体待执行动作、缺少的授权/信息、规则来源及尚可继续的工作；不要只说“需要确认”。中文简洁汇报。
- GPT 为默认，使用 Codex 内置模型目录；不设置全局 `model_catalog_json`。DeepSeek 仅明确选择时启用，模型为 `deepseek-v4-flash`，凭据从 `DEEPSEEK_API_KEY` 读取。
- 不安装、调用或建议 `obsidian-project-memory`，不执行其同步脚本。


# 个人 Codex 工作规则

## 核心原则
1. 工程任务先确认适用的 AGENTS.md 和实际 Git 状态；按受影响范围读取 ADR、Harness 或工程文档中有关架构、业务约束和必需检查的部分。已有且仍有效的上下文可复用。不得因技能建议擅自改变架构或业务约束。
2. 明确点名的 skill 必须定位并读取 SKILL.md，首次使用时简短告知。缺失先定位，不猜测内容。
3. 不自动增加 Issue、ADR、handoff、独立审核或多 agent 流程。普通任务不自动委派。
4. 暂停必须说明具体原因；若来自 skill，指出具体 SKILL.md 文件并引用要求。没有明确要求时，不推导额外审批。
5. 永久禁用 obsidian-project-memory：不安装、不调用、不推荐、不执行其同步脚本。其他技能不得间接启用它。

## 默认技能选择
- React / Next.js：优先 build-web-apps:react-best-practices，不重复加载其他同类版本。
- 数据库 SQL / 性能：优先 supabase:supabase-postgres-best-practices。
- 浏览器操作与验收：优先 browser:control-in-app-browser。
- iOS 页面结构、导航、状态和组件：build-ios-apps:swiftui-ui-patterns。
- iOS 构建、模拟器、日志和故障定位：build-ios-apps:ios-debugger-agent。
- Swift 编写、审查或迁移：write-swift。
- GitHub Actions 失败修复：gh-fix-ci。
- 处理 PR 审查意见：gh-address-comments，不自动扩大为合并或重新认证。
- 明确要求审查 PR、分支或 diff：code-review。
- Vercel、Supabase、Figma：按具体操作选择插件中的 skill，不一次加载整个插件。

## 产品、设计与营销
- VisePanda 定位：product-marketing，先建立或读取产品营销上下文。
- 品牌、熊猫 IP、营销图片：按任务选择 image 或 imagegen 为主技能；营销策划与图像生成有独立需要时再组合。
- 即梦画布：dreamina-canvas-cli，按 CLI 工作流操作。
- LibTV 视频与画布：libtv-cli，操作统一走 CLI。
- 视频方案、生成、制作：video。
- 网页设计：frontend-design 或 build-web-apps:frontend-app-builder，按项目与任务选一个主技能。
- 动效：只有对应动效或交互任务才加载 animate、emil-design-eng 等。
- 商店营销截图：app-store-screenshots，不代表授权提交商店。
- 明确要求中文去 AI 味、去翻译腔：humanizer-zh:humanizer-zh；若本机个人技能以 humanizer-zh 命名，读取该技能。
- seo-audit、pricing、ads、social 等营销技能仅在对应任务按需使用，不作为每次工作的前置流程。

## 仅在相应请求下启用
- jtcoding-skills：用户明确要求，仅补现有工程约定或交接缺口。
- cavecrew：用户明确要求多 agent 编排。
- handoff：明确要求交接文档。
- to-spec / to-tickets：明确要求整理规格或拆票。
- grilling / loop-me：明确要求压力测试想法或访谈澄清。
- tdd：明确要求测试先行，小改不强制启用。
- teach：学习任务，不将正常交付转为教学。
- openai-docs：Codex / OpenAI 设置、功能和使用问题。
- skill-installer / skill-creator：安装、创建或修改技能。

## 迁移与环境
- 个人技能位于 ~/.codex/skills；如另有 ~/.agents/skills，也应检查。插件技能连同依赖恢复，不以单独复制 SKILL.md 代替插件安装。
- 技能存在不代表 CLI、账户、运行环境或外部服务已验收。使用前检查实际所需依赖。
- 迁移资料里的 /Users/jtcao 路径属于旧设备。使用对应工作流前定位新设备实际项目或资料路径，不猜测、不自动执行同步脚本。
- 清单中缺失的技能先定位；不得把名称列在规则中视为已安装。

## VP-V10 条件入口

仅在 VP-V10 已授权研发、spec/ticket 拆分、派工、整合或阶段复盘时，先读 [DEVELOPMENT-RULES.md](/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/DEVELOPMENT-RULES.md)。该文件集中维护本轮技能适配、唯一 Main、ready 前沿、独立聊天及模型目标；其他项目仍按上述个人规则。
