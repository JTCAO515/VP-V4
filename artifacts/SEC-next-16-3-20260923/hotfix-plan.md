# Next.js 安全补丁：生产热修方案（待批准，未执行）

线程 T1，2026-09-23。本文件是**方案**，不是执行记录。本线程没有部署、提升、回滚任何环境，
也没有修改 Vercel 或 GitHub 配置。执行需 JT 明确批准（生产发布不属于开发授权，见 AGENTS.md 不变量）。

## 1. 生产现状（只读调查，2026-09-23 约 09:00 UTC）

| 项 | 观察结果 | 方法 |
| --- | --- | --- |
| 生产域名 | `https://vp-v4.vercel.app` | 仓库文档出现频次最高的生产 alias |
| 当前 deployment | `dpl_2WV2dky65LhMguX8QnFUhz6xPRKm` | 首页 `/_next/static/...?dpl=` 查询参数 |
| 运行的 Next 版本 | **16.2.6**（受 2 Critical / 多 High 影响） | 客户端 chunk 中 `version:"16.2.6"` |
| 首页缓存 age | 110867 s，即约 2026-09-22 02:13 UTC（10:13 +0800）首次写入 | `age` 响应头 |
| GitHub Production deployment 记录 | 最新是 f14ee46（9-16，`testing-chat` 分支），此后没有新记录 | `gh api .../deployments?environment=Production` |
| Vercel API | 不可用：MCP 连接器返回 403/404（不在该团队范围内），本机 `vercel` CLI 在代理下 `fetch failed` | — |

### 源提交推断（路由与文案指纹）

生产**不是** f14ee46：`/testing-chat` 返回 404，而 `/research`（9-17 781b3691 引入）存在。
按 main first-parent 顺序逐一探测 9-17 之后新增的路由：

| main 合并提交（+0800） | 标志 | 生产 |
| --- | --- | --- |
| 5f95d160 #481 09-22 04:37 | `/places` 200、`/api/places/lookup` 401、`/api/maps/display-config` 401 | 有 |
| 7a058275 #486 08:47 | `/api/trips/native/v2/x/archive` 503（handler 已执行） | 有 |
| 9782e0c1 #496 09:55 | `/api/privacy/native/v1/trips` 503 | 有 |
| a8fa82ad #499 10:02 | 仅服务端改动（Qwen endpoint 绑定），无外部标志 | 无法区分 |
| e7b6f35e #493 10:04 | `SavedAnswers` 新文案（如 "Points without current support"）未出现在生产 JS 中；同一文件的旧文案存在（已验证方法有效） | **无** |
| fa4b7f56 #501 10:07 | `/ops/budget` 的 "Attempt reconciliation" 文案不在生产 JS 中 | **无** |
| a3a69189 #502 10:08 | `/api/ops/community` 404（存在但关闭时应为 503） | **无** |
| 1433f3aa #512、f4c88a0f #485 等 | readiness（仅 POST，存在则 GET 应为 405）404、`/api/translate/policy` 404 | **无** |

**结论**：生产内容等同于 main 的 **9782e0c1 或 a8fa82ad**（两者之差只在服务端 Qwen endpoint 配置；
未设置 `VISEPANDA_QWEN_ENDPOINT` 时行为相同）。GitHub 上没有这次部署的 deployment 记录，说明它不是
Git 集成触发的，多半是 2026-09-22 约 10:00–10:13 +0800 通过 Vercel CLI/Dashboard 手动发布到 Production 的
（与 HANDOFF 记录的"冻结在 db5fb7b、main 自动 Production 已暂停"不一致）。
也不能排除它是从本地未提交的工作树发布的。**这一点只有 Vercel Dashboard 能确认**（见第 6 节）。

在 9782e0c1 上本地复现热修（第 3 节），路由指纹与生产一致：`/`、`/research`、`/auth/sign-in` 200，
`/api/intake` 405，`/api/ops/community` 404。

### 风险适用性（不夸大）

