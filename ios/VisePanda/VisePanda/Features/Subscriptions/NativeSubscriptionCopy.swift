import Foundation

struct NativeSubscriptionCopy {
    let chinese: Bool
    func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var title: String { text("订阅与权益", "Subscription and entitlements") }
    var unavailable: String { text("当前订阅状态暂不可核实", "Current subscription status cannot be verified") }
    var unavailableDetail: String { text("尚未取得当前账号的可信权益。请稍后刷新；这不代表未订阅，也不代表余额为零。", "A trusted entitlement for this account is unavailable. Refresh later; this does not mean no subscription or a zero balance.") }
    var notPurchasable: String { text("尚不可购买", "Not available to purchase") }
    var free: String { text("Free 保留基础记忆、纠错、导出与删除，以及可用首值。", "Free retains basic memory, correction, export, deletion and usable first value.") }
    var baseline: String { text("开发配置不代表真实余额或销售承诺；本页不提供购买、恢复交易或权益发放。", "Development configuration is not a real balance or sales promise. This page provides no purchase, transaction restoration or entitlement grant.") }
    var balance: String { text("剩余容量：未知", "Remaining capacity: unknown") }
    var legacy: String { text("查看原有 Pass 权益", "View existing Pass entitlements") }
    var controls: String { text("记忆与资料控制", "Memory and data controls") }
    var refresh: String { text("刷新只读状态", "Refresh read-only status") }
    var provenance: String { text("仅显示服务端核验的 Sandbox 测试周期，不代表正式订阅；Xcode 本地测试另行区分。", "Shows only server-verified Sandbox test periods, not a production subscription. Xcode local testing is separate.") }
    func status(_ state: NativeSubscriptionStatus) -> String {
        switch state {
        case .none: text("Sandbox：无已核实订阅", "Sandbox: no verified subscription")
        case .active: text("Sandbox 测试周期生效中", "Sandbox test period active")
        case .expired: text("Sandbox 测试周期已到期", "Sandbox test period expired")
        case .revoked: text("Sandbox 测试周期已撤销", "Sandbox test period revoked")
        case .reconciliationRequired: text("权益需要对账，状态不可确认", "Reconciliation required; entitlement unconfirmed")
        case .unavailable: unavailable
        }
    }
}
