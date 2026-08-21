# VP-V4 — VisePanda 前端内容原型

一个基于 Next.js App Router、React、TypeScript 与 Tailwind CSS 的 frontend-only VisePanda 内容与交互原型。它演示 Planner、Trip Canvas 与 Today 的产品叙事，不连接真实 AI、账号、Trip、预订、付款或持久化服务。

当前版本已完成顶部与页脚 VisePanda 字标、面向国际自由行旅客的中国旅行视觉资产、中文/英语/西班牙语/俄语/阿拉伯语界面切换，以及阿拉伯语 RTL 布局。原参考站点的投资者/媒体 Logo 墙和“四件我们不会提前承诺的事”章节已移除。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript（strict）
- Tailwind CSS v4 + PostCSS
- `next/image` 与 `next/font/local`

Tailwind 负责全局基础与主题 token；为避免本轮框架迁移意外改变已验收布局，`app/globals.css` 暂时保留原型的高保真兼容样式。

## 本地运行

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## 当前边界

- `implemented`：响应式前端页面、Prompt 本地状态、菜单、弹层、轮播、FAQ、提示反馈、五种界面语言切换与阿拉伯语 RTL。
- `placeholder`：Planner、Trip Canvas、Today、显示偏好与隐私控制均为前端预览。
- `not connected`：真实 AI、账号、Trip 数据、预订、付款、伙伴接口、Human Help 与持久化服务。

## 发布前边界

页面已不再运行时加载 Layla 图片、视频、人物或 Logo；新的中国旅行照片由本轮 ImageGen 生成并存入 `public/assets/visepanda/`。为了满足“同样字体”的要求，页面仍保留既有本地字体文件，四个外形裁切 SVG 也沿用原视觉格式，因此在公开发布前仍需完成字体和形状资产权利审查。

真实产品接口仍未连接，浏览器视觉与交互 QA 也需在允许本地端口的环境中补跑；生产部署前必须单独确认这两项。
