# VisePanda. 正式 Logo：爱心金属版

项目方在本会话确认爱心版为正式 Logo，随后要求精修为 8K、上传 GitHub 并替换旧 Logo。2026-09-13 登记本次交付。

![完整 Logo](../../../../public/assets/visepanda/brand/primary-heart-20260913.png)

## 四种素材

- `primary`：完整竖版，适合品牌展示。
- `wordmark`：单文字 **VisePanda.**，包含 i 上方爱心、末尾红色球形句点和红色弧线。
- `icon`：无文字熊猫/手机/飞机/轨道/定位图标，适合头像和紧凑品牌位置。
- `horizontal`：左图右字横版，适合宽幅展示。

| 文件 | 尺寸 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| [VisePanda-horizontal-8K.png](VisePanda-horizontal-8K.png) | 8192 × 2738 | 10,147,752 | `48d808dee7ebe45998506693f142f20969353846c6f83ef0fd97b06c73f425e6` |
| [VisePanda-icon-8K.png](VisePanda-icon-8K.png) | 8192 × 8192 | 26,362,008 | `a3e68ba8325f18fb30a9234c56ac57cda9b7e0781ea8a1d2ae255aee395f3755` |
| [VisePanda-primary-8K.png](VisePanda-primary-8K.png) | 8192 × 8192 | 29,980,164 | `c3ca188cfb34072ec5228180de59303b3c1e664f450d258db719e260b3756b13` |
| [VisePanda-wordmark-8K.png](VisePanda-wordmark-8K.png) | 8192 × 2730 | 10,295,289 | `9b1d76735dcf261947739919562b26c3aeebf2a609107a926205f877aedde835` |

## 清晰度与来源

四份源稿保留用户交付的 8K PNG 字节，均为实际 RGBA 透明底。制作方式为 Codex 内置 imagegen 精修毛发、金属轮廓及文字后去背景，再以 macOS sips 重采样至长边 8192 像素。**不是原生 8K 渲染，不是矢量稿**；新增像素不代表原生细节。原始生成尺寸约 1254×1254 或 2172×724。生成式精修与不同版式间存在少量毛发、字形和光影差异。本轮仓库集成不再次使用 AI 重绘。

设计约束：红色 Vise、深色金属 Panda、i 上爱心、红色句点；保留手机、熊猫、长城、飞机及轨道。避免拉伸、改字、重新生成或改变红黑配色。小尺寸优先无文字图标，不将完整字标塞入小头像。

## 产品运行文件

运行文件位于 `public/assets/visepanda/brand/*-heart-20260913.png`，由上述源稿等比 Lanczos 缩小，保留透明通道：完整版 1024px、图标 512px、字标 1200px、横版 1600px。另有 64px 网站图标和 180px Apple touch 图标。不要在 Web/iOS 页面加载本目录几十 MB 的 8K 源稿。

Web `VisePandaMark` 显示完整 3:1 字标，移除旧版专用裁切。聊天/演示头像使用无文字图标，布局元数据指向小尺寸图标。

iOS `PandaMark` 与 `BrandWordmark` 已替换；字标同样改为完整 3:1 显示。`AppIcon` 为 1024×1024 RGB：无文字图标居中于浅米白背景，保留安全留白。**AppIcon 是平台适配的有底衍生物，四份源稿和其他运行 PNG 仍透明。**

## 旧版、登记与回滚

旧版源稿和日期命名文件保留以便追溯；Git 历史保留被替换的 iOS 资源。早期 VI 指南、社媒样稿和历史证据可能展示旧 Logo，它们不是当前标识来源，也不在本次重新排版范围。

`brand/qa/asset-manifest.json`、`docs/licenses/asset-rights-ledger.json` 与 `docs/licenses/journey-public-web.json` 登记文件、来源、哈希及本次项目方替换授权。回滚使用本次提交的 Git revert，恢复引用、样式、iOS 图像与登记，不删除历史源稿。

本次交付为仓库资源与引用更新，不代表已在生产网站或 App Store 发布。验证结果见 [本次验证记录](../../../../artifacts/brand-heart-20260913/README.md)。
