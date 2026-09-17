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
