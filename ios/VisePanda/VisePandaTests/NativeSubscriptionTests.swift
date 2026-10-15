import Foundation
import Testing
@testable import VisePanda

/// Synthetic transport/state tests. They prove no Apple transaction, account or target runtime.
@MainActor struct NativeSubscriptionTests {
    private var owner: String { "00000000-0000-4000-8000-000000000001" }
    private var scope: NativeSubscriptionScope {
        .init(endpoint: "https://example.invalid", ownerID: owner, mobileEpoch: 1, generation: 1)
    }
    private var wall: Date { Date(timeIntervalSince1970: 1_792_022_400) } // 2026-10-15T00:00:00Z
    private func envelope(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: ["data": value], options: [.sortedKeys]) }
    private func fixture(_ locale: String = "en") throws -> Data {
        if let root = ProcessInfo.processInfo.environment["SUBSCRIPTION_FIXTURES"] {
            return try Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("catalog-\(locale).json"))
        }
        let url = try #require(Bundle(for: NativeSubscriptionFixtureAnchor.self).url(
            forResource: "catalog-\(locale)", withExtension: "json", subdirectory: "SubscriptionNative"))
        return try Data(contentsOf: url)
    }
    private func catalog(_ locale: String = "en") throws -> [String: Any] {
        let envelope = try #require(JSONSerialization.jsonObject(with: fixture(locale)) as? [String: Any])
        return try #require(envelope["data"] as? [String: Any])
    }
    private func snapshot(_ state: String = "active") -> [String: Any] {
        let noOwner = ["unavailable", "reconciliation_required"].contains(state)
        let noPeriod = noOwner || state == "none"
        let period: [String: Any] = ["transactionId": "1001", "originalTransactionId": "1000", "productId": "test.monthly",
            "subscriptionGroupId": "123", "purchaseAt": "2026-10-01T00:00:00.000Z", "expiresAt": state == "expired" ? "2026-10-10T00:00:00.000Z" : "2026-11-01T00:00:00.000Z",
            "revokedAt": state == "revoked" ? "2026-10-14T00:00:00.000Z" : NSNull(), "descriptorId": "Sandbox:1001",
            "catalogVersion": 3, "policyVersion": "subscription-development-policy/1"]
        return ["schemaVersion": "subscription-entitlement/1", "sourceEnvironment": noOwner ? NSNull() : "Sandbox",
            "localTest": false, "ownerId": noOwner ? NSNull() : owner, "catalogVersion": 3,
            "policyVersion": "subscription-development-policy/1", "state": state, "period": noPeriod ? NSNull() : period,
            "remainingCapacity": NSNull(), "purchaseEnabled": false, "runtimeCapacityEnabled": false]
    }
    private func decode(_ value: [String: Any], now: Date? = nil) throws -> NativeSubscriptionEntitlement {
        try NativeSubscriptionCodec.entitlement(envelope(value), scope: scope, now: now ?? wall)
    }

    @Test func sameProducerCatalogBothLocalesHasNoPriceOrBalance() throws {
        for locale in [NativeSubscriptionLocale.en, .zh] {
            let result = try NativeSubscriptionCodec.catalog(fixture(locale.rawValue), locale: locale)
            #expect(result.locale == locale)
            #expect(!result.subscriptionDescription.isEmpty)
        }
        #expect(throws: (any Error).self) { try NativeSubscriptionCodec.catalog(fixture("zh"), locale: .en) }
    }

    @Test func catalogRejectsUnknownFieldsPolicyTypesAndSales() throws {
        let value = try catalog()
        for (key, bad) in [("extra", true as Any), ("catalogVersion", true), ("catalogVersion", 4), ("catalogVersion", 1e100), ("policyVersion", "old"), ("price", 0), ("purchaseEnabled", true), ("storeKitProductId", "real"), ("saleState", "live")] {
            var changed = value; changed[key] = bad
            #expect(throws: (any Error).self) { try NativeSubscriptionCodec.catalog(envelope(changed), locale: .en) }
        }
        for key in value.keys {
            var changed = value; changed.removeValue(forKey: key)
            #expect(throws: (any Error).self) { try NativeSubscriptionCodec.catalog(envelope(changed), locale: .en) }
        }
        var changed = value
        var sub = try #require(changed["subscription"] as? [String: Any]); sub["balance"] = 80; changed["subscription"] = sub
        #expect(throws: (any Error).self) { try NativeSubscriptionCodec.catalog(envelope(changed), locale: .en) }
        changed = value; changed["promises"] = ["unlimited": true, "humanServiceIncluded": false]
        #expect(throws: (any Error).self) { try NativeSubscriptionCodec.catalog(envelope(changed), locale: .en) }
    }

    @Test func allClosedStatesPreserveStateAndNullCapacity() throws {
        for state in ["none", "active", "expired", "revoked", "reconciliation_required", "unavailable"] {
            #expect(try decode(snapshot(state)).state.rawValue == state)
        }
    }

    @Test func unknownMalformedMissingAndOverlargeFieldsFailClosed() throws {
        let value = snapshot()
        for (key, bad) in [("state", "unknown" as Any), ("sourceEnvironment", "Production"), ("catalogVersion", 1e100), ("catalogVersion", true), ("catalogVersion", NSNull()), ("remainingCapacity", 80), ("remainingCapacity", 0), ("purchaseEnabled", 0), ("purchaseEnabled", true), ("runtimeCapacityEnabled", true), ("localTest", 0), ("extra", false), ("period", NSNull()), ("ownerId", NSNull()), ("schemaVersion", "subscription-entitlement/2")] {
            var changed = value; changed[key] = bad
            #expect(throws: (any Error).self) { try decode(changed) }
        }
        for key in value.keys {
            var changed = value; changed.removeValue(forKey: key)
            #expect(throws: (any Error).self) { try decode(changed) }
        }
        for data in [Data(), Data("null".utf8), Data("{bad}".utf8), Data("{\"data\":null}".utf8), Data(repeating: 32, count: 65_537), try JSONSerialization.data(withJSONObject: ["data": value, "other": true])] {
            #expect(throws: (any Error).self) { try NativeSubscriptionCodec.entitlement(data, scope: scope, now: wall) }
        }
    }

    @Test func localTestNeverMasqueradesAsSandboxOrProduction() throws {
        var value = snapshot(); value["sourceEnvironment"] = "localTest"; value["localTest"] = true
        #expect(throws: (any Error).self) { try decode(value) }
        value["localTest"] = false
        #expect(throws: (any Error).self) { try decode(value) }
        value = snapshot(); value["localTest"] = true
        #expect(throws: (any Error).self) { try decode(value) }
        value = snapshot("unavailable"); value["ownerId"] = owner
        #expect(throws: (any Error).self) { try decode(value) }
    }

    @Test func ownerScopeAndPeriodIdentityMustMatch() throws {
        var value = snapshot(); value["ownerId"] = "00000000-0000-4000-8000-000000000002"
        #expect(throws: (any Error).self) { try decode(value) }
        let base = try #require(snapshot()["period"] as? [String: Any])
        for (key, bad) in [("descriptorId", "localTest:1001" as Any), ("transactionId", 1001), ("subscriptionGroupId", "dev.group"), ("catalogVersion", 2), ("policyVersion", "old"), ("purchaseAt", "2026-13-01T00:00:00.000Z"), ("expiresAt", "2026-11-01T00:00:00Z"), ("expiresAt", "9999-11-01T00:00:00.000Z"), ("revokedAt", "2026-10-14T00:00:00.000Z"), ("extra", true)] {
            var p = base; p[key] = bad; value = snapshot(); value["period"] = p
            #expect(throws: (any Error).self) { try decode(value) }
        }
    }

    @Test func halfOpenPeriodCannotBecomeActiveEarlyOrAfterExpiry() throws {
        let value = snapshot()
        let start = try #require(ISO8601DateFormatter().date(from: "2026-10-01T00:00:00Z"))
        let end = try #require(ISO8601DateFormatter().date(from: "2026-11-01T00:00:00Z"))
        #expect(throws: (any Error).self) { try decode(value, now: start.addingTimeInterval(-0.001)) }
        #expect(try decode(value, now: start).state == .active)
        #expect(try decode(value, now: end.addingTimeInterval(-0.001)).state == .active)
        #expect(throws: (any Error).self) { try decode(value, now: end) }
        #expect(throws: (any Error).self) { try decode(snapshot("expired"), now: start) }
    }

    @Test func defaultIsRealUnavailableAndNeverSendsReads() async {
        let store = NativeSubscriptionStore()
        await store.reload(locale: .en)
        #expect(store.phase == .unavailable)
        #expect(store.visibleEntitlement == nil)
        #expect(store.catalog == nil)
    }

    @Test func readOnlyReloadStateTransitionsAndFailureClearOldPrivateData() async throws {
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        let store = NativeSubscriptionStore(port: fake, now: { wall })
        await store.reload(locale: .en)
        #expect(store.phase == .loaded)
        #expect(store.visibleEntitlement?.state == .active)
        #expect(fake.requests.map(\.resource) == [.catalog(.en), .entitlement])
        #expect(Set(fake.requests.map(\.nonce)).count == 1)
        for state in ["revoked", "expired", "none", "reconciliation_required", "unavailable"] {
            fake.entitlement = try envelope(snapshot(state)); await store.reload(locale: .en)
            #expect(store.visibleEntitlement?.state.rawValue == state)
        }
        fake.fail = true
        await store.reload(locale: .en)
        #expect(store.phase == .unavailable)
        #expect(store.visibleEntitlement == nil)
        #expect(store.catalog == nil)
    }

    @Test func actorSwitchImmediatelyHidesLoadedInformationBeforeReload() async throws {
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        let store = NativeSubscriptionStore(port: fake, now: { wall })
        await store.reload(locale: .en)
        fake.currentScope = .init(endpoint: scope.endpoint, ownerID: "00000000-0000-4000-8000-000000000002", mobileEpoch: 1, generation: 2)
        #expect(store.visibleEntitlement == nil)
        store.invalidateIfScopeChanged()
        #expect(store.catalog == nil)
        fake.currentScope = scope
        #expect(store.visibleEntitlement == nil)
    }

    @Test func endpointEpochAndGenerationDriftHideLoadedState() async throws {
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        let store = NativeSubscriptionStore(port: fake, now: { wall })
        for changed in [NativeSubscriptionScope(endpoint: "https://other.invalid", ownerID: owner, mobileEpoch: 1, generation: 1), .init(endpoint: scope.endpoint, ownerID: owner, mobileEpoch: 2, generation: 1), .init(endpoint: scope.endpoint, ownerID: owner, mobileEpoch: 1, generation: 2)] {
            fake.currentScope = scope; await store.reload(locale: .en)
            #expect(store.visibleEntitlement != nil)
            fake.currentScope = changed
            #expect(store.visibleEntitlement == nil)
        }
    }

    @Test func oldNonceCannotOverwriteNewerReadEvenForSameAccount() async throws {
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        fake.holdEntitlement = true
        let store = NativeSubscriptionStore(port: fake, now: { wall })
        let first = Task { await store.reload(locale: .en) }
        while fake.pending == nil { await Task.yield() }
        #expect(store.phase == .loading)
        #expect(store.visibleEntitlement == nil)
        fake.holdEntitlement = false
        fake.entitlement = try envelope(snapshot("revoked"))
        await store.reload(locale: .en)
        #expect(store.visibleEntitlement?.state == .revoked)
        fake.resume(try envelope(snapshot()))
        await first.value
        #expect(store.visibleEntitlement?.state == .revoked)
    }

    @Test func backgroundAndSignOutRejectLateCallbacks() async throws {
        for background in [false, true] {
            let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
            fake.holdEntitlement = true
            let store = NativeSubscriptionStore(port: fake, now: { wall })
            let task = Task { await store.reload(locale: .en) }
            while fake.pending == nil { await Task.yield() }
            if background { store.setForeground(false) } else { fake.currentScope = nil; store.invalidateIfScopeChanged() }
            fake.resume(try envelope(snapshot()))
            await task.value
            #expect(store.phase == .unavailable)
            #expect(store.visibleEntitlement == nil)
            #expect(store.catalog == nil)
        }
    }

    @Test func expirationAtRenderHidesActiveWithoutInventingExpiredReceipt() async throws {
        let clock = SubscriptionTestClock(wall)
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        let store = NativeSubscriptionStore(port: fake, now: { clock.value })
        await store.reload(locale: .en)
        #expect(store.visibleEntitlement?.state == .active)
        clock.value = try #require(ISO8601DateFormatter().date(from: "2026-11-01T00:00:00Z"))
        #expect(store.visibleEntitlement == nil)
    }

    @Test func cancellationAndInvalidPayloadDoNotLeaveLoadedOrLoadingState() async throws {
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        fake.holdEntitlement = true
        let store = NativeSubscriptionStore(port: fake, now: { wall })
        let task = Task { await store.reload(locale: .en) }
        while fake.pending == nil { await Task.yield() }
        task.cancel(); fake.resume(try envelope(snapshot()))
        await task.value
        // A cancellation thrown by the real Session adapter clears the matching operation.
        #expect(store.visibleEntitlement == nil)
        #expect(store.phase == .unavailable)
        fake.holdEntitlement = false; fake.entitlement = Data("invalid".utf8)
        await store.reload(locale: .en)
        #expect(store.phase == .unavailable)
    }

    @Test func sessionPortChecksScopeBeforeAndAfterRead() async throws {
        let fake = FakeSubscriptionPort(scope: scope, catalog: try fixture(), entitlement: try envelope(snapshot()))
        let port = NativeSubscriptionSessionReadPort(scope: { fake.currentScope }, get: { request in
            let bytes = try await fake.read(request)
            fake.currentScope = nil
            return bytes
        })
        await #expect(throws: (any Error).self) { try await port.read(.init(scope: scope, resource: .entitlement, nonce: UUID())) }
        #expect(fake.requests.count == 1)
        await #expect(throws: (any Error).self) { try await port.read(.init(scope: scope, resource: .entitlement, nonce: UUID())) }
        #expect(fake.requests.count == 1)
    }

    @Test func localizedStatusNeverCallsUnknownAZeroOrAProductionSubscription() {
        for chinese in [false, true] {
            let copy = NativeSubscriptionCopy(chinese: chinese)
            #expect(!copy.notPurchasable.isEmpty && !copy.free.isEmpty && !copy.balance.isEmpty)
            #expect(copy.status(.active).contains("Sandbox"))
            #expect(copy.status(.none).contains("Sandbox"))
            #expect(copy.status(.unavailable) != copy.status(.none))
        }
    }
}

@MainActor private final class SubscriptionTestClock {
    var value: Date
    init(_ value: Date) { self.value = value }
}

@MainActor private final class FakeSubscriptionPort: NativeSubscriptionReadPort {
    var currentScope: NativeSubscriptionScope?
    var catalog: Data
    var entitlement: Data
    var requests: [NativeSubscriptionRequest] = []
    var fail = false
    var holdEntitlement = false
    var pending: CheckedContinuation<Data, any Error>?
    init(scope: NativeSubscriptionScope, catalog: Data, entitlement: Data) {
        currentScope = scope; self.catalog = catalog; self.entitlement = entitlement
    }
    func read(_ request: NativeSubscriptionRequest) async throws -> Data {
        requests.append(request)
        if fail { throw NativeSubscriptionError.unavailable }
        switch request.resource {
        case .catalog: return catalog
        case .entitlement:
            if holdEntitlement { return try await withCheckedThrowingContinuation { pending = $0 } }
            try Task.checkCancellation()
            return entitlement
        }
    }
    func resume(_ data: Data) { let old = pending; pending = nil; old?.resume(returning: data) }
}

private final class NativeSubscriptionFixtureAnchor: NSObject {}
