import Foundation
import CoreFoundation

/// Consumer of the producers' closed presentation and subscription-entitlement/1 wires.
/// Parsing a snapshot is never evidence of an Apple signature: the authenticated server read port
/// supplies that authority. A local StoreKit record is deliberately ineligible for this projection.
enum NativeSubscriptionCodec {
    private static let policy = "subscription-development-policy/1"
    private static let benefits = ["explicit_cross_trip_preferences", "trip_and_data_controls"]

    static func catalog(_ bytes: Data, locale: NativeSubscriptionLocale) throws -> NativeSubscriptionCatalog {
        let v = try root(bytes)
        try keys(v, ["schemaVersion", "catalogVersion", "policyVersion", "locale", "saleState", "purchaseEnabled", "price", "storeKitProductId", "status", "free", "subscription", "promises"])
        guard v["schemaVersion"] as? String == "subscription-development/1",
              try integer(v["catalogVersion"]) == 3, v["policyVersion"] as? String == policy,
              v["locale"] as? String == locale.rawValue,
              v["saleState"] as? String == "development_only",
              try boolean(v["purchaseEnabled"]) == false,
              v["price"] is NSNull, v["storeKitProductId"] is NSNull else { throw NativeSubscriptionError.invalidResponse }
        let free = try object(v["free"])
        try keys(free, ["name", "sharedBenefits", "description"])
        let subscription = try object(v["subscription"])
        try keys(subscription, ["name", "kind", "period", "durationAuthority", "sharedBenefits", "description"])
        let period = try object(subscription["period"])
        try keys(period, ["unit", "value"])
        let promises = try object(v["promises"])
        try keys(promises, ["unlimited", "humanServiceIncluded"])
        guard free["sharedBenefits"] as? [String] == benefits,
              subscription["sharedBenefits"] as? [String] == benefits,
              subscription["kind"] as? String == "auto_renewing",
              subscription["durationAuthority"] as? String == "apple_verified_period",
              period["unit"] as? String == "month", try integer(period["value"]) == 1,
              try !boolean(promises["unlimited"]), try !boolean(promises["humanServiceIncluded"]) else {
            throw NativeSubscriptionError.invalidResponse
        }
        return try .init(locale: locale, status: string(v["status"]), freeName: string(free["name"]),
                         freeDescription: string(free["description"]), subscriptionName: string(subscription["name"]),
                         subscriptionDescription: string(subscription["description"]))
    }

