# 常驻文本 worker：Staging 激活方案（VPJ-07 #195）

状态：**方案，未执行**。本文件不授权任何远端写入、账号开通、部署或付费调用；每一步需 JT/协调者按
[继续执行政策](../agents/continuous-afk-execution.md) 单独批准。Production 不在本方案范围。

代码：`lib/server/jobs/hosted-text-worker.ts`、`lib/server/jobs/run-hosted-text-worker.mjs`、
迁移 `supabase/migrations/20260923090000_vpj_07_hosted_text_worker.sql`、镜像
`deploy/hosted-worker/Dockerfile`。契约见 [VPJ-07 常驻 worker](../contracts/vpj-07.md#hosted-resident-text-worker)。

## 1. 部署形态选择

| 形态 | 取件延迟 | 取消/崩溃恢复 | 与现有 lease/预算语义 | 未知费用追溯 | 网络 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| **小型常驻容器（选定）** | 轮询 1–5 s；有进展时立即下一轮 | SIGTERM 排空；SIGKILL 由 SQL lease 到期接管（已在 Staging 验证过同一路径） | 完全复用：现有 CLI 本就是常驻轮询进程，只把“单一 owner/policy 配置”换成 SQL 发现 | 持久卷上的 fsync 元数据 journal（含每组 job 配置与 usage receipt；按组对账工具适配为后续项） | 放在新加坡，与 Staging Supabase 同区；到北京 DashScope 跨境一跳 | 采用 |
| Vercel Cron 有界批处理 | Cron 最小 1 分钟，用户最坏等 60 s | 函数时限到期即被杀；在途 dispatch 变为 pending（#491 同类时长问题） | 需放开 scoped worker 对 `VERCEL_ENV` 的拒绝，改变既有安全前提 | 无持久文件系统，usage receipt 无处 fsync | Vercel 区域不可控 | 不采用 |
| Supabase pg_cron + Edge Function | 同为分钟级（或需 pg_net 触发） | Edge 墙钟上限，Deno 运行时 | 需把 Node 代码（fs journal、node:crypto、type stripping 导入）移植到 Deno | 同上，无持久 journal | provider 密钥进入数据库项目，出口区域不可控 | 不采用 |

选定理由：常驻容器与已验证的 lease/claim/budget/journal 语义一一对应，唯一新增的是“多 owner/多
policy 发现 + 运营停用开关 + 心跳”；延迟最低；不需要改动任何已有安全拒绝条件。代价是一个新的托管账号
（需 JT 批准）和一个镜像的运维。

推荐宿主（任选其一，需 JT 决定并由人开通账号）：Fly.io `sin` 区单机（shared-cpu-1x/256MB + 1 GB volume），
或阿里云新加坡 SAE/ECS。只需要出站 HTTPS 到 Staging Supabase 与 DashScope；无入站端口。

## 2. 需要的配置（名称；值不入库、不入聊天）

容器（秘密放宿主的 secret store）：

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `VISEPANDA_HOSTED_TEXT_WORKER` | 开关 | 必须为 `true`，否则进程直接退出 1 |
| `VISEPANDA_HOSTED_WORKER_DB_KEY` | **秘密** | Staging service_role key（与现有 `VISEPANDA_STAGING_TEXT_WORKER_KEY` 同类） |
| `VISEPANDA_HOSTED_WORKER_QWEN_KEY` | **秘密** | VP-v4 Qwen 按量 API key（与现有 `VISEPANDA_STAGING_TEXT_PROVIDER_KEY` 同类） |
| `VISEPANDA_HOSTED_WORKER_PROFILE` | 非秘密 JSON | 见下；内含价目版本/费率/预留/超时/configurationId，≤16 KB |
| `VISEPANDA_QWEN_ENDPOINT` | 可选 | 不设=旧北京端点；设置则必须与 Staging policy 的 `endpoint` 完全相同，否则所有组被跳过 |
| `VISEPANDA_HOSTED_WORKER_BUILD` | 可选 | 镜像构建时由 `BUILD_ID` 写入（git 短 SHA） |
| `VISEPANDA_HOSTED_WORKER_JOURNAL_DIR` | 默认 `/var/lib/vp-worker/journal` | 必须是持久卷、属主 uid 1000、权限 0700 |
| `VISEPANDA_HOSTED_WORKER_HEALTH_PORT` / `_HOST` | 可选 | 平台健康检查用 `GET /healthz`；宿主需要时设 `0.0.0.0`，不对公网暴露 |

Profile 模板（值须在激活前由 JT 核准；费率沿用已记录的保守 Qwen 价目）：

```json
{"schemaVersion":"vpj07-hosted-text-worker/1","pollIntervalMs":3000,"maxLifetimeMs":86400000,"drainMs":45000,
 "concurrency":2,"groupLimit":20,"modes":["current_input_v1","task_history_v1","knowledge_intent_v1"],
 "qwen":{"priceVersion":"<与 budget scope provider limit 相同>","pricing":{"mode":"flat","inputMicrosPerMillion":<>,"outputMicrosPerMillion":<>,"cachedInputMicrosPerMillion":null},
 "reservedMicros":<≥ 1048576×输入费率+maxOutputTokens×输出费率 的上取整>,"maxOutputTokens":<>,"timeoutMs":<≤60000>,
 "configurationId":"<uuid>","configurationVersion":1}}
```

首次激活建议 `modes` 只放 `current_input_v1`（Ask 单轮 + 翻译），验证后再加 task/grounded。

Vercel Staging（**已有**，本 PR 不改）：`VISEPANDA_NATIVE_STAGING=true`、`VISEPANDA_NATIVE_STAGING_TEXT=true`、
`VISEPANDA_NATIVE_STAGING_TEXT_POLICY`、`VISEPANDA_NATIVE_STAGING_TASK_POLICY`、
`VISEPANDA_NATIVE_STAGING_GROUNDED`/`_GROUNDED_POLICY`。这些只负责提交与读回；答案由本 worker 生成。

数据库前提（逐个 owner，现有运营动作）：每个 TestFlight 测试 owner 已同意对应 policy，并且恰有**一个**
启用、未冻结、未过期的 `model_budget_scopes`，其 `qwen` provider limit 的 `model`/`price_version`
与 profile 一致。没有或多于一个匹配 scope 的 owner 被跳过（心跳 `skipped` 计数上升，Turn 保持 queued）。

## 3. 部署步骤（均待批准）

1. **迁移**（Staging 写窗口）：备份后应用 `20260923090000_vpj_07_hosted_text_worker.sql`。它只新增两张私有表
   和四个 service-only RPC，开关默认 **disabled**，不改任何现有行/函数。核对：
   `select public.hosted_worker_ready_groups(1)` 以 service_role 返回 `{"kind":"disabled"}`；
   anon/authenticated 执行四个 RPC 均 `permission denied`。
2. **镜像**：在已合并 main 上
   `docker build -f deploy/hosted-worker/Dockerfile --build-arg BUILD_ID=$(git rev-parse --short=12 HEAD) -t <registry>/vp-hosted-text-worker:<sha> .`；
   记录基础镜像 digest 与镜像 digest。
3. **宿主**：新加坡 1 个实例，挂 1 GB 持久卷到 journal 目录，写入上表 secret/env，重启策略
   `on-failure` 带退避，停止宽限 ≥ `drainMs`+15 s。
4. **启动（仍停用）**：`read_hosted_worker_status()` 显示该 workerId、`phase=disabled`、`lastSeenAt` 每轮刷新；
   日志只有 `vpj07-hosted-worker/1` 启动行。
5. **打开开关**：`select public.set_hosted_worker_enabled(true,'staging activation #195')`。
6. 按第 4 节验证；任何一项失败立即执行回滚第 1 步。

## 4. 验证清单

- [ ] 心跳：`lastSeenAt` 距今 < 3×轮询间隔；`stopReason` 为空；`unavailable` 不持续上升。
- [ ] 两个合成测试账号中/英各 1 条原生 Ask：`answered`，原生重启后读回同一 Turn；另一账号不可见。
- [ ] 同一 ServiceTask 澄清→续问；grounded 1 条（有依据或诚实 technical_failure/clarification）；翻译 1 条 `translated`。
- [ ] 队列：`queue.oldestReadySeconds` 在空闲时 < 10 s；提交到终态的耗时记录到证据。
- [ ] 预算：新增 attempt 全部 `settled`，未决 0；与 journal usage receipt 一一对应；保守计价合计入证据（非供应商账单）。
- [ ] 停用开关：关闭后新提交保持 queued、零 provider 调用；再打开后被处理。
- [ ] 重新部署（SIGTERM）：在途请求在 `drainMs` 内完成或以 pending 留账，Turn 由 lease 到期后接管，终态各 1 条。
- [ ] journal：只有 ids/计数/价目/目的地元数据；不含输入、回答或密钥。
- [ ] 取消：处理中的原生取消不写入迟到答案。
- [ ] Production 别名与 Production 数据库均未改变。

## 5. 回滚

1. **立即**：`set_hosted_worker_enabled(false,'rollback')` —— 下一轮起不再发现/领取，不需要部署。
2. 停止/缩容容器（SIGTERM）；在途 lease 由原 lease 围栏到期处理，未知费用保持 pending。
3. 未知费用保持 pending，按完整预留计入 scope 上限（保守、不会少算）。journal 已保存对账所需的全部元数据：
   `vpj07-hosted-job/1` 行是该组的精确 job 配置，`jobDigest = sha256(JSON.stringify(job))`；
   `vpj07-usage-journal/1` 的 `configurationDigest` 指向它。**现有 `reconcile-staging-text-usage.mjs`
   只接受单一配置文件 + 其 run 日志，尚不能直接读取常驻 journal**；按组对账的适配是后续项（见 PR 未完成清单）。
   不手工 release 未知费用，也不改写 journal 去迎合旧工具。
4. 迁移为只追加：保留表和 RPC（停用状态下无行为）；需要时由新迁移移除，不改历史迁移。
5. 之前的一次性/有界 CLI（`run-staging-text-worker.mjs`、`run-staging-text-service.mjs`）保持可用作回退。

## 6. 预期成本（激活前以官网当期价目复核）

- 计算：Fly.io shared-cpu-1x/256MB 约 US$2/月 + 1 GB 卷约 US$0.15/月；阿里云新加坡同等规格约 CNY 30–60/月。
- 数据库：空闲时每轮 2 个 RPC（心跳+发现）；3 s 轮询约 5.8 万次/日，属 Staging 项目常规负载。
- 模型：沿用 budget scope 硬上限。已记录的 Staging 保守价目约 CNY 0.004–0.008/次（例：74 次 342228 micros）；
  每个测试 owner 的 scope 上限即其最大支出。
- 网络：新加坡→北京 DashScope 跨境；如需境外 DashScope 端点，属于另一个端点/区域决定，当前代码拒绝。

## 7. 需要 JT 决定/提供

1. 批准宿主与开通账号（推荐 Fly.io `sin`）以及镜像仓库；由人完成账号与支付方式。
2. Staging 迁移写窗口与备份确认。
3. 在宿主 secret store 写入 service_role key 与 Qwen key（agent 不接触值）。
4. 核准 profile 中的价目版本/费率/预留/超时，以及首批 `modes`。
5. TestFlight 测试 owner 名单与每人 budget scope 上限（逐人 scope 目前是运营插入，未自动化）。
