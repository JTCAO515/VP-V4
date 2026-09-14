# VPJ-03 数据政策披露矩阵 / Data Disclosure Matrix

Issue: [#190](https://github.com/JTCAO515/VP-V4/issues/190) · Program [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)

## 状态 / Status

本文档记录**当前代码库已验证的真实行为**，不新增功能、不代表已对外发布的产品承诺。
凡本仓库架构文档已将决定权明确保留给 operator 的事项（账号、地区、留存期限、合同、部署、对外承诺 —
见 `docs/architecture/ai-02-vp-final-disposition-matrix.md` Owner 行），本文档如实标注为
**「运营方待定」**，不代替 operator 做出该决定，也不发布为已生效的用户承诺。

This document records **verified current implementation behavior only**. It is not a new
feature and not a published product commitment. Any item this repository's own accepted
architecture reserves for the operator (account, region, retention term, contract, deployment,
public-promise — see `docs/architecture/ai-02-vp-final-disposition-matrix.md`, Owner line) is
marked **"Operator TBD"** below; this document does not make that decision on the operator's
behalf and is not published as a live user-facing commitment.

## 1. 告知与目的 / Disclosure and purpose

| 项目 | 中文 | English |
| --- | --- | --- |
| 收集内容 | 账号身份（邮箱/第三方登录）、Trip 内容与修订、对话 Turn、用户上传材料（图片/PDF）、隐私请求记录 | Account identity (email/OAuth), Trip content and revisions, chat Turns, uploaded material (image/PDF), privacy-request records |
| 用途 | 生成与维护用户自己的 Trip，回答用户提出的问题，处理用户发起的导出/删除请求 | Generating and maintaining the user's own Trip, answering the user's own questions, processing the user's own export/delete requests |
| 法律依据/商业主体 | 沿用已提供的经营主体设定，未新增主体 | Uses the already-provided operating entity; no new entity introduced |

来源：`docs/contracts/privacy-lifecycle.md`、`lib/server/model-gateway/`、`lib/server/media/private-media.ts`。

## 2. 保留期限 / Retention

- **Trip / Turn / Profile / Memory**：数据库中按 owner 隔离存储（RLS），当前代码库**没有**自动过期或定时清除这些表行的任何函数；保留期限为**运营方待定**，非本文档发布值。
- **备份（Backup）**：`docs/runbooks/backup-restore.md` 明确"不选定 Supabase plan/region，不设 RPO/RTO，不创建备份"，备份保留期限为**运营方待定**。
- **隐私请求收据（privacy request receipt）**：请求本身（`requested`/`not_started` 状态）永久保留为审计记录，不代表数据已删除——见下文第 5 节。

Retention for Trip/Turn/Profile/Memory rows and for backups is **Operator TBD**; no
auto-expiry function exists in the current codebase (verified by grep across
`supabase/migrations/`).

## 3. 处理地域 / Processing region

- Web 部署函数区域：`iad1`（Vercel），**不是** Supabase 项目所在地区，也**不构成**模型处理地区的证明（`docs/runbooks/staging-vercel-maintenance.md:21`）。
- Supabase 项目实际地区：**运营方待定**，本仓库未记录已选定值。
- 模型处理地域：见第 4 节，当前无生产模型调用，故无真实处理地域可披露。

Processing region is **Operator TBD** for both the database project and any live model call;
the only region fact currently verifiable in-repo (`iad1`, Vercel function region) is
explicitly documented as *not* the Supabase region and *not* proof of model-processing region.

## 4. 第三方 AI 接收方 / Third-party AI recipients

当前 `ModelGateway`（`docs/contracts/model-gateway.md`）**只是 TypeScript fixture**：

- 不发起任何真实供应商请求，不读取任何凭据/环境变量，没有供应商 SDK，不记录 prompt 或 response。
- 已登记（仅登记，非已接入）的候选供应商画像：DeepSeek（Flash/Pro/Vision）、Qwen 3.7 strict——均为 `fixture only` 或 `shadow only`，**没有一个是生产路由**。
- 上线任何真实供应商前，该文档明确要求"单独通过 Issue 完成真实协议一致性、地区/DPA 审批、无秘密处理、成本/延迟测量、可观测性与独立评审"。

**结论**：目前没有用户对话或材料被发送给任何第三方 AI 供应商——因为生产模型调用路径尚未启用。一旦启用，接收方名单以届时经批准的 `docs/contracts/model-gateway.md` 生产路由记录为准，须先完成上述审批。

No user conversation or material is currently sent to any third-party AI provider — no
production model-call path exists yet. When one is approved, the recipient list will be the
approved production route recorded in `docs/contracts/model-gateway.md`, gated on the review
steps that document already requires.

## 5. 撤回 / Withdrawal

- 用户可通过 `POST /api/privacy` 提交撤回意图（`action` 覆盖删除/导出），系统返回 `202 requested`/`not_started`（`docs/contracts/privacy-lifecycle.md`）。
- **当前这只是意图登记，不执行任何实际删除**：数据库里没有任何函数会删除 `user_profiles`／`memory_profiles`／`trips`／`turns`／`user_artifact`（`docs/runbooks/privacy-lifecycle.md`）。
- 在真正的执行器（executor）落地前，**不得**告诉用户"已删除"或"备份已清除"。

Withdrawal intent can be filed today; actual erasure execution is **not yet built** — this is
recorded honestly per the acceptance criteria's "unknown items stay unknown" rule, not omitted.

## 6. 删除 / 备份 / Deletion and backup

| 阶段 | 状态 |
| --- | --- |
| 请求登记 | 已实现（`V4-17`，owner-scoped，UUID 幂等） |
| 数据库行实际删除 | **未实现** |
| 加密导出交付 | **未实现** |
| 备份/副本清除 | **未实现**，保留期限运营方待定 |

## 7. 客服访问矩阵 / Support access matrix

在当前代码库中**没有找到**任何应用层"客服只读角色"（已检索 `ops_reader`、支持相关迁移，无匹配）。

| 角色 | 可见范围 |
| --- | --- |
| 用户本人 | 通过 RLS，仅自己的 Profile/Trip/Turn/隐私请求 |
| `service_role`（Supabase 后台） | 全表访问，仅可通过 Supabase 控制台/服务端密钥使用，无应用内客服界面 |
| 应用内"客服"角色 | **不存在**——Owner 角色不会被自动授予跨用户的普通读取权限（沿用 Issue 验收要求） |

No in-app support/ops read role exists in the codebase today; the only elevated access path is
Supabase's own `service_role`, reachable only via console/service key, not via any in-app
support surface.

## 8. 材料两路径 / Material paths

- **服务端路径**：`lib/server/media/private-media.ts` 定义 owner-scoped 私有 Storage 路径与准入策略，但当前 `preparePrivateMediaUpload` **始终返回 `media_unavailable`**——"尚不存在已认证的 actor 或服务端校验过的 PolicyReceipt 适配器"，即该路径代码存在但未授权可用。
- **设备端本地路径**：仓库中未找到独立于服务端存储的"仅设备本地"材料保存实现。
- **未授权时可用功能**：用户仍可在不上传材料的情况下使用文本 Trip/Ask 流程；上传材料的按钮/入口在未接入前不应展示为"已可用"。

## 9. Q36 基础明确偏好范围 / Q36 explicit-preference scope

沿用 2026-09-10 已确认方向（`docs/handoff.json` decisions）：

- Free 与 Pass 共享**明确保存**的基础跨 Trip 偏好；一个有界 service 目标包含必要澄清与系统修复。
- 存储/消费方与计费语义**需要版本化实现**（尚未落地）；新增容量、部分修改/TTL 与 Q38 激活**仍未决定**。
- 来源（用户主动填写 vs 模型推断）、纠正版本、模型与人工接收方、撤回后队列/缓存/派生物处理：按当前实现，模型接收方为 0（第 4 节），人工接收方为 0（第 7 节，无客服角色）；队列/缓存/派生物清理机制**未实现**——与第 5、6 节保留期限"运营方待定"一致，不重复承诺具体数字。

## 不构成的承诺 / What this document does not claim

本文档不发布具体保留天数、不指定 Supabase 地区、不批准任何生产模型路由、不新增客服角色。以上四项均为
operator 决定事项；若要将本文档转化为对外公开的隐私政策页面，需 operator 先行拍板这四项，再由此文档转为
面向用户的文案。

This document does not publish a retention day-count, does not name a Supabase region, does not
approve any production model route, and does not add a support role. Those four items remain
operator decisions; turning this into a public-facing privacy policy page requires the operator
to decide them first.

## 回滚 / Rollback

移除本文件即可；未修改任何运行时代码、迁移、路由或权限。

Removing this file fully reverts it; no runtime code, migration, route, or permission changed.
