import XCTest
@testable import VisePanda

nonisolated final class NativeTripIntegrationTests: XCTestCase {
    @MainActor
    func testRealLocalCreateConfirmReloadConflictAndReplacedSession() async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_TEST"] == "1" else {
            throw XCTSkip("UNRUN: explicit local synthetic Trip environment is not configured")
        }
        let email = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_EMAIL"])
        let password = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_PASSWORD"])
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj05.real.\(UUID().uuidString)"))
        let args = ["-VisePandaNativeAPI", "http://127.0.0.1:59931"]
        let session = NativeSession(arguments: args, defaults: defaults)
        await session.login(email: email, password: password)
        XCTAssertEqual(session.status, "active", session.failureCode ?? "none")
        let store = NativeTripStore()
        store.reset(for: try XCTUnwrap(session.dataScope))
        await store.create(title: "Synthetic iOS \(UUID().uuidString.prefix(8))", using: session)
        let original = try XCTUnwrap(store.detail, store.notice ?? "No Trip detail")
        XCTAssertEqual(original.trip.headVersion, 0)
        XCTAssertTrue(original.content.days.isEmpty)
        print("VPJ05 real native Trip created: \(original.trip.id)")

        store.beginDraft()
        store.draft?.addDay()
        let dayID = try XCTUnwrap(store.draft?.days.first?.id)
        store.draft?.addItem(to: dayID)
        store.draft?.days[0].items[0].title = "Synthetic museum visit"
        await store.propose(using: session)
        let pending = try XCTUnwrap(store.pending, store.notice ?? "No pending proposal")
        XCTAssertFalse(pending.proposal.digest.isEmpty)
        XCTAssertEqual(store.detail?.trip.headVersion, 0)
        XCTAssertTrue(store.detail?.content.days.isEmpty == true, "Proposal creation must not write confirmed content")
        await store.confirm(reviewedReference: try XCTUnwrap(store.confirmationReference), using: session)
        XCTAssertEqual(store.detail?.trip.headVersion, 1, store.notice ?? "none")
        XCTAssertEqual(store.detail?.content.days.first?.items.first?.title, "Synthetic museum visit")
        XCTAssertNil(store.draft)

        let reloaded = NativeTripStore()
        reloaded.reset(for: session.dataScope)
        await reloaded.select(original.trip.id, using: session)
        XCTAssertEqual(reloaded.detail?.content, store.detail?.content)
        XCTAssertEqual(reloaded.detail?.trip.headVersion, 1)

        // Two real consumers share this authenticated session. Browser reciprocity
        // is verified separately; this is a deterministic stale-draft regression.
        store.beginDraft()
        store.draft?.title = "My retained unsent draft"
        reloaded.beginDraft()
        reloaded.draft?.title = "Concurrent confirmed title"
        await reloaded.propose(using: session)
        await reloaded.confirm(reviewedReference: try XCTUnwrap(reloaded.confirmationReference), using: session)
        XCTAssertEqual(reloaded.detail?.trip.headVersion, 2)
        await store.propose(using: session)
        XCTAssertEqual(store.notice, "STALE_TRIP_VERSION")
        XCTAssertEqual(store.draft?.title, "My retained unsent draft")
        await store.reload(using: session)
        XCTAssertEqual(store.detail?.trip.title, "Concurrent confirmed title")
        XCTAssertEqual(store.draft?.baseVersion, 1)
        XCTAssertEqual(store.draft?.title, "My retained unsent draft")

        reloaded.beginDraft()
        reloaded.draft?.days[0].items.removeAll()
        await reloaded.propose(using: session)
        XCTAssertEqual(reloaded.pending?.proposal.patch.operations.map(\.kind), [.deleteItem])
        await reloaded.confirm(reviewedReference: try XCTUnwrap(reloaded.confirmationReference), using: session)
        XCTAssertEqual(reloaded.detail?.trip.headVersion, 3)
        XCTAssertTrue(reloaded.detail?.content.days.first?.items.isEmpty == true)
        reloaded.beginDraft()
        reloaded.draft?.days.removeAll()
        await reloaded.propose(using: session)
        XCTAssertEqual(reloaded.pending?.proposal.patch.operations.map(\.kind), [.deleteDay])
        await reloaded.confirm(reviewedReference: try XCTUnwrap(reloaded.confirmationReference), using: session)
        XCTAssertEqual(reloaded.detail?.trip.headVersion, 4)
        XCTAssertTrue(reloaded.detail?.content.days.isEmpty == true)

        let otherDefaults = try XCTUnwrap(UserDefaults(suiteName: "vpj05.replacement.\(UUID().uuidString)"))
        let replacement = NativeSession(arguments: args, defaults: otherDefaults)
        await replacement.login(email: email, password: password)
        XCTAssertEqual(replacement.status, "active")
        await store.reload(using: session)
        XCTAssertNil(session.dataScope)
        XCTAssertNil(store.detail)
        XCTAssertNil(store.draft)
        XCTAssertTrue(store.trips.isEmpty)
        await replacement.logout()
    }
}