    static func entitlement(_ bytes: Data, scope: NativeSubscriptionScope, now: Date) throws -> NativeSubscriptionEntitlement {
        guard scope.valid else { throw NativeSubscriptionError.invalidResponse }
        let v = try root(bytes, maximum: 8_192)
        try keys(v, ["schemaVersion", "sourceEnvironment", "localTest", "ownerId", "catalogVersion", "policyVersion", "state", "period", "remainingCapacity", "purchaseEnabled", "runtimeCapacityEnabled"])
        guard v["schemaVersion"] as? String == "subscription-entitlement/1",
              try integer(v["catalogVersion"]) == 3, v["policyVersion"] as? String == policy,
              let rawState = v["state"] as? String, let state = NativeSubscriptionStatus(rawValue: rawState),
              v["remainingCapacity"] is NSNull,
              try !boolean(v["purchaseEnabled"]), try !boolean(v["runtimeCapacityEnabled"]),
              try !boolean(v["localTest"]) else { throw NativeSubscriptionError.invalidResponse }
        if state == .unavailable || state == .reconciliationRequired {
            guard v["ownerId"] is NSNull, v["period"] is NSNull, v["sourceEnvironment"] is NSNull else {
                throw NativeSubscriptionError.invalidResponse
            }
            return .init(state: state, environment: nil, ownerID: nil, period: nil)
        }
        guard let owner = v["ownerId"] as? String, owner.lowercased() == scope.ownerID,
              v["sourceEnvironment"] as? String == "Sandbox" else { throw NativeSubscriptionError.invalidResponse }
        if state == .none {
            guard v["period"] is NSNull else { throw NativeSubscriptionError.invalidResponse }
            return .init(state: state, environment: .sandbox, ownerID: scope.ownerID, period: nil)
        }
        let p = try object(v["period"])
        try keys(p, ["transactionId", "originalTransactionId", "productId", "subscriptionGroupId", "purchaseAt", "expiresAt", "revokedAt", "descriptorId", "catalogVersion", "policyVersion"])
        let transaction = try decimalID(p["transactionId"])
        _ = try decimalID(p["originalTransactionId"])
        _ = try decimalID(p["subscriptionGroupId"])
        _ = try string(p["productId"], maximum: 200)
        guard p["descriptorId"] as? String == "Sandbox:\(transaction)",
              try integer(p["catalogVersion"]) == 3, p["policyVersion"] as? String == policy else {
            throw NativeSubscriptionError.invalidResponse
        }
        let purchase = try date(p["purchaseAt"]), end = try date(p["expiresAt"])
        let revoked = p["revokedAt"] is NSNull ? nil : try date(p["revokedAt"])
        guard purchase < end, (state == .revoked) == (revoked != nil), revoked.map({ $0 >= purchase }) ?? true else { throw NativeSubscriptionError.invalidResponse }
        // Half-open trusted period. Do not infer active from a device-local transaction or from HTTP success.
        if state == .active {
            guard purchase <= now, now < end, end.timeIntervalSince(now) <= 366 * 24 * 3_600 else {
                throw NativeSubscriptionError.invalidResponse
            }
        }
        if state == .expired, end > now { throw NativeSubscriptionError.invalidResponse }
        return .init(state: state, environment: .sandbox, ownerID: scope.ownerID,
                     period: .init(purchaseAt: purchase, expiresAt: end, revokedAt: revoked))
    }

    /// Exact top-level envelope. Main's GET adapter must wrap either producer projection as {data: ...}.
    private static func root(_ bytes: Data, maximum: Int = 65_536) throws -> [String: Any] {
        guard !bytes.isEmpty, bytes.count <= maximum else { throw NativeSubscriptionError.invalidResponse }
        let envelope = try object(JSONSerialization.jsonObject(with: bytes, options: []))
        try keys(envelope, ["data"])
        return try object(envelope["data"])
    }

    private static func object(_ value: Any?) throws -> [String: Any] {
        guard let value = value as? [String: Any] else { throw NativeSubscriptionError.invalidResponse }
        return value
    }
    private static func keys(_ object: [String: Any], _ expected: Set<String>) throws {
        guard Set(object.keys) == expected else { throw NativeSubscriptionError.invalidResponse }
    }
    private static func string(_ raw: Any?, maximum: Int = 1_024) throws -> String {
        guard let value = raw as? String, !value.isEmpty, value.utf8.count <= maximum,
              !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw NativeSubscriptionError.invalidResponse
        }
        return value
    }
    private static func boolean(_ raw: Any?) throws -> Bool {
        guard let value = raw as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else {
            throw NativeSubscriptionError.invalidResponse
        }
        return value.boolValue
    }
    private static func integer(_ raw: Any?) throws -> Int {
        guard let value = raw as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              !["d", "f"].contains(String(cString: value.objCType)),
              value.int64Value >= 0, value.int64Value <= 1_000 else { throw NativeSubscriptionError.invalidResponse }
        return value.intValue
    }
    private static func decimalID(_ raw: Any?) throws -> String {
        let value = try string(raw, maximum: 32)
        guard value.utf8.allSatisfy({ (48...57).contains($0) }) else { throw NativeSubscriptionError.invalidResponse }
        return value
    }
    private static func date(_ raw: Any?) throws -> Date {
        let value = try string(raw, maximum: 24)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard value.utf8.count == 24, let date = formatter.date(from: value), formatter.string(from: date) == value,
              date.timeIntervalSince1970.isFinite, (0...4_102_444_800).contains(date.timeIntervalSince1970) else {
            throw NativeSubscriptionError.invalidResponse
        }
        return date
    }
}
