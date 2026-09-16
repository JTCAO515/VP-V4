# VPJ-03 数据政策披露矩阵 / Data Disclosure Matrix

Issue: [#190](https://github.com/JTCAO515/VP-V4/issues/190) · Program [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)

**2026-09-16 审阅修正**：以当前源码入口和已归档运行证据为准，区分传输能力、历史实测与当前部署。
原复核遗漏了 `lib/server/jobs/run-staging-text-worker.mjs` 和 `run-staging-text-service.mjs`，
不能据其搜索结果断言“零真实接收方”。本次不执行模型调用或修改运行配置。

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
- **隐私请求收据（privacy request receipt）**：请求本身按当前实现保存为审计记录（`requested`/`not_started` 状态）；此处不承诺永久保留，不代表数据已删除——见下文第 5 节。

Retention for Trip/Turn/Profile/Memory rows and for backups is **Operator TBD**; no
auto-expiry function exists in the current codebase (verified by grep across
`supabase/migrations/`).

## 3. 处理地域 / Processing region

- 既有 Vercel 检查记录的 `iad1` 是当时的函数配置，不代表所有当前 worker、数据库或模型处理地区。
- `artifacts/VPJ-74/restore-rehearsal-20260914.md` 记录隔离恢复项目采用与当时 Staging 相同的
  `ap-southeast-1`。本次未重新查询当前数据库/备份配置，不能据此声称当前全部数据路径已核验。
- 模型处理地域按具体环境、policy、endpoint和运行证据记录；无法核实的供应商内部处理、留存或训练信息标记 unknown。

Historical deployment and restore records are scoped to their recorded environments and dates.
Current database, worker, backup and provider-processing regions were not rechecked in this documentation review.
An endpoint domain or a policy's configured region is not independent proof of the provider's internal processing location.

## 4. 第三方 AI 接收方 / Third-party AI recipients

`lib/server/model-gateway/adapters/http-transport.ts` 提供真实 HTTP 传输；Qwen、GLM、DeepSeek
的 endpoint 为受限配置，凭据由调用方注入。纯 fixture gateway 与真实 adapter 同时存在，不能混为一谈。

| 层次 | 已核对事实 | 不能由此推定 |
| --- | --- | --- |
| 真实调用入口 | `lib/server/jobs/run-staging-text-worker.mjs`、`run-staging-text-service.mjs` 读取 `VISEPANDA_STAGING_TEXT_WORKER_KEY` 与 `VISEPANDA_STAGING_TEXT_PROVIDER_KEY`，将凭据回调注入 `createStagingTextJob`；配置绑定 owner/policy/预算 | 本机具有这些凭据、当前 worker 正在运行、生产已获授权 |
| 既有实测 | `artifacts/VPJ-07/staging-live-20260912/verification.md` 等记录真实 Qwen Staging 调用；`artifacts/VPJ-75/359-wiki-dispatch-slice2-20260914/verification.md` 记录两次真实 Qwen Wiki 探针 | 覆盖所有用户、材料、地区或完整生产生命周期 |
| Wiki 与检索 | `wiki-generation-job.ts`、`wiki-search-job.ts`、`wiki-statement-proposal-job.ts` 接受调用方提供的真实 transport/credential；应按各模块当前消费者核对 | 模块存在等于持续运行的完整 worker 已部署；或缺少统一 cron 等于从未真实调用 |
| 内部测试增量 | PR #417 提出测试域名下的 GLM 路由，PR #419 修复登录状态；合并状态、已部署版本与实际数据流需分别核对 | 未合并代码没有被单独部署；或测试入口自动获得生产/用户数据权限 |

**结论**：仓库已具备真实供应商调用入口，并有历史真实调用证据。“没有任何文本被发送给第三方”
和“接收方为零”均不成立为全局披露。本次没有读取凭据或测试用户数据，也未核验全部当前环境的运行流量；
当前启用的接收方必须按部署版本、有效 policy、用户同意和调用回执逐项披露，不能由源码搜索推断。

Real provider entry points and recorded Qwen calls exist. A repository-wide claim of zero external recipients is
unsupported. This documentation review does not establish every currently active deployment, recipient or data flow.
Disclose each enabled flow using its deployment, current policy, user consent and execution receipts; do not infer
absence of traffic from a missing environment-variable name or scheduler.

开发接入遵循 `docs/agents/development-integration-policy.md`：供应商工单、书面回复、法务/产品签字不作为
开发前置；未知细节如实记录。用户同意、接收方和用途边界、预算、隔离及真实验收仍必须满足；生产发布和资金
动作保留具体授权边界。不能重新引入已取消的审批要求，也不能把开发接入当作公开隐私承诺已经完成。

## 5. 撤回 / Withdrawal

- 通用 `POST /api/privacy` 的删除/导出请求仍是 `202 requested` / `not_started`，不是完整删除执行结果。
- 文本 Ask 已有 `withdraw_text_policy` 及原生 consent 的 DELETE 入口。撤回作用于对应 policy/consent，
  后续读取与外发执行当前资格检查；按 `docs/contracts/vpj-07.md` 与相关迁移解释实际范围。
- 撤回不等于供应商副本、备份或全部用户模块已经彻底删除；完整导出删除验收仍归原责任票。

Text-policy consent withdrawal is implemented and distinct from the request-only privacy export/delete API.
It does not prove provider-side deletion or complete erasure across all modules and backups.

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

No general-purpose in-app customer-support role is established by this review. Existing protected Ops author/reviewer access is purpose-scoped to knowledge operations; it does not grant arbitrary cross-user conversation access.

## 8. 材料两路径 / Material paths

- **服务端路径**：`lib/server/media/private-media.ts` 定义 owner-scoped 私有 Storage 路径与准入策略，但当前 `preparePrivateMediaUpload` **始终返回 `media_unavailable`**——"尚不存在已认证的 actor 或服务端校验过的 PolicyReceipt 适配器"，即该路径代码存在但未授权可用。
- **设备端本地路径**：仓库中未找到独立于服务端存储的"仅设备本地"材料保存实现。
- **未授权时可用功能**：用户仍可在不上传材料的情况下使用文本 Trip/Ask 流程；上传材料的按钮/入口在未接入前不应展示为"已可用"。

## 9. Q36 基础明确偏好范围 / Q36 explicit-preference scope

沿用 2026-09-10 已确认方向（`docs/handoff.json` decisions）：

- Free 与 Pass 共享**明确保存**的基础跨 Trip 偏好；一个有界 service 目标包含必要澄清与系统修复。
- 存储/消费方与计费语义**需要版本化实现**（尚未落地）；新增容量、部分修改/TTL 与 Q38 激活**仍未决定**。
- 来源（用户主动填写 vs 模型推断）、纠正版本、模型与人工接收方、撤回后队列/缓存/派生物处理：必须按实际 consumer 和 policy 分别核对，不能将文本模型调用范围自动扩大至偏好。完整跨模块撤回传播尚未验收，不抹除第5节已有文本 consent 撤回行为。

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
