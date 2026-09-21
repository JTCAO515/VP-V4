# Journey Pass StoreKit 开发配置与 Sandbox 交接

本清单供 #226 使用，不是上架授权。政策唯一来源是[开发目录](../commercial/journey-pass-development-catalog.md)。

## 无账户的本地配置

- [reference.storekit](../commercial/journey-pass-development/reference.storekit)：默认 $19.99 测试输入。
- [alternative.storekit](../commercial/journey-pass-development/alternative.storekit)：$14.99 单变量臂。其余字段与 reference 相同。
- 本地 ID `dev.visepanda.journey-pass.30-day` 只用于 Xcode，不代表 App Store Connect 已创建 SKU；两臂不可同时加载为两个商品，也不在设备上随机换价。
- 通过目录生成器更新并用 `--check` 核对。把所选文件加入专用本地测试 target，在其 Scheme → Run → Options → StoreKit Configuration 选择该文件。不要覆盖其他团队共享 scheme；仓库现有应用还没有 #226 的购买路径。
- #226 用 `Product.products(for:)` 读取商品，核类型为 `.nonRenewable`，展示使用 `displayPrice`。测试交易、恢复、退款、排队和到期分别检查服务端对应账本；Xcode 测试不能当成真实 Sandbox 或正式 Apple 签名验证。

Apple 的 [StoreKit Testing 设置说明](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode)区分本地配置与服务器环境；[SKTestSession](https://developer.apple.com/documentation/storekittest/sktestsession)可用于独立自动化本地测试。Apple 的测试时间加速不能改变 VP 固定的 720 小时绝对时间政策。

## 实际 Sandbox 输入清单（不得用本地值冒充）

| 项目 | 当前值/状态 | 核对方式 |
| --- | --- | --- |
| bundle ID / App Store Connect app | 未在本票核验 | 已授权实际账户只读核对 |
| Sandbox product ID | null，尚未配置真实商品 | 核真实非自动续费商品，再显式绑定到目录版本 |
| 合同主体、税费、地区价格 | unknown | 实际账户及 StoreKit 返回；不猜测 |
| 策略、grant 时长、开发容量 | catalog v2 / policy v1 | 直接消费生成的 catalog.json，不复制另一份数值 |
| 销售启用 | false | 本票无销售/私人收款/发布权限 |

接实际 Sandbox 时将 Scheme 的本地 StoreKit 配置设为 None，使用授权测试账户和真实 Sandbox SKU；不能把本地 ID 或自签名收据当 Apple Sandbox。未知 SKU、环境不符、未知目录版本或缺可信购买时间均不得授予权益。真实账户商品创建、上架、销售与合同动作按明确授权范围执行。

## #226 / #227 必须验证

1. 验证交易与账号绑定、环境隔离、唯一交易幂等；从可信购买时间创建每段 720 小时 grant，并固化 catalog/policy/capacity。
2. 提前购买仅排队，到 startsAt 才发容量；到期不结转；恢复/重复收据不增额度；退款只撤对应段，不移动其他段。
3. 乱序交易及已固定段冲突的显式对账；不按设备时钟或收到收据的顺序授予。
4. #227 用冻结开发值验证双门、账号跨档位滚动窗口、partial、TTL、跨期、并发、退款后失效和唯一结算。目录存在不代表消费已启用。
5. 两臂匹配的地区 `displayPrice`；参考数字不得冒充地区价格。真实收费前另核容量经济性与实际销售配置。
6. 保持无无限/人工包含承诺，媒体真实成本按 attempt 实测；Sandbox/TestFlight 不记真实付费，未上架商品不收私人款。

本票具体 PASS/UNRUN 见 [验证记录](../../artifacts/VPJ-33/verification.md)与[未验项](../../artifacts/VPJ-33/unrun.md)。
