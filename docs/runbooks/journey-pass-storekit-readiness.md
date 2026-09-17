# Journey Pass StoreKit 接入前检查

本清单供 #226 使用，不是上架授权。

1. 保持 `journey-pass-catalog/1` 为 `development_only`，直到实际 StoreKit Sandbox 商品与服务端验证路径都已验证。
2. 从实际账户记录 SKU、商品类型、合同主体、税费和 StoreKit 地区价格；不要把 USD 参考价写成店面价格。
3. 针对同一账号验证可信购买时间、720 小时独立 Grant、提前购买排队、恢复不新增额度、退款仅影响对应 Grant、以及乱序交易对账。
4. 在 #227 已批准完整 ServiceTask 数量和跨期规则前，保持容量 `record_only_pending_decision`；不把旧 Ask 数字迁移为新额度。
5. Sandbox/TestFlight 交易不记为真实付费，未上线商品不收取私人款项。
