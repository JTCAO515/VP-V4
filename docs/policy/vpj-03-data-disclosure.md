# VPJ-03 数据政策披露矩阵 / Data Disclosure Matrix

Issue: [#190](https://github.com/JTCAO515/VP-V4/issues/190) · Program [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)

**2026-09-17 完整性复核**：以当前源码入口、部署元数据、Staging policy registry 与已归档运行证据为准，区分传输能力、历史实测与当前部署。
原复核遗漏了 `lib/server/jobs/run-staging-text-worker.mjs` 和 `run-staging-text-service.mjs`，
不能据其搜索结果断言“零真实接收方”。本轮没有执行模型调用或读取用户正文；发现一条仍有效但登记接收方/地域不完整的 GLM 内部测试 policy 后，已按其不可变 registry 的终态撤回机制撤销，旧调用会在派发前 fail-closed。

## 状态 / Status

本文档记录**当前代码库已验证的真实行为**，不新增功能、不代表已对外发布的产品承诺。
本文区分已经明确的文本保留/经营主体决定、实际部署或 policy registry 已观察的事实，以及仍未知的备份和供应商内部处理。本文不把历史开发 notice 变为面向公众的产品承诺。

This document records **verified current implementation behavior only**. It is not a new
feature and not a published product commitment. Any item this repository's own accepted
architecture reserves for the operator is stated as unknown when it is not observed. Historical
development notices remain scoped to their exact policy records; this document is not a public
product commitment.

## 1. 告知与目的 / Disclosure and purpose

| 项目 | 中文 | English |
| --- | --- | --- |
| 收集内容 | 账号身份（邮箱/第三方登录）、Trip 内容与修订、对话 Turn、用户上传材料（图片/PDF）、隐私请求记录 | Account identity (email/OAuth), Trip content and revisions, chat Turns, uploaded material (image/PDF), privacy-request records |
| 用途 | 生成与维护用户自己的 Trip，回答用户提出的问题，处理用户发起的导出/删除请求 | Generating and maintaining the user's own Trip, answering the user's own questions, processing the user's own export/delete requests |
| 经营主体与联系 | 广州创竞科技有限公司；负责人 JT；`jtcao@go2china.space` | Guangzhou Chuangjing Technology Co., Ltd.; responsible contact JT; `jtcao@go2china.space` |

来源：`docs/contracts/privacy-lifecycle.md`、`lib/server/model-gateway/`、`lib/server/media/private-media.ts`。

## 2. 保留期限 / Retention

- **已同意的文本 Ask 输入和最终回答**：`retain_after_hide_v1` 的 immutable policy 表达 JT 已决定的长期保留；删除 Turn/thread/account 或撤回后永久隐藏，不能恢复可见性，但不等于物理擦除或供应商副本删除。
- **Trip / Profile / Memory 与未进入上述 policy 的 Turn**：owner 隔离存储；本票没有把它们一概改成某个统一期限。
- **备份（Backup）**：当前数据库 project 在 Singapore；本轮未获得可证明的备份对象寿命或恢复屏蔽结果，备份寿命仍 unknown。
- **隐私请求收据（privacy request receipt）**：请求本身按当前实现保存为审计记录（`requested`/`not_started` 状态）；此处不承诺永久保留，不代表数据已删除——见下文第 5 节。

The long-term, hide-not-erase rule applies only to text content admitted under its matching
immutable policy. It does not promise provider deletion, backup deletion or a common lifetime for
all other product records.

## 3. 处理地域 / Processing region

- 当前 Vercel project `vp-v4` 的函数默认区域为 `iad1`（US）；它不证明每一次 worker 或第三方推理发生在该区域。
- 当前 Supabase project `VP - V4` 为 `ap-southeast-1`（Singapore）。这证明数据库 project 地域，不证明备份、调用方或供应商内部处理地域。
- 历史 Qwen Staging notice 记录 Beijing API access、Singapore worker network exit 与 Vercel US path；官方 Qwen 文档区分接入地域、存储位置和服务部署范围，不能由 `dashscope.aliyuncs.com` 推断内部推理节点。
- 当前没有未撤回且通过复核的 C2 text policy；新的接收方 policy 必须重新记录实际 endpoint、路径和未公开细节。

An endpoint domain or a policy's configured region is not independent proof of the provider's internal processing location.

## 4. 第三方 AI 接收方 / Third-party AI recipients

`lib/server/model-gateway/adapters/http-transport.ts` 提供真实 HTTP 传输；Qwen、GLM、DeepSeek
的 endpoint 为受限配置，凭据由调用方注入。纯 fixture gateway 与真实 adapter 同时存在，不能混为一谈。

| 层次 | 已核对事实 | 不能由此推定 |
| --- | --- | --- |
| 真实调用入口 | `lib/server/jobs/run-staging-text-worker.mjs`、`run-staging-text-service.mjs` 读取 `VISEPANDA_STAGING_TEXT_WORKER_KEY` 与 `VISEPANDA_STAGING_TEXT_PROVIDER_KEY`，将凭据回调注入 `createStagingTextJob`；配置绑定 owner/policy/预算 | 本机具有这些凭据、当前 worker 正在运行、生产已获授权 |
| 既有实测 | `artifacts/VPJ-07/staging-live-20260912/verification.md` 等记录真实 Qwen Staging 调用；`artifacts/VPJ-75/359-wiki-dispatch-slice2-20260914/verification.md` 记录两次真实 Qwen Wiki 探针 | 覆盖所有用户、材料、地区或完整生产生命周期 |
| Wiki 与检索 | `wiki-generation-job.ts`、`wiki-search-job.ts`、`wiki-statement-proposal-job.ts` 接受调用方提供的真实 transport/credential；应按各模块当前消费者核对 | 模块存在等于持续运行的完整 worker 已部署；或缺少统一 cron 等于从未真实调用 |
| 内部测试 GLM policy | 2026-09-17 只读 registry 发现 `internal-testing-v1` 仍有效，但 `recipient/source_region/storage_region` 与其 bilingual notice 和部署事实不一致；测试聊天路由也不在 main | 不能把这条不完整 policy 当作可用的接收方授权；已以 `revoked_at` 终态撤销，未删除内容、同意或密钥 |

**结论**：仓库已具备真实供应商调用入口，并有历史真实调用证据。“没有任何文本被发送给第三方”
和“接收方为零”均不成立为全局披露。本次没有读取凭据或测试用户数据，也未核验全部当前环境的运行流量；
当前启用的接收方必须按部署版本、有效 policy、用户同意和调用回执逐项披露，不能由源码搜索推断。2026-09-17 registry 核验完成后，没有仍有效的、通过本票完整性核验的 C2 policy。

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
| `service_role`（Supabase 后台） | 全表访问，仅可通过受控服务端密钥使用；不是应用内客服角色 |
| 应用内"客服"角色 | **不存在**——Owner 角色不会被自动授予跨用户的普通读取权限 |
| 受控团队跨用户访问 | JT 已决定该业务范围，但身份、能力检查、审计与离职撤权尚未实现/验证，当前仍未启用 |

No general-purpose in-app customer-support role is established by this review. Existing protected Ops author/reviewer access is purpose-scoped to knowledge operations; it does not grant arbitrary cross-user conversation access.

## 8. 材料两路径 / Material paths

- **服务端路径**：`lib/server/media/private-media.ts` 定义 owner-scoped 私有 Storage 路径与准入策略，但当前 `preparePrivateMediaUpload` **始终返回 `media_unavailable`**——"尚不存在已认证的 actor 或服务端校验过的 PolicyReceipt 适配器"，即该路径代码存在但未授权可用。
- **设备端本地路径**：仓库中未找到独立于服务端存储的"仅设备本地"材料保存实现。
- **未授权时可用功能**：用户仍可在不上传材料的情况下使用本地 Trip 浏览、编辑和确认；文本 Ask 仅能在另有当前 text policy 与用户同意时使用。上传材料的按钮/入口在未接入前不应展示为"已可用"。

## 9. Q36 基础明确偏好范围 / Q36 explicit-preference scope

沿用 2026-09-10 已确认方向（`docs/handoff.json` decisions）：

- Free 与 Pass 共享用户**明确保存**的基础偏好；可为仅本次、当前 Trip 或账号跨 Trip。仅本次不新增长期记录，Trip 范围必须绑定正确 Trip。
- 来源必须标为用户主动输入或待澄清候选；模型推断不得自动写入长期偏好。纠正使用单调版本/等价并发控制，消费收据必须能识别实际读取的来源版本。
- 模型或人工接收方只得到当前任务需要、仍有效且获同意的最小投影；Free/Pass 不替代同意，也不使所有记忆默认进入 prompt。
- 暂停、撤回或删除后，新队列、重试、缓存和派生物必须按来源/版本重验；迟到结果不得复活旧偏好。实际跨模块投影与撤回传播仍由 #199/#195 验收。

## 不构成的承诺 / What this document does not claim

本文档不批准新的生产模型路由、不新增客服角色、不承诺备份或供应商删除。面对用户的 notice 必须从实际 immutable policy 生成；当前没有可作为公开 C2 功能的有效 policy。

This document does not approve a new production model route, add a support role, or promise
backup/provider deletion. A user notice must be generated from an actual immutable policy; there
is currently no active, publishable C2 policy.

## 回滚 / Rollback

文档改动可通过 revert 回退。2026-09-17 的 registry 终态撤回不应被反向恢复；如需再次启用任何 C2 流程，必须创建新的 immutable policy、重新取得用户同意并核验部署。

Reverting documentation does not reverse the 2026-09-17 terminal registry revocation. A new policy,
new consent and deployment verification are required before a C2 route can be enabled again.
