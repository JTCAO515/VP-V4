import XCTest
@testable import VisePanda

nonisolated final class NativeTripStateTests: XCTestCase {
    @MainActor
    func testRelativeOutlineRequiresSupportedInputsAndKeepsUnknowns() throws {
        let outline = try XCTUnwrap(NativeRelativeOutline.make(from: "第一次去上海四天，喜欢吃和散步，日期未定", chinese: true))
        XCTAssertEqual(outline.city, "上海")
        XCTAssertEqual(outline.count, 4)
        XCTAssertEqual(outline.foodFirst.count, 4)
        XCTAssertNotEqual(outline.foodFirst[1], outline.walkFirst[1])
        XCTAssertFalse(outline.foodFirst.joined().contains("10:00"))
        let short = try XCTUnwrap(NativeRelativeOutline.make(from: "First time in Shanghai for two days; food and walks, dates unknown", chinese: false))
        XCTAssertEqual(short.count, 2)
        XCTAssertNotEqual(short.foodFirst[0], short.walkFirst[0])
        XCTAssertNil(NativeRelativeOutline.make(from: "想去上海", chinese: true))
        XCTAssertNil(NativeRelativeOutline.make(from: "上海和北京四天，喜欢吃和散步", chinese: true))
        XCTAssertNil(NativeRelativeOutline.make(from: "Four days somewhere", chinese: false))
    }

    @MainActor
    func testOutlineBindsOnlyAfterValidNonoverlappingDateAndPreservesTrip() throws {
        let existing = NativeTripDay(id: "existing", date: "2026-10-01", timeZone: "Asia/Shanghai", items: [
            .init(id: "dinner", dayId: "existing", title: "Confirmed dinner")
        ])
        let detail = NativeTripDetail(version: 2, trip: .init(id: UUID().uuidString, title: "Saved", headVersion: 3, updatedAt: "2026-09-18"), content: .init(days: [existing]), hardLocks: .notEnabled, externalOrderStatus: .notConnected)
        var draft = NativeTripDraft(detail)
        XCTAssertFalse(draft.appendOutline(["Walk", "Food"], starting: ""))
        XCTAssertFalse(draft.appendOutline(["Walk", "Food"], starting: "2026-02-30"))
        XCTAssertFalse(draft.appendOutline(["Walk", "Food"], starting: "2026-09-30"))
        XCTAssertEqual(draft.days, [existing])
        XCTAssertTrue(draft.appendOutline(["Walk", "Food"], starting: "2026-10-02"))
        XCTAssertEqual(draft.days.map(\.date), ["2026-10-01", "2026-10-02", "2026-10-03"])
        XCTAssertEqual(draft.days[0], existing)
        XCTAssertEqual(draft.patch.expectedVersion, 3)
        XCTAssertEqual(draft.patch.operations.map(\.kind), [.upsertDay, .upsertItem, .upsertDay, .upsertItem])
        XCTAssertFalse(draft.patch.operations.contains { $0.itemId == "dinner" })
    }

    @MainActor
    func testLateRefreshCannotReviveSessionAfterTripDenial() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DelayedTripProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj05.denial.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59931"], defaults: defaults, configuration: configuration)
        await session.login(email: "owner-a", password: "unit-only")
        XCTAssertNotNil(session.dataScope)
        DelayedTripProtocol.setHoldRefresh(true)
        defer { DelayedTripProtocol.setHoldRefresh(false) }
        let trip = Task { try await session.tripRequest(path: "api/trips/native/v2", method: "GET") }
        for _ in 0..<100 where !DelayedTripProtocol.hasPending { try await Task.sleep(for: .milliseconds(10)) }
        guard DelayedTripProtocol.hasPending else { trip.cancel(); XCTFail("Trip did not reach transport"); return }
        let refresh = Task { await session.validate() }
        for _ in 0..<100 where !DelayedTripProtocol.hasRefreshPending { try await Task.sleep(for: .milliseconds(10)) }
        guard DelayedTripProtocol.hasRefreshPending else { trip.cancel(); refresh.cancel(); XCTFail("Refresh did not reach transport"); return }
        DelayedTripProtocol.denyPendingTrip()
        do { _ = try await trip.value; XCTFail("Trip denial must fail") } catch {}
        XCTAssertNil(session.dataScope)
        XCTAssertNil(session.retainedDataScope)
        DelayedTripProtocol.completeRefresh()
        await refresh.value
        XCTAssertEqual(session.status, "expiredOrReplaced")
        XCTAssertNil(session.dataScope, "An already-issued delayed refresh cannot undo an authoritative denial")
        XCTAssertNil(session.retainedDataScope)
        XCTAssertNil(session.displayName)
    }

    @MainActor
    func testTemporaryAuthenticationFailureKeepsDraftHiddenAndLogoutClearsIt() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DelayedTripProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj05.offline.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59931"], defaults: defaults, configuration: configuration)
        await session.login(email: "owner-a", password: "unit-only")
        let identity = try XCTUnwrap(session.dataScope)
        let store = NativeTripStore()
        store.reset(for: identity)
        store.draft = NativeTripDraft(.init(version: 2, trip: .init(id: UUID().uuidString, title: "Saved", headVersion: 1, updatedAt: "2026-09-10"), content: .init(days: []), hardLocks: .notEnabled, externalOrderStatus: .notConnected))
        store.draft?.title = "Unsent user edit"
        DelayedTripProtocol.setRefreshFailure(true)
        defer { DelayedTripProtocol.setRefreshFailure(false) }
        await session.validate()
        XCTAssertNil(session.dataScope, "Unavailable authentication cannot authorize requests or display Trip data")
        XCTAssertEqual(session.retainedDataScope, identity)
        store.reset(for: session.retainedDataScope)
        await store.list(using: session)
        XCTAssertEqual(store.draft?.title, "Unsent user edit")
        DelayedTripProtocol.setRefreshFailure(false)
        await session.validate()
        XCTAssertEqual(session.dataScope, identity)
        store.reset(for: session.retainedDataScope)
        XCTAssertEqual(store.draft?.title, "Unsent user edit")
        await session.logout()
        XCTAssertNil(session.retainedDataScope)
        store.reset(for: session.retainedDataScope)
        XCTAssertNil(store.draft)
    }

    @MainActor
    func testDraftOnlyChangesRequestedFieldsAndKeepsConfirmedContent() throws {
        let data = Data(#"{"version":2,"trip":{"id":"11111111-1111-4111-8111-111111111111","title":"Saved","headVersion":3,"updatedAt":"2026-09-10"},"content":{"days":[{"id":"d1","date":"2026-09-20","timeZone":"Asia/Shanghai","items":[{"id":"i1","dayId":"d1","title":"Museum","startsAt":"2026-09-20T10:00:00+08:00"}]}]},"hardLocks":"not_enabled","externalOrderStatus":"not_connected"}"#.utf8)
        let detail = try JSONDecoder().decode(NativeTripDetail.self, from: data)
        XCTAssertEqual(detail.hardLocks, .notEnabled)
        XCTAssertEqual(detail.externalOrderStatus, .notConnected)
        var draft = NativeTripDraft(detail)
        draft.days[0].items[0].title = "Garden"
        let patch = draft.patch
        XCTAssertEqual(patch.expectedVersion, 3)
        XCTAssertEqual(patch.operations.count, 1)
        XCTAssertEqual(patch.operations[0].kind, .upsertItem)
        XCTAssertEqual(patch.operations[0].startsAt, "2026-09-20T10:00:00+08:00")
        XCTAssertEqual(detail.content.days[0].items[0].title, "Museum")
        draft.days.removeAll()
        XCTAssertEqual(draft.patch.operations.map(\.kind), [.deleteDay])
    }

    @MainActor
    func testAccountChangeRejectsAnAlreadyInFlightTripReply() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DelayedTripProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj05.unit.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59931"], defaults: defaults, configuration: configuration)
        await session.login(email: "owner-a", password: "unit-only")
        let originalScope = try XCTUnwrap(session.dataScope)
        let store = NativeTripStore()
        store.reset(for: originalScope)
        let request = Task { await store.list(using: session) }
        for _ in 0..<100 where !DelayedTripProtocol.hasPending {
            try await Task.sleep(for: .milliseconds(10))
        }
        guard DelayedTripProtocol.hasPending else { request.cancel(); XCTFail("Trip request never reached the delayed transport"); return }
        await session.login(email: "owner-b", password: "unit-only")
        XCTAssertNotEqual(session.dataScope, originalScope)
        store.reset(for: session.dataScope)
        DelayedTripProtocol.completePending()
        await request.value
        XCTAssertTrue(store.trips.isEmpty, "An old owner's valid but late response must never enter the new account")
        XCTAssertNil(store.detail)
        XCTAssertEqual(store.scope, session.dataScope)
        await session.logout()
    }
}

