# VP-V4 — VisePanda 前端内容原型

一个基于 Next.js App Router、React、TypeScript 与 Tailwind CSS 的 frontend-only VisePanda 内容与交互原型。它演示 Planner、Trip Canvas 与 Today 的产品叙事，不连接真实 AI、账号、Trip、预订、付款或持久化服务。

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

- `implemented`：响应式前端页面、Prompt 本地状态、菜单、弹层、轮播、FAQ 与提示反馈。
- `placeholder`：Planner、Trip Canvas、Today、语言、显示偏好与隐私控制均为前端预览。
- `not connected`：真实 AI、账号、Trip 数据、预订、付款、伙伴接口、Human Help 与持久化服务。

## 不可发布原因

当前页面仍使用参考站点来源的图片、视频、人物、Logo 与字体。本轮只完成技术栈迁移和 VisePanda 文案草稿，不能据此声称品牌迁移、资产权利清理或生产发布已经完成。

下一步必须单独进行资产、品牌、交互真实性与发布边界审查。
