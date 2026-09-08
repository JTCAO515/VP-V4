# VisePanda Journey 网页概念

入口 `/journey` 与 `/journey/plan`。用户于 2026-09-06 授权 Journey 双语网页、完整 Early Access Demo 的预览迁移及 GitHub main 合并；随后将 Landing 的 Profile 改为 Early Access，直达指定 JotForm。保留原首页与原有五语体验，不连接真实 AI、账号、行程、预订、支付服务。这是明确授权的隔离预览，不是 VPJ-41 真实同 Trip 验收，不关闭其依赖或 Issue。

## 设计与素材

- 参考 [Awwwards: Rhythm of Nature](https://www.awwwards.com/sites/rhythm-of-nature) 的自然叙事。使用独立生成素材，未复用其图片或代码。
- 暖白 `#f7f5ee`、墨绿 `#203a31`、朱红 `#ad4936`；Georgia / 系统宋体用于展示文字，Avenir Next / 平台系统字体用于界面，不新增字体文件。
- 原本地探索中的五张 `*-concept.png` 不导入正式仓库；实际页面使用可编辑双语文本。
- 页面素材：`public/assets/visepanda/journey/{guilin,hangzhou,shanghai}.png`，均为本次内置 ImageGen 生成的目的地意境图，不是实地拍摄证据。
- 图片三份 SHA 登记在 `docs/licenses/WEB-04-quarantine.json`，只允许预览，公开发布仍受权利审核门禁。正文及无障碍标签在 `lib/journey-copy.ts`；Demo 文案在 `lib/journey-preview/`。

## 交互边界

Landing Ask 保留三个灵感示例与未接入 AI 的诚实降级，主 CTA 进入 `/journey/plan?lang=en|zh`。Explore 保留筛选、收藏和故事弹窗。原 Profile 区改为 Early Access，不假装已创建账号；JotForm 在新标签打开，不传入对话或个人数据。

Studio 源自 `JTCAO515/VP-Early-Access@5d8a60c72f2b8a4dc970d532159a8bfa43c7beef` 的完整交互模块与 fixture 数据：Today、Ask、Copilot、Tools、Explore、User 及 11 个示例会话。只移植演示行为，不导入源站设计资产、头像、旧品牌样式、表单提交或后台。所有 CSS 限定 `.journey-preview`，不修改全局主题、原有产品 API 或真实数据合同。

- 自由输入产生明确标为“非 AI”的本地备注提议；确认后加入 Canvas 备注，可编辑、移除。未确认不添加，不改动示例日程。
- 原示例 diff 接受／拒绝只记录预览选择，批量接受不覆盖拒绝；可重置。版本下拉只展示说明，不声称回滚行程。
- React Activity 保持会话及模块状态，语言切换不清除；整页刷新重置。没有 localStorage、模型请求、账号保存或同 Trip 持久化。
- 账户、来源、置信度、价格、医疗／无障碍／签证等信息全部是 fixture，不能作为旅行事实；各界面保留常驻预览标记。静态地图是示意图，不是实时地图。
- 撤销方式：回退此隔离预览提交；不涉及迁移或用户数据。

动效：首屏文字错峰入场、主图揭示与轻微滚动视差、一次性滚动揭示、图片悬停、按钮按压、筛选入场与阅读进度。支持 `prefers-reduced-motion`，触屏不启用鼠标悬停位移动效。

## 图片生成提示词

### guilin

Use case: photorealistic-natural. Project asset: VisePanda immersive China travel website hero, wide 16:9 landscape editorial photograph. A serene Li River inspired scene near Guilin, layers of tall jade karst peaks dissolve into cool dawn mist, a tiny solitary bamboo raft with one traveler on a still river near lower right, foreground trees at edges. Soft ivory sky, deep forest foliage, muted celadon water. Cinematic analog medium format photography, subtle film grain, natural atmospheric depth, high dynamic range but not oversaturated. Beautiful realistic landscape, ample open sky and river, no text, no logos, no UI, no border. Generated destination inspiration, not documentary.

### hangzhou

Use case: photorealistic-natural. Project asset for VisePanda editorial travel web design. Portrait 3:4 cinematic film photograph of lush Longjing-inspired Hangzhou tea terraces curving over hills, stone path winding through tea bushes, tiny traditional pavilion in distance, pale morning mist and warm diffused sunshine. Deep moss green, jade, dusty ivory. High-end travel magazine photography, tranquil authentic natural feeling, no text, no people close-up, no collage, no UI.

### shanghai

Use case: photorealistic-natural. Project asset VisePanda China travel editorial website. Portrait 3:4 cinematic medium format analog photo of a quiet Shanghai-inspired leafy old neighborhood street after gentle rain. A lone bicycle at a cafe, plane tree canopy, warm muted red and tan historic facades, distant modern skyline softly blurred. Intimate human-scale China, dark evergreen shadows and warm brick, delicate grain, excellent editorial composition, not a landmark mashup. No text, no logos, no signs with readable writing, no border, no UI.



## 原本地概念验证（历史，非本次迁移验收）

- 原工作区依赖读取阻塞：Next/TypeScript 进程停在文件读取，未进入有效编译。保留原依赖，使用独立目录 `/Users/jtcao/.codex/preview-runs/vp-journey-20260906` 和原锁文件重新安装依赖；所验运行源码与本工作区一致，排除了不属于主应用的 Marketing 子项目。
- `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；原首页 12/12 测试通过。测试的 CSS 定位改为读取首页实际引用的文件，避免新增路由后随机选到另一份 CSS。
- 内置浏览器：1280×720 桌面及 390×844 手机，中英文均无横向溢出；全部生成图片正常加载，应用控制台无错误或警告。
- 实测：3 个 Ask 示例、任意输入的诚实降级提示、空输入禁用、清空对话、3 类 Explore 筛选、收藏与 Profile 同步、偏好切换、故事弹窗、Escape 关闭与焦点恢复、手机菜单和关闭、刷新后重置。
- 减少动态效果模式实测：标题动画为 `none`、主图 transform 为 `none`、滚动内容保持可见。
- 视觉检查修复了弹窗默认位置、输入焦点框、中文 Profile 断行及原站全局 footer 网格样式对新版的影响。图片设计参考与实际浏览器截图已分别检查。
- 本地预览使用 `pnpm start --hostname 127.0.0.1 --port 3100`。如预览服务结束，在上述独立目录重新运行此命令即可。

## 本次迁移验证（2026-09-08）

- 目标工作树 `codex/journey-planning-preview`，从已合并规划基线 `9a3b724` 建立；原用户工作区和 VP-Early-Access 源仓库未改动。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`（22/22）、`pnpm check:assets`、`pnpm docs:check`、`git diff --check` 通过。
- `pnpm exec playwright test tests/e2e/frontend/journey-preview.spec.mjs --workers=1`：4/4 通过。桌面 1280×800 与手机 390×844，覆盖六区切换、备注确认前不写入、确认后保留、diff 拒绝不被批量接受覆盖、重置、地图/预订、双语与刷新、Explore 提议后确认、Tools 一次性深链、JotForm 链接及无 API 请求。
- 内置浏览器已检查桌面和手机：修复固定 aspect-ratio 导致的桌面溢出、旧 mobile min-height 裁切输入、POI 抽屉宽度及按钮被底栏遮挡；地图路线/编号和城市选中文字对比已修正。
- 独立只读审查指出的 Tools 旧请求重放、Explore 虚假添加成功与两项调色问题已修复并复审。账户保存/删除文案也改成明确的演示行为。
- 本地 Node 26 的 Playwright 下载解压停滞；改用已安装的 bundled Node 24 执行官方 Playwright 安装命令成功。测试本身用项目原有命令，不改依赖或 CI 配置。
- 新预览：本工作树 `pnpm start --port 3101`，入口 `/journey`、`/journey/plan`。原 3100 概念预览不覆盖。
- 未运行/不属于本次：真实模型、数据库持久化、native build、同 Trip、供应商交易、JotForm 提交或生产发布。生成素材仍列入 blockedReleaseFiles；PR 的完整 CI 结果须独立读取。