- GHSA-2xp9-vwfh-vxw4（Critical）：Image Optimization 优化 AVIF 时经 sharp/libheif 触发 RCE。Vercel 托管时
  `/_next/image` 由平台的图片优化处理，未必进入本应用的 sharp 路径；具体暴露面需以 Vercel 的说明为准，
  本线程**没有**验证。
- GHSA-p293-qw3h-jr36（Critical）：仅影响 Windows 文件系统托管，Vercel（Linux）大概率不适用。
- 其余 High（proxy bypass、Server Actions DoS/SSRF、rewrites SSRF）：项目没有 middleware、Server Actions、rewrites，
  实际暴露面有限；postcss/sharp 为构建期或图片路径依赖。
- 即便如此，生产仍在运行已公布 Critical 的版本，建议尽快热修。

## 2. 热修基点

1. **首选**：Vercel Dashboard 中 `dpl_2WV2dky65LhMguX8QnFUhz6xPRKm` 显示的源提交（Git SHA，或 CLI 上传时的
   `gitSource`）。如果它是 9782e0c1 或 a8fa82ad，就从该提交切分支。
2. **无法确认时**：从 **9782e0c1** 切。它是两个候选里较小的那个，不会给生产引入新能力。部署前先核对 Production
   环境变量里有没有 `VISEPANDA_QWEN_ENDPOINT`：如果**有**，说明生产很可能是 a8fa82ad，改从 a8fa82ad 切。
3. 如果 Dashboard 显示的是未提交的本地树，或是其他分支：停止执行，交协调者/JT 重新决定，不要猜。

分支名：`hotfix/next-16-3-6-20260923`（基点 + 1 个 cherry-pick）。

## 3. 热修只包含的改动

对 PR 分支的依赖提交（`fix(deps): upgrade next to 16.3.6 ...`）做 cherry-pick，只动 4 个文件：

- `package.json`：next 16.2.6→16.3.6；@playwright/test 1.55.0→1.55.1（仅 dev 依赖，保证 lockfile 一致、audit 清零）
- `pnpm-lock.yaml`：sharp 0.34.5→0.35.4，next 内的 postcss 8.4.31→8.5.23
- `docs/licenses/sbom.json`：next 版本（资产策略检查要求一致）
- `next-env.d.ts`：Next 16.3 生成的 root-params 类型引用

9782e0c1 与 main 的 `package.json` / `pnpm-lock.yaml` / `sbom.json` / `next-env.d.ts` / `next.config.ts` 完全相同，
所以 cherry-pick 没有冲突（已本地验证）。热修**不**包含 main 上 9782e0c1 之后的任何功能提交。

本地演练（`9782e0c1 + cherry-pick`，没有推送）：`pnpm install --frozen-lockfile` 正常；`pnpm audit --prod` 为 0；
lint、tsc、`next build --webpack`（Next.js 16.3.6）、static/design、unit 17 个文件、contract 127 个文件、e2e 34 个文件、
evals 16 个文件、check:assets、check:flags 均 PASS；security 与 integration 通过，但分别有 1 项、80 项 SKIP，
原因是缺少一次性 Supabase 目标（环境门控，与 main 同类）。

## 4. 执行步骤（需 JT 批准后由 JT 或其授权的操作者执行）

1. 确认基点（第 2 节）后执行：
   `git switch -c hotfix/next-16-3-6-20260923 <base> && git cherry-pick <PR 依赖提交 SHA>`
2. 推送分支（会触发 Vercel **Preview** 构建，不影响 Production），在 Preview URL 上跑第 5 节清单（登录态步骤可选）。
3. 从**干净的**该提交检出做 Production 构建，但暂不切域名：
   `vercel deploy --prod --skip-domain`（或在 Dashboard 中对该提交创建 Production deployment，不自动分配域名）。
   这样不需要解除"main 自动 Production 已暂停"的 guard，也不触碰 main。
