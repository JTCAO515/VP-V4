import XCTest
@testable import VisePanda

nonisolated final class NativeTripStateTests: XCTestCase {
    @MainActor
    func testDeletionQueuedThenCompletedClearsCachedTripOnReconnect() async throws {
        ArchiveTripProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArchiveTripProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj36.deletion.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59931"],
                                    defaults: defaults, configuration: configuration)
        await session.login(email: "deletion-owner", password: "unit-only")
        let store = NativeTripStore()
        store.reset(for: try XCTUnwrap(session.dataScope))
        await store.select(ArchiveTripProtocol.tripID, using: session)
        let reference = try XCTUnwrap(store.deletionReference)
        await store.deleteTrip(reviewedReference: reference, using: session)
        XCTAssertEqual(store.deletionReceipt?.state, "queued")
        XCTAssertEqual(store.deletionReceipt?.allUserDataCompleted, false)
        XCTAssertNil(store.detail)
        XCTAssertTrue(store.trips.isEmpty, "Even a stale list cannot redisplay a queued Trip")
        XCTAssertNotNil(try session.pendingTripDeletion())
        let reopened = NativeTripStore()
        reopened.reset(for: session.dataScope)
        ArchiveTripProtocol.setDeletionOffline(true)
        await reopened.reload(using: session)
        XCTAssertNil(reopened.detail)
        XCTAssertTrue(reopened.trips.isEmpty)
        XCTAssertNotNil(try session.pendingTripDeletion(), "An offline status read cannot lose the queued request")
        ArchiveTripProtocol.setDeletionOffline(false)
        ArchiveTripProtocol.completeDeletion()
        await reopened.reload(using: session)
        XCTAssertEqual(reopened.deletionReceipt?.state, "completed")
        XCTAssertNil(try session.pendingTripDeletion())
        XCTAssertTrue(reopened.trips.isEmpty)
        XCTAssertNil(reopened.detail)
        await reopened.create(title: "Second synthetic Trip", using: session)
        XCTAssertNil(reopened.deletionReceipt, "Switching to a new Trip must clear the previous completion card")
        let secondReference = try XCTUnwrap(reopened.deletionReference)
        ArchiveTripProtocol.setDeletionPostOffline(true)
        await reopened.deleteTrip(reviewedReference: secondReference, using: session)
        XCTAssertNil(reopened.deletionReceipt, "A first Trip's completion must not describe an uncertain second request")
        XCTAssertNotNil(reopened.deletionRequest)
        XCTAssertNotNil(try session.pendingTripDeletion())
        XCTAssertNil(reopened.detail)
        ArchiveTripProtocol.setDeletionPostOffline(false)
        let savedSecond = try XCTUnwrap(session.pendingTripDeletion())
        try session.forgetTripDeletion(savedSecond)
    }

    @MainActor
    func testDeletionReceiptRejectsMalformedCompletionState() {
        let request = NativePendingTripDeletion(owner: "22222222-2222-4222-8222-222222222222",
            tripID: ArchiveTripProtocol.tripID, requestID: "33333333-3333-4333-8333-333333333333", expectedVersion: 1)
        func receipt(_ state: String, _ completedAt: String?) -> NativeTripDeletionReceipt {
            .init(version: 1, requestId: request.requestID, tripId: request.tripID, scope: "trip-core-v1",
                  state: state, completedAt: completedAt, allUserDataCompleted: false,
                  backupErasure: "not_verified", providerErasure: "not_performed")
        }
        XCTAssertTrue(receipt("queued", nil).isValid(for: request))
        XCTAssertFalse(receipt("queued", "2026-09-26T00:00:00Z").isValid(for: request))
        XCTAssertFalse(receipt("completed", nil).isValid(for: request))
        XCTAssertFalse(receipt("completed", "").isValid(for: request))
        XCTAssertFalse(receipt("completed", "not-a-date").isValid(for: request))
        XCTAssertTrue(receipt("completed", "2026-09-26T00:00:00Z").isValid(for: request))
        XCTAssertTrue(receipt("completed", "2026-09-26T00:00:00.123+00:00").isValid(for: request))
        XCTAssertTrue(receipt("completed", "2026-09-26T00:00:00.123456+00:00").isValid(for: request))
    }

    @MainActor
    func testArchiveRequiresReviewedVersionRetainsResultsAndStartsFresh() async throws {
        ArchiveTripProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArchiveTripProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj61.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59931"], defaults: defaults, configuration: configuration)
        await session.login(email: "archive-owner", password: "unit-only")
        let store = NativeTripStore()
        store.reset(for: try XCTUnwrap(session.dataScope))
        await store.select(ArchiveTripProtocol.tripID, using: session)
        let original = try XCTUnwrap(store.detail)
        let reference = try XCTUnwrap(store.archiveReference)
        await store.archive(reviewedReference: "wrong-version", using: session)
        XCTAssertNil(store.archive)
        XCTAssertEqual(ArchiveTripProtocol.posts, 0)
        await store.archive(reviewedReference: reference, using: session)
        XCTAssertEqual(store.archive?.archivedVersion, 1)
        XCTAssertEqual(store.detail?.content, original.content)
        XCTAssertNil(store.archiveReference)
        ArchiveTripProtocol.setUnavailable(true)
        await store.reload(using: session)
        XCTAssertEqual(store.archive?.archivedVersion, 1, "A failed status read cannot reopen a known archive")
        XCTAssertFalse(store.canEdit)
        ArchiveTripProtocol.setUnavailable(false)
        store.beginDraft()
        XCTAssertNil(store.draft)
        await store.create(title: "Fresh", using: session)
        XCTAssertNotEqual(store.selectedID, original.trip.id)
        XCTAssertEqual(store.detail?.content.days.count, 0)
        XCTAssertNil(store.archive)
        store.reset(for: nil)
        XCTAssertNil(store.detail)
        XCTAssertNil(store.archive)
        XCTAssertFalse(store.archiveAvailable)
    }

    @MainActor
    func testArchiveUnavailableKeepsSavedResultsWithoutClaimingSuccess() async throws {
        ArchiveTripProtocol.reset(unavailable: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArchiveTripProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj61.unavailable.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59931"], defaults: defaults, configuration: configuration)
        await session.login(email: "archive-owner", password: "unit-only")
        let store = NativeTripStore()
        store.reset(for: try XCTUnwrap(session.dataScope))
        await store.select(ArchiveTripProtocol.tripID, using: session)
        XCTAssertNotNil(store.detail)
        XCTAssertFalse(store.archiveAvailable)
        XCTAssertNil(store.archiveReference)
        XCTAssertNil(store.archive)
        await store.archive(reviewedReference: "guessed", using: session)
        XCTAssertEqual(ArchiveTripProtocol.posts, 0)
    }

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
    func testCompletedGroundedRequestCanEnterOutlineWithoutCopyingAnswer() throws {
        let input = "第一次去上海四天，喜欢吃和散步，日期未定"
        func turn(status: String, projection: String, completed: Bool, request: String = input) throws -> NativeTextTurn {
            let payload: [String: Any] = [
                "turnId": UUID().uuidString, "threadId": UUID().uuidString,
                "locale": "zh", "input": request,
                "outcome": status == "planning" ? NSNull() : status == "unavailable" ? "blocked" : "answered",
                "output": status == "planning" ? NSNull() : "reviewed-answer-v1", "status": status, "createdAt": "2026-09-24T00:00:00Z",
                "result": ["type": "reviewed_answer", "city": "shanghai", "intent": "unsupported",
                           "originalOutcome": "blocked", "projection": projection,
                           "completedAt": completed ? "2026-09-24T00:00:00Z" : NSNull()] as [String: Any]
            ]
            return try JSONDecoder().decode(NativeTextTurn.self, from: JSONSerialization.data(withJSONObject: payload))
        }
        let saved = try turn(status: "unavailable", projection: "current", completed: true)
        XCTAssertEqual(NativeRelativeOutline.planningRequest(from: saved, evidenceCurrent: true, chinese: true), input)
        XCTAssertNil(NativeRelativeOutline.planningRequest(from: saved, evidenceCurrent: false, chinese: true))
        XCTAssertNil(NativeRelativeOutline.planningRequest(from: try turn(status: "unavailable", projection: "unavailable", completed: true), evidenceCurrent: true, chinese: true))
        XCTAssertNil(NativeRelativeOutline.planningRequest(from: try turn(status: "planning", projection: "pending", completed: false), evidenceCurrent: true, chinese: true))
        XCTAssertNil(NativeRelativeOutline.planningRequest(from: try turn(status: "unavailable", projection: "current", completed: true, request: "想去上海"), evidenceCurrent: true, chinese: true))
    }

    @MainActor
    func testSingleInterestOutlineDoesNotInventAnAlternative() throws {
        for (request, chinese, food) in [
            ("上海四天，只想吃美食，日期未定", true, true),
            ("Beijing for three days, neighborhood walks", false, false),
            ("广州五天，散步", true, false),
            ("Chongqing for two days, food", false, true)
        ] {
            let outline = try XCTUnwrap(NativeRelativeOutline.make(from: request, chinese: chinese))
            XCTAssertFalse(outline.hasAlternatives)
            XCTAssertEqual(outline.initialTitles, food ? outline.foodFirst : outline.walkFirst)
        }
        let both = try XCTUnwrap(NativeRelativeOutline.make(from: "Shanghai four days food and walks", chinese: false))
        XCTAssertTrue(both.hasAlternatives)
        XCTAssertNil(NativeRelativeOutline.make(from: "Shanghai four days food " + String(repeating: "x", count: 4000), chinese: false))
    }

    @MainActor
    func testOutlineRejectsAmbiguousAndUnsupportedWholeDurations() throws {
        for request in [
            "Shanghai for 4 or 7 days, food",
            "Shanghai for 4 days or 7 days, food",
            "Shanghai for four or seven days, food",
            "Shanghai for 4–7 days, food",
            "上海四天或七天，美食",
            "上海十四天，喜欢美食",
            "上海二十四天，喜欢美食",
            "Shanghai 14 days, food",
            "Shanghai fourteen days, food",
            "Shanghai twenty-four days, food",
            "Shanghai 4 days or 14 days, food",
            "Shanghai 2.5 days, food",
            "Shanghai -4 days, food"
        ] {
            XCTAssertNil(NativeRelativeOutline.make(from: request, chinese: false), request)
        }
        for request in ["上海四天，美食", "上海4天，美食", "Shanghai 4 days, food", "Shanghai four days, food"] {
            XCTAssertEqual(try XCTUnwrap(NativeRelativeOutline.make(from: request, chinese: false)).count, 4, request)
        }
    }

    @MainActor
    func testOutlineRespectsExplicitNegationWithoutGuessingItsScope() throws {
        for request in [
            "Shanghai four days, food but no walks",
            "Shanghai four days, food without walking",
            "Shanghai four days, food; I don't want walks",
            "Shanghai four days, food, don't walk",
            "Shanghai four days, food, don’t walk",
            "Shanghai four days, food, do not walk",
            "上海四天，只想美食，不要散步"
        ] {
            let outline = try XCTUnwrap(NativeRelativeOutline.make(from: request, chinese: false), request)
            XCTAssertTrue(outline.includesFood, request)
            XCTAssertFalse(outline.includesWalking, request)
            XCTAssertFalse(outline.hasAlternatives, request)
            XCTAssertEqual(outline.initialTitles, outline.foodFirst, request)
        }
        let walking = try XCTUnwrap(NativeRelativeOutline.make(from: "Shanghai four days, no food, only walks", chinese: false))
        XCTAssertFalse(walking.includesFood)
        XCTAssertTrue(walking.includesWalking)
        XCTAssertEqual(walking.initialTitles, walking.walkFirst)
        for request in [
            "Shanghai four days, food but not no walks",
            "Shanghai four days, food but not without walks",
            "Shanghai four days, food but no long walks",
            "Shanghai four days, food, don't include walks",
            "上海四天，美食，但不要长时间步行",
            "上海四天，美食，不想剧烈散步",
            "Shanghai four days, food but not only walks",
            "Shanghai four days, food and walks but no walks",
            "Shanghai four days, no food or walks",
            "Shanghai four days, no food and no walks",
            "上海四天，美食但不是不散步",
            "Shanghai four days, sidewalk",
            "Shanghai four days, walkman",
            "Shanghai four days, seafood"
        ] {
            XCTAssertNil(NativeRelativeOutline.make(from: request, chinese: false), request)
        }
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

    @MainActor
    func testTodaySelectsOnlyDatedConfirmedItemsAndKeepsEmptyStatesDistinct() {
        let trip = NativeTripSummary(id: UUID().uuidString, title: "Shanghai", headVersion: 4, updatedAt: "2026-09-24T00:00:00Z")
        let now = ISO8601DateFormatter().date(from: "2026-09-24T02:00:00Z")!
        func detail(_ days: [NativeTripDay]) -> NativeTripDetail {
            .init(version: 2, trip: trip, content: .init(days: days), hardLocks: .notEnabled,
                  externalOrderStatus: .notConnected, confirmationState: "confirmed")
        }
        func day(_ id: String, _ date: String, _ titles: [String], zone: String? = "Asia/Shanghai") -> NativeTripDay {
            .init(id: id, date: date, timeZone: zone,
                  items: titles.enumerated().map { index, title in
                      .init(id: "\(id)-\(index)", dayId: id, title: title)
                  })
        }
        if case .noDates = NativeTodaySelection.select(detail: detail([]), now: now) {} else { XCTFail("No date must not become a schedule") }
        if case .noItems = NativeTodaySelection.select(detail: detail([day("a", "2026-09-24", [])]), now: now) {} else { XCTFail("Empty days must have their own state") }
        if case .incomplete = NativeTodaySelection.select(detail: detail([day("a", "2026-09-24", ["Museum"], zone: nil)]), now: now) {} else { XCTFail("Missing zone cannot select Today") }
        if case .incomplete = NativeTodaySelection.select(detail: detail([day("a", "2026-02-30", ["Museum"])]), now: now) {} else { XCTFail("Invalid date cannot select Today") }
        if case .complete = NativeTodaySelection.select(detail: detail([day("a", "2026-09-23", ["Museum"])]), now: now) {} else { XCTFail("Past items are not upcoming") }
        let scheduled = detail([day("future", "2026-09-25", ["Tomorrow"]), day("today", "2026-09-24", ["今日地址：上海市黄浦区"], zone: "Asia/Shanghai")])
        if case .day(let selected, let isToday) = NativeTodaySelection.select(detail: scheduled, now: now) {
            XCTAssertEqual(selected.id, "today")
            XCTAssertEqual(selected.items.first?.title, "今日地址：上海市黄浦区")
            XCTAssertTrue(isToday)
            XCTAssertEqual(scheduled.trip.headVersion, 4)
        } else { XCTFail("Confirmed Today's item should be selected") }
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

/// Native state test only; SQL and HTTP authority have separate tests.
nonisolated private final class ArchiveTripProtocol: URLProtocol, @unchecked Sendable {
    static let tripID = "11111111-1111-4111-8111-111111111111"
    private static let ownerID = "22222222-2222-4222-8222-222222222222"
    private static let lock = NSLock()
    nonisolated(unsafe) private static var archived = false
    nonisolated(unsafe) private static var unavailable = false
    nonisolated(unsafe) private static var postCount = 0
    nonisolated(unsafe) private static var deletionRequestID: String?
    nonisolated(unsafe) private static var deletionCompleted = false
    nonisolated(unsafe) private static var deletionOffline = false
    nonisolated(unsafe) private static var deletionPostOffline = false
    static var posts: Int { lock.withLock { postCount } }
    static func setUnavailable(_ value: Bool) { lock.withLock { unavailable = value } }
    static func reset(unavailable: Bool = false) { lock.withLock { archived = false; Self.unavailable = unavailable; postCount = 0; deletionRequestID = nil; deletionCompleted = false; deletionOffline = false; deletionPostOffline = false } }
    static func completeDeletion() { lock.withLock { deletionCompleted = true } }
    static func setDeletionOffline(_ value: Bool) { lock.withLock { deletionOffline = value } }
    static func setDeletionPostOffline(_ value: Bool) { lock.withLock { deletionPostOffline = value } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        if path.hasSuffix("credentials") || path.hasSuffix("refresh") {
            respond(["subject": Self.ownerID, "accessToken": Self.ownerID, "refreshToken": Self.ownerID, "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1])
        } else if path.hasSuffix("profile") {
            respond(["subject": Self.ownerID, "displayName": "Archive owner"])
        } else if path == "/api/privacy/native/v1/trips" {
            if request.httpMethod == "POST" && Self.lock.withLock({ Self.deletionPostOffline }) {
                client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
                return
            }
            if request.httpMethod == "GET" && Self.lock.withLock({ Self.deletionOffline }) {
                client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
                return
            }
            if request.httpMethod == "POST" {
                var data = request.httpBody ?? Data()
                if let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var buffer = [UInt8](repeating: 0, count: 1024)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        if count <= 0 { break }
                        data.append(contentsOf: buffer.prefix(count))
                    }
                }
                guard !data.isEmpty,
                      let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                      let id = body["requestId"] as? String else { respond([:], status: 400); return }
                Self.lock.withLock { Self.deletionRequestID = id }
            }
            guard let id = Self.lock.withLock({ Self.deletionRequestID }) else { respond(["error": ["code": "FORBIDDEN"]], status: 403); return }
            let completed = Self.lock.withLock { Self.deletionCompleted }
            respond(["version": 1, "requestId": id, "tripId": Self.tripID, "scope": "trip-core-v1",
                     "state": completed ? "completed" : "queued", "completedAt": completed ? "2026-09-26T00:00:00Z" as Any : NSNull(),
                     "allUserDataCompleted": false, "backupErasure": "not_verified", "providerErasure": "not_performed"],
                    status: request.httpMethod == "POST" && !completed ? 202 : 200)
        } else if path.hasSuffix("archive") {
            if Self.lock.withLock({ Self.unavailable }) { respond(["error": ["code": "PROVIDER_UNAVAILABLE"]], status: 503); return }
            if request.httpMethod == "POST" { Self.lock.withLock { Self.archived = true; Self.postCount += 1 } }
            let archived = Self.lock.withLock { Self.archived }
            let isOld = path.contains(Self.tripID)
            respond(["version": 1, "archive": archived && isOld ? ["tripId": Self.tripID, "archivedVersion": 1, "archivedAt": "2026-09-22T01:00:00Z"] : NSNull()])
        } else if path.hasSuffix("proposal") {
            respond(["error": ["code": "PROPOSAL_NOT_CONFIRMABLE"]], status: 409)
        } else if path == "/api/trips/native/v2" {
            if request.httpMethod == "POST" {
                var data = request.httpBody ?? Data()
                if let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var buffer = [UInt8](repeating: 0, count: 1024)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        if count <= 0 { break }
                        data.append(contentsOf: buffer.prefix(count))
                    }
                }
                let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                guard let id = body?["tripId"] as? String else { respond([:], status: 400); return }
                respond(["version": 2, "trip": trip(id), "reused": false], status: 201)
            } else { respond(["version": 2, "trips": Self.lock.withLock({ Self.deletionCompleted }) ? [] : [trip(Self.tripID)], "currentTripId": NSNull()]) }
        } else if path.contains("/trips/native/v2/") {
            let id = request.url?.lastPathComponent ?? Self.tripID
            let days: [[String: Any]] = id == Self.tripID ? [["id": "old-day", "date": "2020-01-01", "items": [["id": "old-item", "dayId": "old-day", "title": "Temporary meeting"]]]] : []
            respond(["version": 2, "trip": trip(id), "content": ["days": days], "hardLocks": "not_enabled", "externalOrderStatus": "not_connected", "confirmationState": id == Self.tripID ? "confirmed" : "initial"])
        } else { respond(["subject": Self.ownerID, "mobileEpoch": 1]) }
    }
    private func trip(_ id: String) -> [String: Any] {
        ["id": id, "title": id == Self.tripID ? "Old" : "Fresh", "headVersion": id == Self.tripID ? 1 : 0, "updatedAt": "2026-09-22T01:00:00Z"]
    }
    private func respond(_ value: [String: Any], status: Int = 200) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"]), let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
