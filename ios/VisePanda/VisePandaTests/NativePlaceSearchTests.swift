import XCTest
@testable import VisePanda

nonisolated final class NativePlaceSearchTests: XCTestCase {
    @MainActor
    func testRouteHandoffRetainsPOIIdentityAndGCJCoordinates() throws {
        let start = NativePlaceDetail(provider: .amap, providerPoiId: "start", rawName: "上海 & 起点", address: nil, location: .init(lat: 31.2, lng: 121.4, coordinateSystem: "gcj02"))
        let end = NativePlaceDetail(provider: .amap, providerPoiId: "end", rawName: "终点", address: nil, location: .init(lat: 31.3, lng: 121.5, coordinateSystem: "gcj02"))
        let value = NativeRouteReply(provider: "amap", origin: start, destination: end, observedAt: "2026-09-22T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", options: [])
        let url = try XCTUnwrap(value.appURL(mode: "walking"))
        let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        let parameters = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(url.scheme, "iosamap"); XCTAssertEqual(url.host, "path")
        XCTAssertEqual(parameters["sid"], "start"); XCTAssertEqual(parameters["did"], "end")
        XCTAssertEqual(parameters["slon"], "121.4"); XCTAssertEqual(parameters["dlat"], "31.3")
        XCTAssertEqual(parameters["dev"], "0"); XCTAssertEqual(parameters["t"], "2")
        XCTAssertEqual(parameters["sname"], "上海 & 起点")
        XCTAssertFalse(value.expired(at: Date())); XCTAssertNil(value.appURL(mode: "unknown"))
    }

    @MainActor
    func testRouteReplyRefreshesPinnedAddress() async {
        let store = NativeRouteStore()
        store.choose(NativePlaceDetail(provider: .amap, providerPoiId: "start", rawName: "Start", address: "Old start", location: .init(lat: 31.2, lng: 121.4, coordinateSystem: "gcj02")), start: true)
        store.choose(NativePlaceDetail(provider: .amap, providerPoiId: "end", rawName: "End", address: "Old end", location: .init(lat: 31.3, lng: 121.5, coordinateSystem: "gcj02")), start: false)
        let data = #"{"provider":"amap","origin":{"provider":"amap","providerPoiId":"start","rawName":"Start","address":"Fresh start","location":{"lat":31.2,"lng":121.4,"coordinateSystem":"gcj02"}},"destination":{"provider":"amap","providerPoiId":"end","rawName":"End","address":"Fresh end","location":{"lat":31.3,"lng":121.6,"coordinateSystem":"gcj02"}},"observedAt":"2026-09-22T00:00:00.000Z","expiresAt":"2099-01-01T00:00:00.000Z","options":[{"mode":"walking","status":"no_routes"},{"mode":"transit","status":"no_routes"},{"mode":"driving","status":"no_routes"}]}"#
        await store.compare { _ in Data(data.utf8) }
        XCTAssertNotNil(store.reply)
        XCTAssertEqual(store.origin?.address, "Fresh start")
        XCTAssertEqual(store.destination?.address, "Fresh end")
        XCTAssertEqual(store.destination?.location?.lng, 121.6)
    }

    @MainActor
    func testRouteSelectionRejectsValidLateResponse() async {
        let store = NativeRouteStore(), delayed = DeferredPlaceReply()
        let start = NativePlaceDetail(provider: .amap, providerPoiId: "start", rawName: "Start", address: "Start address", location: .init(lat: 31.2, lng: 121.4, coordinateSystem: "gcj02"))
        let end = NativePlaceDetail(provider: .amap, providerPoiId: "end", rawName: "End", address: "End address", location: .init(lat: 31.3, lng: 121.5, coordinateSystem: "gcj02"))
        let next = NativePlaceDetail(provider: .amap, providerPoiId: "next", rawName: "Next", address: "New selection", location: .init(lat: 31.4, lng: 121.7, coordinateSystem: "gcj02"))
        store.choose(start, start: true); store.choose(end, start: false)
        let pending = Task { await store.compare { _ in await delayed.read() } }
        await delayed.waitUntilStarted()
        store.choose(next, start: false)
        let stale = #"{"provider":"amap","origin":{"provider":"amap","providerPoiId":"start","rawName":"Start","location":{"lat":31.2,"lng":121.4,"coordinateSystem":"gcj02"}},"destination":{"provider":"amap","providerPoiId":"end","rawName":"End","address":"Late old address","location":{"lat":31.3,"lng":121.5,"coordinateSystem":"gcj02"}},"observedAt":"2026-09-22T00:00:00.000Z","expiresAt":"2099-01-01T00:00:00.000Z","options":[{"mode":"walking","status":"no_routes"},{"mode":"transit","status":"no_routes"},{"mode":"driving","status":"no_routes"}]}"#
        delayed.finish(Data(stale.utf8))
        await pending.value
        XCTAssertNil(store.reply); XCTAssertFalse(store.unavailable)
        XCTAssertEqual(store.destination?.providerPoiId, "next")
        XCTAssertEqual(store.destination?.address, "New selection")
        XCTAssertEqual(store.destination?.location?.lng, 121.7)
    }

    @MainActor
    func testRouteClearRejectsLateResponse() async throws {
        let store = NativeRouteStore(), delayed = DeferredPlaceReply()
        let start = NativePlaceDetail(provider: .amap, providerPoiId: "start", rawName: "Start", address: nil, location: .init(lat: 31.2, lng: 121.4, coordinateSystem: "gcj02"))
        let end = NativePlaceDetail(provider: .amap, providerPoiId: "end", rawName: "End", address: nil, location: .init(lat: 31.3, lng: 121.5, coordinateSystem: "gcj02"))
        store.choose(start, start: true); store.choose(end, start: false)
        let pending = Task { await store.compare { _ in await delayed.read() } }
        await delayed.waitUntilStarted()
        store.clear()
        delayed.finish(Data("{}".utf8))
        await pending.value
        XCTAssertNil(store.reply); XCTAssertNil(store.origin); XCTAssertNil(store.destination)
        XCTAssertFalse(store.loading); XCTAssertFalse(store.unavailable)
    }

    @MainActor
    func testRouteIdentityMismatchAndExpiryFailClosed() async throws {
        let store = NativeRouteStore()
        let start = NativePlaceDetail(provider: .amap, providerPoiId: "start", rawName: "Start", address: nil, location: .init(lat: 31.2, lng: 121.4, coordinateSystem: "gcj02"))
        let end = NativePlaceDetail(provider: .amap, providerPoiId: "end", rawName: "End", address: nil, location: .init(lat: 31.3, lng: 121.5, coordinateSystem: "gcj02"))
        store.choose(start, start: true); store.choose(end, start: false)
        let invalid = #"{"provider":"amap","origin":{"provider":"amap","providerPoiId":"wrong","rawName":"Wrong"},"destination":{"provider":"amap","providerPoiId":"end","rawName":"End"},"observedAt":"2026-09-22T00:00:00.000Z","expiresAt":"2020-01-01T00:00:00.000Z","options":[]}"#
        await store.compare { _ in Data(invalid.utf8) }
        XCTAssertNil(store.reply); XCTAssertTrue(store.unavailable)
        let reply = try JSONDecoder().decode(NativeRouteReply.self, from: Data(invalid.utf8))
        XCTAssertTrue(reply.expired(at: Date())); XCTAssertNil(reply.appURL(mode: "walking"))
    }

    @MainActor private var scope: NativeDataScope {
        .init(endpoint: "http://127.0.0.1", subject: "synthetic-owner", mobileEpoch: 1, generation: 1)
    }

    @MainActor
    func testLateSuggestionsCannotReplaceNewQuery() async throws {
        let store = NativePlaceSearchStore()
        let delayed = DeferredPlaceReply()
        let old = Task { await store.suggest(scope: scope) { await delayed.read() } }
        await delayed.waitUntilStarted()
        await store.suggest(scope: scope) { Data(#"{"candidates":[{"provider":"amap","rawName":"New place"}]}"#.utf8) }
        delayed.finish(Data(#"{"candidates":[{"provider":"amap","rawName":"Old place"}]}"#.utf8))
        await old.value
        XCTAssertEqual(store.suggestions.map(\.rawName), ["New place"])
    }

    @MainActor
    func testLateAddressCannotReplaceNewSelection() async throws {
        let store = NativePlaceSearchStore()
        let delayed = DeferredPlaceReply()
        let old = Task { await store.readAddress(scope: scope) { await delayed.read() } }
        await delayed.waitUntilStarted()
        await store.readAddress(scope: scope) { Data(#"{"result":{"provider":"amap","formattedAddress":"New address"}}"#.utf8) }
        delayed.finish(Data(#"{"result":{"provider":"amap","formattedAddress":"Old address"}}"#.utf8))
        await old.value
        XCTAssertEqual(store.observedAddress, "New address")
    }

    @MainActor
    func testContextResetRejectsAllPendingPlaceResponses() async throws {
        let store = NativePlaceSearchStore()
        let searchReply = DeferredPlaceReply(), suggestionsReply = DeferredPlaceReply(), addressReply = DeferredPlaceReply()
        let search = Task { await store.search(scope: scope, provider: .amap, query: "old", city: "shanghai") { await searchReply.read() } }
        await searchReply.waitUntilStarted()
        let tips = Task { await store.suggest(scope: scope) { await suggestionsReply.read() } }
        await suggestionsReply.waitUntilStarted()
        let address = Task { await store.readAddress(scope: scope) { await addressReply.read() } }
        await addressReply.waitUntilStarted()
        store.clear() // Same invalidation used for input, account, tab and screen changes.
        searchReply.finish(Data(#"{"candidates":[{"provider":"amap","providerPoiId":"old","rawName":"Old place"}]}"#.utf8))
        suggestionsReply.finish(Data(#"{"candidates":[{"provider":"amap","rawName":"Old suggestion"}]}"#.utf8))
        addressReply.finish(Data(#"{"result":{"provider":"amap","formattedAddress":"Old address"}}"#.utf8))
        await search.value; await tips.value; await address.value
        XCTAssertTrue(store.candidates.isEmpty)
        XCTAssertTrue(store.suggestions.isEmpty)
        XCTAssertNil(store.observedAddress)
        XCTAssertNil(store.selectedID)
        XCTAssertNil(store.scope)
        XCTAssertEqual(store.state, .idle)
    }

    @MainActor
    func testLateDetailCannotRestorePreviousSelection() async {
        let store = NativePlaceSearchStore()
        let delayed = DeferredPlaceReply()
        let first = NativePlaceCandidate(provider: .amap, providerPoiId: "first", rawName: "First", matchedCanonicalPoiId: nil)
        let second = NativePlaceCandidate(provider: .amap, providerPoiId: "second", rawName: "Second", matchedCanonicalPoiId: nil)
        store.adoptSuggestion(first, scope: scope)
        let request = Task { await store.loadDetail(first) { await delayed.read() } }
        await delayed.waitUntilStarted()
        store.adoptSuggestion(second, scope: scope)
        delayed.finish(Data(#"{"detail":{"provider":"amap","providerPoiId":"first","rawName":"First","address":"Old address","location":null}}"#.utf8))
        await request.value
        XCTAssertEqual(store.selectedID, second.id)
        XCTAssertNil(store.detail)
    }

    @MainActor
    func testMissingSessionNeverFetchesTipsOrAddress() async {
        let store = NativePlaceSearchStore()
        await store.suggest(scope: nil) { XCTFail("No session must not fetch"); return Data() }
        await store.readAddress(scope: nil) { XCTFail("No session must not fetch"); return Data() }
        XCTAssertTrue(store.suggestions.isEmpty)
        XCTAssertNil(store.observedAddress)
    }

    @MainActor
    func testCancelledRequestDoesNotPublishAddress() async {
        let store = NativePlaceSearchStore()
        let delayed = DeferredPlaceReply()
        let request = Task { await store.readAddress(scope: scope) { await delayed.read() } }
        await delayed.waitUntilStarted()
        request.cancel()
        delayed.finish(Data(#"{"result":{"provider":"amap","formattedAddress":"Cancelled"}}"#.utf8))
        await request.value
        XCTAssertNil(store.observedAddress)
    }
}

@MainActor
private final class DeferredPlaceReply {
    private var continuation: CheckedContinuation<Data, Never>?
    func read() async -> Data { await withCheckedContinuation { continuation = $0 } }
    func waitUntilStarted() async {
        while continuation == nil { await Task.yield() }
    }
    func finish(_ data: Data) {
        continuation?.resume(returning: data)
        continuation = nil
    }
}
