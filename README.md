# VisePanda — 来华自由行的 AI 规划与执行工作台

VisePanda 面向来中国独立旅行的国际游客，将对话式规划、可见行程和旅途中执行支持放在同一个工作台中。产品目标不是批量生成行程文字，而是帮助旅行者把每天的计划看清楚、确认变化，并在支付、网络、入场、地址和沟通等真实场景中找到可信的下一步或恢复路径。

本仓库是 VisePanda 落地页与交互体验的 frontend-only 实现。当前页面用于表达产品定位、能力边界和 Early Access 状态，不连接真实 AI、账号、Trip 数据、库存、预订、付款或持久化服务。

## 产品体验

- **Chatbot**：理解城市、日期、节奏、兴趣和限制，形成可供检查的候选计划。
- **Trip Canvas**：逐日展示地点、路线、准备状态和待确认变化，是用户可见的当前行程。
- **Today**：旅途中只突出一个符合资格的下一步；事实不足时明确说明缺失，并提供安全替代或恢复路径。
- **可信执行事实**：支付、中文地址、入场、网络和沟通信息需要来源、适用范围、复核时间和过期状态。
- **五语界面**：支持中文、英语、西班牙语、俄语和阿拉伯语；阿拉伯语启用 RTL。
- **本地化导航**：根据界面语言显示中国、美国、西班牙、俄罗斯或沙特阿拉伯国旗，以及对应的 `¥`、`$`、`€`、`₽`、`ر.س` 货币符号。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript（strict）
- Tailwind CSS v4 + PostCSS
- `next/image` 与 `next/font/local`

`app/page.tsx` 保持为 Server Component；页面交互集中在 `components/VisePandaLanding.tsx` 的显式 Client Component 中。`lib/i18n.ts` 维护五种语言的类型化界面文案，`app/globals.css` 负责当前落地页的响应式视觉层。

## 本地运行

```bash
pnpm install --frozen-lockfile
pnpm dev
```

默认开发地址为 `http://localhost:3000`。Vercel 部署时 Framework Preset 选择 **Next.js**，Root Directory 使用仓库根目录，其余构建设置保持自动检测即可。

## 验证

```bash
pnpm check
```

该命令依次执行：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

前端变更还需补充桌面端、390 × 844 移动端、五语切换、阿拉伯语 RTL、控制台错误和内容溢出检查。

## 项目结构

```text
app/                         Next.js 路由、布局与全局样式
components/                  页面交互组件与图标
lib/i18n.ts                  五语文案、国旗和货币符号配置
public/assets/visepanda/     VisePanda 中国旅行视觉资产
tests/                       静态输出与产品边界回归测试
docs/adr/                    已接受的技术与产品界面决策
docs/handoff.json            可机读交接状态
CONTEXT.md / HANDOFF.md      当前上下文与人工交接摘要
```

## 当前成熟度边界

- `implemented`：响应式落地页、Prompt 本地状态、菜单、弹层、轮播、10 项 FAQ、五语切换、阿拉伯语 RTL、语言国旗和本地货币入口。
- `placeholder`：Planner、Trip Canvas、Today、显示偏好与隐私控制仍是前端产品预览。
- `not connected`：真实 AI、账号、Trip 数据、预订、付款、伙伴接口、Human Help 与持久化服务。

生产发布前仍需确认本地字体文件与形状遮罩的使用权，并完成真实浏览器和目标部署环境验收。页面不得把预览能力描述为已经接通的生产服务。

## 继续开发

开始修改前依次阅读：

1. `AGENTS.md`
2. `CONTEXT.md`
3. `HANDOFF.md`
4. `docs/handoff.json`
5. 与任务相关的 ADR

完成修改后同步代码、测试和交接文档，并如实记录未运行的验证与剩余风险。