4. 在新 deployment 的唯一 URL 上执行第 5 节"部署前"清单。
5. 通过后提升：`vercel promote <新 deployment URL>`，再对 `vp-v4.vercel.app` 执行第 5 节"部署后"清单。
6. 在 Issue/PR 中记录新旧 dpl ID、源提交、时间和清单结果。

## 5. 验证清单

现状基线（2026-09-23 实测，16.2.6）括注在后。

| # | 检查 | 期望 |
| --- | --- | --- |
| 1 | `GET /` | 200（基线 200） |
| 2 | `GET /research` | 200（基线 200） |
| 3 | `GET /auth/sign-in` | 200，登录页正常渲染（基线 200） |
| 4 | `GET /api/trips`（无 cookie） | **401**（基线 401） |
| 5 | `GET /api/intake` | **405**（基线 405） |
| 6 | 响应头 `/` | `strict-transport-security: max-age=63072000; includeSubDomains; preload`、`server: Vercel` 仍在；不出现 `x-powered-by`（基线不出现） |
| 7 | 路由指纹不变 | `/api/ops/community`、`/api/translate/policy` 仍为 404；`/api/places/lookup` 仍为 401（证明没有带入新功能） |
| 8 | 版本 | 首页 chunk 中为 `version:"16.3.6"`；`?dpl=` 变为新 ID |
| 9 | 浏览器 | 首页与 `/research` 在桌面和 390×844 下渲染正常，控制台无新增错误；JT 用自己的账号登录一次（可选，需本人操作） |
| 10 | 图片 | 页面中 `next/image` 图片正常加载（`/_next/image` 返回 200） |
| 11 | 观察 | 提升后 30 分钟内 Vercel runtime errors / 5xx 无异常增长 |

示例命令：
```sh
B=https://vp-v4.vercel.app
for p in / /research /auth/sign-in /api/trips /api/intake /api/ops/community /api/translate/policy /api/places/lookup; do
  printf '%-24s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done
curl -sI "$B/" | grep -iE '^(strict-transport-security|server|x-powered-by)'
```
如果唯一 deployment URL 开启了 Vercel Deployment Protection，部署前检查需在已登录的浏览器中进行，
或使用 JT 自己持有的 bypass 方式；不要把 token 写进仓库或聊天。

## 6. 回滚

- **回滚点**：`dpl_2WV2dky65LhMguX8QnFUhz6xPRKm`（当前生产，Next 16.2.6）。执行前在 Dashboard 中确认它仍然存在，并且是可回滚候选。
- **触发条件**：第 5 节第 1–8 项中任一项不符合期望，或提升后 5xx/错误明显增加。
- **步骤**：`vercel rollback dpl_2WV2dky65LhMguX8QnFUhz6xPRKm`（或在 Dashboard → Deployments → 该部署 → Promote/Instant Rollback），
  然后对 `vp-v4.vercel.app` 重跑第 5 节第 1–7 项，确认版本回到 16.2.6。
- 注意：Instant Rollback 之后 Vercel 会停止为后续 Production 构建自动分配域名，这与当前"暂停自动 Production"的意图一致，
  但需要在 HANDOFF 中如实记录（由 T6 统一更新）。
- 回滚只恢复到已知易受攻击的版本，属于临时措施；需要另行排查原因后再次热修。

## 7. 需要 JT 决定或处理

1. 在 Vercel Dashboard 确认 `dpl_2WV2dky65LhMguX8QnFUhz6xPRKm` 的源提交、创建者和方式，并核对 Production 是否设置了 `VISEPANDA_QWEN_ENDPOINT`。
2. 批准本热修（生产发布），指定执行人。
3. 决定 HANDOFF 中的"生产冻结于 db5fb7b"是否更正为实际状态（交 T6）。
4. 当前 Vercel MCP 连接器看不到 `team_vLT8SL2mQJJSnXbD9GzVLP4K`。如果希望后续线程能做只读核对，需要 JT 调整连接器范围（本线程没有改动）。