/// Deterministic race test only. Real API integration is tested separately.
nonisolated private final class DelayedTripProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var pending: DelayedTripProtocol?
    nonisolated(unsafe) private static var refreshFailure = false
    nonisolated(unsafe) private static var holdRefresh = false
    nonisolated(unsafe) private static var refreshPending: DelayedTripProtocol?
    static var hasPending: Bool { lock.withLock { pending != nil } }
    static var hasRefreshPending: Bool { lock.withLock { refreshPending != nil } }
    static func setRefreshFailure(_ value: Bool) { lock.withLock { refreshFailure = value } }
    static func setHoldRefresh(_ value: Bool) { lock.withLock { holdRefresh = value } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        if path == "/api/trips/native/v2" {
            Self.lock.withLock { Self.pending = self }
            return
        }
        let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
        let owner = token.contains("owner-b") ? "owner-b" : "owner-a"
        if path.hasSuffix("refresh") {
            if Self.lock.withLock({ Self.holdRefresh }) {
                Self.lock.withLock { Self.refreshPending = self }
            } else if Self.lock.withLock({ Self.refreshFailure }) {
                client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            } else {
                respond(["subject": owner, "accessToken": owner, "refreshToken": owner, "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1])
            }
        } else if path.hasSuffix("credentials") {
            // URLSession may provide the encoded body as a stream. A second deliberate
            // login is sufficient to distinguish this test's two synthetic principals.
            let b = Self.hasPending
            let subject = b ? "owner-b" : "owner-a"
            respond(["subject": subject, "accessToken": subject, "refreshToken": subject, "expiresAt": Date().timeIntervalSince1970 + 3600])
        } else if path.hasSuffix("profile") {
            respond(["subject": owner, "displayName": owner])
        } else {
            respond(["subject": owner, "mobileEpoch": 1])
        }
    }
    static func completePending() {
        let held = lock.withLock { let held = pending; pending = nil; return held }
        held?.respond(["version": 2, "trips": [["id": "11111111-1111-4111-8111-111111111111", "title": "Old owner private trip", "headVersion": 0, "updatedAt": "2026-09-10"]], "currentTripId": NSNull()])
    }
    static func denyPendingTrip() {
        let held = lock.withLock { let held = pending; pending = nil; return held }
        held?.respond(["error": ["code": "UNAUTHENTICATED"]], status: 401)
    }
    static func completeRefresh() {
        let held = lock.withLock { let held = refreshPending; refreshPending = nil; return held }
        held?.respond(["subject": "owner-a", "accessToken": "owner-a", "refreshToken": "owner-a", "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1])
    }
    private func respond(_ value: [String: Any], status: Int = 200) {
        guard let url = request.url,
              let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"]),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
