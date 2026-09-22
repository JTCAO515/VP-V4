# Journey Pass 开发权益与政策 v2

2026-09-22 · #225 / VPJ-33 · `journey-pass-catalog/2` · `service-task-development/1`。

唯一输入为 `lib/server/entitlements/journey-pass-catalog.ts`；从它生成的[目录快照](journey-pass-development/catalog.json)、[英文展示输入](journey-pass-development/presentation.en.json)、[中文展示输入](journey-pass-development/presentation.zh.json)和两份本地 StoreKit 配置不得手改。生成/检查：

```sh
node --experimental-strip-types lib/server/entitlements/generate-development-config.mjs
node --experimental-strip-types lib/server/entitlements/generate-development-config.mjs --check
```

本次延续 main 的 v1 开发目录，不建立第二套商品、交易或容量账本。v1 无运行消费者；v2 改变政策字段，调用方须明确识别 schema，不把未知版本映射为可购买。当前没有 API/UI 购买接入，`purchasable=false`、真实 `storeKitProductId=null`、运行消费仍为 record-only。生成的展示输入不是余额、下次可用时刻或数据使用许可。

## 同源权益表与开发决定

| 项目 | Free | 30 天 Journey Pass |
| --- | --- | --- |
| 商品 | 免费，不购买 | 非自动续费，每笔独立 720 小时 |
| 完整服务任务开发容量 | 任意滚动 168 小时 4 个 | 每个 grant 80 个 |
| 账号突发窗口 | 任意滚动 24 小时 2 个 | 任意滚动 24 小时 12 个 |
| 基础显式跨 Trip 偏好 | 共同支持，仍按授权资格投影 | 同 Free，退款/到期不取消该基础权益 |
| Trip/数据控制 | 既有权限下可用 | 同 Free |
| 人工服务/无限服务 | 不包含/不承诺 | 不包含/不承诺 |

数量由本票明确授权的 agent 开发决定固定：Free 支持一次试用目标及有限复访；Pass 用 80 个完整目标检验多日旅途使用，12/24h 与 2/24h 限制短时集中使用。它们尚无真实用户负载或成本数据支撑，不是对外价格/容量承诺，不由旧 6/30/300/60 Ask 换单位推导。开发反馈需要新 policyVersion；已有 grant 的版本、容量快照不可被目录更新追溯修改。真实收费前按发布范围重新核容量、成本与账户商品。

Q36 回写：两档共享 `explicit_cross_trip_preferences`，沿用[基础偏好合同](../contracts/basic-preferences-cross-trip.md)的 Profile/Memory 权威、显式同意、最小任务投影和撤回规则；不因付费新增数据接收方或记忆存储。#190 当前 CLOSED，不能沿用旧阻塞评论；真实消费者资格仍逐请求验证。

## 交易时间输入（#226 实现）

- 身份为环境与已验证 transaction ID，绑定账号；Sandbox、Xcode local、Production 不混账。每笔绑定目录版本、计量版本、容量快照。恢复/重复投递只找回原段，不再发额度。
- 可信购买时间排序；同一毫秒按交易 ID 的字典序作确定性 tie-break。首段从可信购买时间开始，后段 `startsAt=max(purchasedAt, preceding.endsAt)`，`endsAt=startsAt+720h`。使用绝对时长，不按时区日历或设备时间。
- 时段为 `[startsAt, endsAt)`；只有到 startsAt 才能使用该段容量，未来排队段不是当前余额。到期余量不结转。晚到已过期交易不能从恢复时刻重新获得 720 小时。
- 退款只撤对应段；包括被退款段在内，已固定的其他段时间保留，不填补退款形成的空洞，也不压缩队列。之后购买仍追加到既有排队末端。
- 乱序收据先按可信购买时间对账再固定未生效队列。若迟到交易与已经生效/固定的时段冲突，#226 须进入显式对账，不移动既有时段、不自动补发；不能以收据到达顺序覆盖历史。缺失可信时间/未知策略版本拒绝自动授予。
- 账号滚动历史跨购买、恢复、退款、升级、降级持续。窗口计所有档位的已结算任务和仍有效预留，按原接纳时间统计 `(now-window, now]`；释放的未消费预留不计。活跃 Pass 用 Pass 双门，否则用 Free 双门；不叠加容量，Pass 耗尽也不自动回退扣 Free。过往 Pass 使用也计入降级后的 Free 窗口。

## ServiceTask 开发政策（#227 实现）

本节是[计量契约](../contracts/service-task-metering.md)所留开发决策的版本化输入，不修改当前 record-only worker，不意味着下列账本路径已实现。

- 只有约定范围的有效成果持久化、owner 可读且完成校验后才结算 1 单位。任务类型为 Trip 修改时，仍须确认有效提案并成功原子 Patch；提案/HTTP 200 不等于完成。
- 必要澄清、技术重试、系统修复沿用同一目标和累计内部成本预算，不加消费。provider/tool attempt 的真实费用另计，未知费用待核，不算零。
- partial：保留可用部分但不结算完整单位，释放预留；继续时重验同 task/scope 和合法容量，完整交付才结算。同任务生命周期最多结算一次。
- 完成后的主动改稿或扩大范围：先明确新成果范围，由用户明确开始新目标后重新接纳；模型分类或新 ID 本身不授权扣次。纠正系统自身缺陷不是新目标，仍需当前授权及既有内部预算。
- 等待用户 TTL 为首次进入 waiting 起 24 小时，不因重试续期，Pass 最晚止于本段 endsAt；与供应商费用待核期限分离。TTL 到期释放预留、保留成果，不自动执行。
- 跨期：到期预留失效，不能把旧预留复活或自动扣下一段。用户明确继续后重新核权益、scope、同意、余额和内部预算；沿用 task 的累计费用及唯一结算标识。迟到成果不得消耗过期预留或偷偷迁移到下一段。
- 交付前取消/失败释放预留；交付后取消不自动返还已结算单位。退款只撤匹配 grant 可用容量，不能清除账号窗口或生成替代 Free 额度。退款/到期后发起修复也不能绕过当前授权与成本止损。

#227 须验证接纳/预留/结果/结算原子性、并发最后一份额度、重放和迟到提交；本票不实现这一账本。

## 价格、媒体与研究边界

$19.99 为 USD 参考价，$14.99 为仅改变价格的实验臂。默认 reference；两臂的本地 SKU、时长、权益、媒体和政策版本一致。真实店面展示只能用匹配商品的 StoreKit `Product.displayPrice`，不得拿美元数值做汇率换算、划线促销或支付按钮。开发中面向用户只显示尚不可购买；开发容量不显示成实际剩余量。

保留录音每次 ≤60 秒、默认讲解 ≤120 秒、图片 ≤10,000,000 bytes、PDF ≤10 页且 ≤20,000,000 bytes。它们是输入/默认输出限制，不是成本已验证；#227 逐 attempt 核媒体与模型成本，#194 持久预算继续独立止损。默认讲解长度不承诺任意追问无限输出。

Q38 到达激活、购买后自主激活、eSIM、支付渠道均为 research-only；不替代现行可信购买时间/排队生效政策，不包含新商品承诺。

回退：撤销本 PR 即恢复先前目录；没有迁移、交易、销售或用户数据变更。后续消费 v2 的 PR 合并后，应协调消费者兼容再回退。
