# VPJ-33 开发政策 v2 与同源 StoreKit 输入

日期：2026-09-22。分支 `codex/225-journey-pass-config`，基线 `ce46abd`。范围：#225 开发目录与展示/测试商品输入，不实现 #226 交易/grant 或 #227 消费账本。原始 checkout 未改；全局 handoff、团队计划及 #363 文件未改。

## 本轮已实现

- `journey-pass-catalog/2` / `service-task-development/1`：冻结开发容量 Free 4/168h + 2/24h、Pass 80/720h grant + 12/24h；保留共同显式跨 Trip 偏好、媒体上限及 Q38 research-only。
- 明确 startsAt 发额度、排队保留退款空洞、可信购买时间对账、恢复不增额度、到期不结转、账号跨档位滚动历史及 partial/改稿/TTL/跨期规则。商品与扣次仍关闭。
- 同源生成目录 JSON、中英展示输入与两套 Xcode `.storekit`。两臂仅价格不同；真实 SKU 仍 null。没有真实账户/数据库/Provider/支付调用。
- #190 已于开工时查到 CLOSED；旧阻塞评论不沿用。main 搜索仅有 v1 目录与测试，没有现成 StoreKit/交易消费者。v2 不触碰现有 worker。

## 实际检查

| 检查 | 结果与范围 |
| --- | --- |
| `node --test tests/contract/entitlements/journey-pass-catalog.test.mjs` | PASS 5/5：价格单变量、生成物一致性、展示不伪造价格/余额、深层不可变、开发边界 |
| 生成器 `--check` | PASS，5 个生成物与唯一目录一致 |
| `pnpm lint` / `pnpm typecheck` | PASS |
| `pnpm docs:check` / `git diff --check` | PASS；证据更新后再次核文档/空白 |
| `sh tests/contract/entitlements/probe-storekit-config.sh` | PASS，Xcode 26.6 (17F113)、macOS 26.6.2，独立临时 macOS bundle、ad-hoc 调试签名 |
| Apple `SKTestSession` → `Product.products(for:)` | 两臂均返回唯一 `dev.visepanda.journey-pass.30-day`、`.nonRenewable`、USA；`displayPrice` 分别 `$19.99` / `$14.99`，Decimal 价格与配置一致 |
| 既有 PR CI | 提交后跟进，结果以 PR 当前 head checks 为准；本地未重复全套构建/设备矩阵 |

这是 Apple 本地测试环境中的商品读取证据，不是 App Store Connect Sandbox、购买、退款、服务端验签、grant 或用户扣次验收。探针不执行 purchase，未使用或重置其他任务模拟器；所有临时 bundle 构建物在脚本退出时删除。

## 失败与修复保留

首次裸 CLI 探针的 `SKTestSession` 构造未抛错，但系统报 `SKInternalErrorDomain Code=1`，店面为空，故最初 exit 0 **不算通过**。补 bundle 后未签名报 Code=3，改进探针明确拒绝空店面（该次退出 133）。为临时专用 bundle 加本地 ad-hoc 调试签名后 StoreKit 可用；最终探针进一步验证实际商品类型、金额与 displayPrice，并用 catch 输出正常非零失败码。见 `commands.jsonl` 原始退出记录，不删除失败或改写为通过。

## 验收覆盖与交接

#225 的全部条目均映射至[开发目录说明](../../docs/commercial/journey-pass-development-catalog.md)与[StoreKit 交接](../../docs/runbooks/journey-pass-storekit-readiness.md)。已实现开发规则与本地商品读取；真实账户地区价、媒体成本与完整交易/消费链仍见 [UNRUN](unrun.md)，所以不关 #225。

本轮准备/实现与检查证据见本文件及命令记录；返工为上述原生探针环境修复。真实账户等待不计作已验收；start-to-user-acceptance 尚未结束，未推算效率百分比。

回退：撤销本 PR 的目录、生成物、说明与测试；无应用迁移/交易或用户数据回退动作。后续消费者依赖 v2 后须先协调版本兼容。

---

以下保留 2026-09-17 的历史 v1 结果；其“容量未决/无配置”描述不代表本轮状态。

# VPJ-33 首个开发权益表切片验证

**版本：**待提交工作树 `codex/team-a-vpj-33-20260917`（基于 `origin/main` 的 `873d219`）  
**日期：**2026-09-17  
**范围：**纯本地、无 StoreKit/交易/数据库/Provider 调用。

## 已实现

- `journey-pass-catalog/1` 把 Free 与 30 天非自动续费 Journey Pass 的开发态展示、720 小时 Grant 语义、价格实验输入、共同基础跨 Trip 偏好和媒体试点上限集中到同一版本化模块。
- 两种商品均为 `purchasable: false`；Pass 的 `storeKitProductId` 为 `null`，容量为 `record_only_pending_decision`/`null`。本切片没有购买、Grant、恢复、退款、容量消费、账户、StoreKit 或外部调用。

## 实际本地检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `node --experimental-strip-types --test tests/contract/entitlements/journey-pass-catalog.test.mjs` | PASS | 3/3：开发态商品、未决容量、Grant/媒体边界 |
| `pnpm check` | PASS | lint、TypeScript、production build 与22项标准静态测试通过 |
| `pnpm docs:check` | PASS | VPJ plan 76 tasks，文档基线通过 |
| `git diff --check` | PASS | 无空白错误 |

## 回退

撤销本 PR 的纯配置/文档文件即可；不涉及已应用迁移或任何用户/交易数据。
