import Foundation

enum NativeSubscriptionStatus: String, Sendable {
    case none, active, expired, revoked, reconciliationRequired = "reconciliation_required", unavailable
}
enum NativeSubscriptionEnvironment: String, Sendable { case sandbox = "Sandbox", localTest }

struct NativeSubscriptionPeriod: Equatable, Sendable {
    let purchaseAt: Date
    let expiresAt: Date
    let revokedAt: Date?
}

/// A validated display projection, never an authorization or a capacity ledger.
struct NativeSubscriptionEntitlement: Equatable, Sendable {
    let state: NativeSubscriptionStatus
    let environment: NativeSubscriptionEnvironment?
    let ownerID: String?
    let period: NativeSubscriptionPeriod?
}

struct NativeSubscriptionCatalog: Equatable, Sendable {
    let locale: NativeSubscriptionLocale
    let status: String
    let freeName: String
    let freeDescription: String
    let subscriptionName: String
    let subscriptionDescription: String
}
