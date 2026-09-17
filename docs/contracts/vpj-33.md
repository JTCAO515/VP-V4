# VPJ-33 Journey Pass 开发权益表

**状态：**开发配置已实现；未配置 StoreKit 商品、未启用销售、未发放 Grant 或 ServiceTask 容量。

**范围：**本文件和 `lib/server/entitlements/journey-pass-catalog.ts` 是 Free/Pass 展示及后续 #226/#227 接入的同源版本化输入。它不替代交易账本、RLS、用户同意或 StoreKit 验证。

## 已冻结的开发输入

| 项目 | 值 | 边界 |
| --- | --- | --- |
| 版本 | `journey-pass-catalog/1` | `development_only`，两个商品均不可购买，Pass 无 SKU |
| Free | 明确保存的跨 Trip 基础偏好、Trip/数据控制 | 与 Pass 共同拥有；不代表无限生成或额外数据用途 |
| Journey Pass | 单次、非自动续费，720 小时 | 首次真实交易将由 #226 从可信购买时间开始；本版本不创建 Grant |
| 价格实验 | USD 19.99 参考、USD 14.99 备选 | 只能单变量分配；面向用户的地区价格必须由发布时 StoreKit 返回 |
| ServiceTask | `record_only_pending_decision`，数量为 `null` | 不沿用旧 300/60 Ask 数字；partial、改稿、等待 TTL 与跨期均未决定 |
| 媒体试点上限 | 语音60秒、默认讲解120秒、图片10MB、PDF10页/20MB | 是成本验证输入，不是商品承诺 |

## 供后续实现的 Grant 规则

一笔已验证交易对应一段独立 720 小时 Grant。提前购买排在同账号现有未退款 Grant 之后，到自己的 `startsAt` 才可使用；余量到期不结转。恢复只能找回原 Grant，退款只撤对应 Grant，乱序交易按可信购买时间对账。#226 实现验证、账号绑定、持久化与恢复；#227 仅在另有已批准的容量策略后实现用户消费。

Q38 的购买后激活、到达起算、eSIM 和支付渠道仍是未决项。本配置不能发起购买、显示可售价格、向私人收款或打开 StoreKit/生产环境。

## 回滚

移除本版本的纯配置消费者即可恢复到没有 Journey Pass 开发配置的状态；不得借回滚删除未来已验证交易、Grant、收据或已应用迁移。
