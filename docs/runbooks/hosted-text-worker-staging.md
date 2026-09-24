# 常驻文本 worker：Staging 激活方案（VPJ-07 #195）

状态：**阿里云香港 ECS 部署准备，未执行**。JT 已选用现有 Ubuntu 22.04 香港 ECS；2026-09-25
只读检查观察到约 1.7 GiB 内存、40 GB 磁盘、仅 SSH 22 监听。协调线程随后在 ECS 使用 Ubuntu apt
仓库安装 `docker.io`，Docker Server 29.1.3 已运行，并将当时 main `f7ec21a4` 浅克隆到 `/opt/vp-v4`。
无凭据 HTTPS 探测到 Staging Supabase 返回 401、DashScope endpoint 返回 400：只证明对应出站路径可达，
不证明认证、权限、模型调用、镜像运行或 Staging 验收。本 runbook 不授权其他远端写入、
共享数据库操作或付费调用；实际操作遵守[继续执行政策](../agents/continuous-afk-execution.md)。Production 不在范围。

代码：`lib/server/jobs/hosted-text-worker.ts`、`lib/server/jobs/run-hosted-text-worker.mjs`、
迁移 `supabase/migrations/20260923090000_vpj_07_hosted_text_worker.sql`、镜像
`deploy/hosted-worker/Dockerfile`、`deploy/hosted-worker/ecs-worker.sh`。契约见
[VPJ-07 常驻 worker](../contracts/vpj-07.md#hosted-resident-text-worker)。

## 1. 部署形态选择

| 形态 | 取件延迟 | 取消/崩溃恢复 | 与现有 lease/预算语义 | 未知费用追溯 | 网络 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| **香港 ECS 单容器（JT 已选）** | 轮询 1–5 s；有进展时立即下一轮 | SIGTERM 排空；异常退出由容器重启，未完成 lease 到期后接管 | 复用现有 SQL 发现、预算与围栏 | 宿主私有目录绑定挂载，fsync 元数据 journal；按组对账工具仍待适配 | 香港到 Staging Supabase 和北京 DashScope 的实际连通与延迟待测 | 采用 |
| Vercel Cron 有界批处理 | Cron 最小 1 分钟，用户最坏等 60 s | 函数时限到期即被杀；在途 dispatch 变为 pending（#491 同类时长问题） | 需放开 scoped worker 对 `VERCEL_ENV` 的拒绝，改变既有安全前提 | 无持久文件系统，usage receipt 无处 fsync | Vercel 区域不可控 | 不采用 |
| Supabase pg_cron + Edge Function | 同为分钟级（或需 pg_net 触发） | Edge 墙钟上限，Deno 运行时 | 需把 Node 代码（fs journal、node:crypto、type stripping 导入）移植到 Deno | 同上，无持久 journal | provider 密钥进入数据库项目，出口区域不可控 | 不采用 |

宿主固定为上述香港 ECS。无需开放 worker 入站端口；健康探针只在容器内部访问 loopback。
`--restart unless-stopped` 会在 worker 到达最长 24 小时寿命并正常退出后重新启动；手动 `stop` 后不会自行恢复。
Docker 不会因健康状态变为 `unhealthy` 自动重启容器，需监测并排查 SQL 心跳与日志。

## 2. 需要的配置（名称；值不入库、不入聊天）

容器（秘密仅放宿主 `/etc/visepanda/hosted-text-worker.env`，root:root、0600；不得提交、打印、
粘贴到聊天或 shell 历史。Docker 管理权限等同可读取容器配置与秘密，不给非受信任用户 Docker 权限）：

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `VISEPANDA_HOSTED_TEXT_WORKER` | 开关 | 必须为 `true`，否则进程直接退出 1 |
| `VISEPANDA_HOSTED_WORKER_DB_KEY` | **秘密** | Staging service_role key（与现有 `VISEPANDA_STAGING_TEXT_WORKER_KEY` 同类） |
| `VISEPANDA_HOSTED_WORKER_QWEN_KEY` | **秘密** | VP-v4 Qwen 按量 API key（与现有 `VISEPANDA_STAGING_TEXT_PROVIDER_KEY` 同类） |
| `VISEPANDA_HOSTED_WORKER_PROFILE` | 非秘密 JSON | 见下；内含价目版本/费率/预留/超时/configurationId，≤16 KB |
| `VISEPANDA_QWEN_ENDPOINT` | 可选 | 不设=旧北京端点；设置则必须与 Staging policy 的 `endpoint` 完全相同，否则所有组被跳过 |
| `VISEPANDA_HOSTED_WORKER_BUILD` | 可选 | 镜像构建时由 `BUILD_ID` 写入（git 短 SHA） |
| `VISEPANDA_HOSTED_WORKER_JOURNAL_DIR` | 默认 `/var/lib/vp-worker/journal` | 必须是持久卷、属主 uid 1000、权限 0700 |
| `VISEPANDA_HOSTED_WORKER_HEALTH_PORT` / `_HOST` | 脚本设置 | 容器内 `127.0.0.1:8765/healthz`；不映射宿主端口 |

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

## 3. 部署与替换（实际远端动作待授权）

1. ECS 已使用 Ubuntu apt 仓库的 `docker.io` 安装 Docker Server 29.1.3。执行前再核对
   `docker version`、daemon、`uname -m` 和剩余磁盘；无需重新安装 Docker。ECS 保持只允许已有
   SSH 入口，worker 不增开端口。已有无凭据 HTTPS 401/400 仅作网络连通证据。
2. 在 ECS 本地以 root 安全写入 `/etc/visepanda/hosted-text-worker.env`，设置 0600；每个变量占一行
   `NAME=value`，其中 profile JSON 单行。该文件不随镜像、Git 或 journal 传输。先以已核准的
   `current_input_v1` 与保守并发/预算启动。由管理员离线保存该文件的受控备份，轮换密钥时替换该文件
   并重新运行脚本。不要在 `docker run -e NAME=value`、命令行参数或 shell 输出中放密钥。
3. 在 ECS 的 `/opt/vp-v4` 将干净 main 快进到包含本 PR 的已合并提交，核对当前 commit 与
   `uname -m`；`x86_64` 用 `linux/amd64`，`aarch64` 用 `linux/arm64`。直接在 ECS 构建镜像：

   ```bash
   cd /opt/vp-v4
   git status --short # 应无输出；若有改动，先查明归属，不覆盖
   git fetch origin main
   git switch main
   git merge --ff-only origin/main
   sha=$(git rev-parse --short=12 HEAD)
   platform=linux/amd64 # 仅当 uname -m 为 x86_64；aarch64 改用 linux/arm64
   docker build --platform "$platform" -f deploy/hosted-worker/Dockerfile --build-arg BUILD_ID="$sha" -t "vp-hosted-text-worker:$sha" .
   docker image inspect --format '{{.Id}} {{.Architecture}}' "vp-hosted-text-worker:$sha"
   ```

   记录基础镜像 digest、生成的镜像 ID 与实际架构。镜像不经 tar 中转；保留上一已知可用
   镜像 tag 与 journal，并监测 40 GB 根盘。构建后原代码与部署脚本同处该 checkout。
4. **数据库仍停用时**，先完成本迁移的备份与授权写窗口。应用
   `20260923090000_vpj_07_hosted_text_worker.sql` 后，以 service_role 确认
   `hosted_worker_ready_groups(1)` 返回 disabled，并确认 anon/authenticated 无四个 RPC 执行权限。
   迁移只追加私有表/RPC，开关默认 disabled；不得从仓库文件推断共享库已应用。
5. ECS 上 `bash deploy/hosted-worker/ecs-worker.sh preflight`，再
   `bash deploy/hosted-worker/ecs-worker.sh replace "$sha"`。
   脚本要求 root、已加载的 SHA 标签镜像、私有 env 文件和 uid 1000/0700 journal 目录；运行容器
   只读根文件系统、无新增能力、768 MiB 内存上限、不发布端口、75 秒停止宽限。
   `bash deploy/hosted-worker/ecs-worker.sh status` 应显示 running/healthy；`read_hosted_worker_status()` 应显示 workerId、
   `phase=disabled`、新鲜 `lastSeenAt`。`healthy` 在 disabled 状态同样可能出现，只证明 SQL 心跳可达。
6. 在获准的 Staging 操作窗口执行 `set_hosted_worker_enabled(true,'staging activation #195')`，
   然后按第 4 节验证。任何关键项失败，先关闭 SQL 开关再按第 5 节回滚。

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

1. **立即**：以获准的 service_role 调用 `set_hosted_worker_enabled(false,'rollback')`，读回 disabled。
   这停止新发现/领取；已在途请求须按 lease、预算和 journal 结果核对。
2. ECS 上 `bash deploy/hosted-worker/ecs-worker.sh stop`（SIGTERM，75 秒宽限）；需要退回代码时，
   确认 SQL 仍 disabled，用保留的上一已知可用 SHA 执行
   `bash deploy/hosted-worker/ecs-worker.sh replace <previous-sha>`，先核健康/心跳，
   再决定是否重新启用 SQL 开关。脚本会先创建候选容器再停止旧容器；新容器启动失败时尝试恢复
   旧容器。不会删除 journal 或旧镜像。
   若替换后无法启动，保持 SQL disabled 并查容器状态，不要用有缺陷的镜像反复启动。
3. 未知费用保持 pending，按完整预留计入 scope 上限（保守、不会少算）。journal 已保存对账所需的全部元数据：
   `vpj07-hosted-job/1` 行是该组的精确 job 配置，`jobDigest = sha256(JSON.stringify(job))`；
   `vpj07-usage-journal/1` 的 `configurationDigest` 指向它。**现有 `reconcile-staging-text-usage.mjs`
   只接受单一配置文件 + 其 run 日志，尚不能直接读取常驻 journal**；按组对账的适配是后续项（见 PR 未完成清单）。
   不手工 release 未知费用，也不改写 journal 去迎合旧工具。
4. 迁移为只追加：保留表和 RPC（停用状态下无行为）；需要时由新迁移移除，不改历史迁移。
5. 之前的一次性/有界 CLI（`run-staging-text-worker.mjs`、`run-staging-text-service.mjs`）保持可用作回退。

## 6. 成本与容量（以实际账单和监测复核）

- 计算：使用 JT 已选香港 ECS 的现有容量；Docker 与镜像、journal、日志占用受 40 GB 磁盘约束，
  按 ECS 实际账单与磁盘监测，不引用过期的 Fly/新加坡价格。
- 数据库：空闲时每轮 2 个 RPC（心跳+发现）；3 s 轮询约 5.8 万次/日，属 Staging 项目常规负载。
- 模型：沿用 budget scope 硬上限。已记录的 Staging 保守价目约 CNY 0.004–0.008/次（例：74 次 342228 micros）；
  每个测试 owner 的 scope 上限即其最大支出。
- 网络：香港 ECS 到 Staging Supabase 和已绑定 DashScope endpoint 的实测结果待补；endpoint 必须与
  Staging policy 完全相同，不能为求连通擅自改为另一区域。

## 7. 需要 JT 决定/提供

1. ECS 镜像构建、容器启动与 Staging 激活的实际授权和操作窗口。
2. Staging 迁移写窗口与备份确认；共享库实际状态先读回。
3. 在 ECS 私有 env 文件安全写入 service_role key 与 Qwen key（不入聊天/仓库）。
4. 核准 profile 价目版本、费率、预留、超时、首批 `modes` 与测试 owner budget scope。
