import XCTest
#if canImport(VisePanda)
@testable import VisePanda
#endif

/// Synthetic DTOs and live closure inputs only; no Auth, provider, device or API evidence.
    private func syntheticScope(epoch: Int = 1, generation: Int = 1) -> NativeDataScope {
        NativeDataScope(endpoint: "https://synthetic.invalid", subject: "synthetic-owner", mobileEpoch: epoch, generation: generation)
    }
    private func session(_ suffix: String = "1", label: String = "合成 Synthetic") -> NativeQASession {
        NativeQASession(id: "00000000-0000-4000-8000-00000000000" + suffix, label: label, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T01:00:00Z")
    }
    private func snapshot(_ scope: NativeDataScope, sessions: [NativeQASession], loading: Bool = false, selectable: Bool = true, creatable: Bool = true) -> NativeQAHistorySnapshot {
        .init(scope: scope, sessions: sessions, selectedID: sessions.first?.id, isLoading: loading, canSelect: selectable, canCreate: creatable)
    }

final class NativeQAHistoryPresentationTests: XCTestCase {
    func testLiveClosureReplacementAndForeignID() {
        MainActor.assumeIsolated {
            let scope = syntheticScope(); let first = session(); let second = session("2")
            var live = snapshot(scope, sessions: [first]); var selected: [String] = []; var creations = 0
            let source = NativeQAHistorySource(currentScope: { scope }, expectedScope: { scope }, read: { live }, onSelect: { selected.append($0) }, onCreate: { creations += 1 })
            live = snapshot(scope, sessions: [second])
            XCTAssertFalse(source.select(first.id, displayedScope: scope))
            XCTAssertTrue(source.select(second.id, displayedScope: scope))
            XCTAssertEqual(selected, [second.id])
            XCTAssertTrue(source.create(displayedScope: scope)); XCTAssertEqual(creations, 1)
        }
    }
    func testRevokedScopeAndEpochGenerationChangesHideProjection() {
        MainActor.assumeIsolated {
            let original = syntheticScope(); var current: NativeDataScope? = original; var expected: NativeDataScope? = original
            let live = snapshot(original, sessions: [session()]); var calls = 0
            let source = NativeQAHistorySource(currentScope: { current }, expectedScope: { expected }, read: { live }, onSelect: { _ in calls += 1 }, onCreate: { calls += 1 })
            for changed in [nil, syntheticScope(epoch: 2), syntheticScope(generation: 2)] {
                current = changed
                XCTAssertNil(source.readable())
                XCTAssertFalse(source.select(session().id, displayedScope: original))
                XCTAssertFalse(source.create(displayedScope: original))
            }
            current = original; expected = nil
            XCTAssertNil(source.readable()); XCTAssertEqual(calls, 0)
        }
    }
    func testScopeChangesInsideReadAreRejected() {
        MainActor.assumeIsolated {
            let original = syntheticScope(); var current: NativeDataScope? = original
            let live = snapshot(original, sessions: [session()])
            let source = NativeQAHistorySource(currentScope: { current }, expectedScope: { original }, read: { current = nil; return live }, onSelect: { _ in XCTFail("stale callback") }, onCreate: { XCTFail("stale callback") })
            XCTAssertNil(source.readable())
        }
    }
    func testUnknownRestrictionStillReadsButCannotChangeSession() {
        MainActor.assumeIsolated {
            let scope = syntheticScope(); let live = snapshot(scope, sessions: [session()], selectable: false, creatable: false)
            let source = NativeQAHistorySource(currentScope: { scope }, expectedScope: { scope }, read: { live }, onSelect: { _ in XCTFail("restricted") }, onCreate: { XCTFail("restricted") })
            XCTAssertEqual(source.readable()?.sessions.count, 1)
            XCTAssertFalse(source.select(session().id, displayedScope: scope))
            XCTAssertFalse(source.create(displayedScope: scope))
        }
    }
    func testLoadingIsNeverEmptyAndBlocksActions() {
        MainActor.assumeIsolated {
            let scope = syntheticScope(); var live = snapshot(scope, sessions: [], loading: true)
            XCTAssertEqual(NativeQAHistoryPresentation.state(live, query: ""), .loading)
            live = snapshot(scope, sessions: [session()], loading: true)
            XCTAssertEqual(NativeQAHistoryPresentation.state(live, query: "absent"), .loading)
            XCTAssertEqual(NativeQAHistoryPresentation.state(live, query: ""), .sessions)
            let source = NativeQAHistorySource(currentScope: { scope }, expectedScope: { scope }, read: { live }, onSelect: { _ in XCTFail("loading") }, onCreate: { XCTFail("loading") })
            XCTAssertFalse(source.select(session().id, displayedScope: scope)); XCTAssertFalse(source.create(displayedScope: scope))
        }
    }
    func testSearchPreservesDTOAndDistinguishesNoMatches() {
        let scope = syntheticScope(); let sessions = [session(), session("2", label: "其他")]
        XCTAssertEqual(NativeQAHistoryPresentation.filtered(sessions, query: " synthetic "), [sessions[0]])
        XCTAssertEqual(NativeQAHistoryPresentation.filtered(sessions, query: "其他"), [sessions[1]])
        XCTAssertEqual(NativeQAHistoryPresentation.filtered(sessions, query: "  "), sessions)
        XCTAssertEqual(NativeQAHistoryPresentation.state(snapshot(scope, sessions: sessions), query: "missing"), .noMatches)
        XCTAssertEqual(NativeQAHistoryPresentation.state(snapshot(scope, sessions: []), query: "missing"), .empty)
    }
    func testMalformedOrDuplicateListAndOldDisplayedScopeFailClosed() {
        MainActor.assumeIsolated {
            let scope = syntheticScope(); var live = snapshot(scope, sessions: [session(), session()])
            let source = NativeQAHistorySource(currentScope: { scope }, expectedScope: { scope }, read: { live }, onSelect: { _ in XCTFail("invalid") }, onCreate: { XCTFail("invalid") })
            XCTAssertNil(source.readable())
            live = snapshot(scope, sessions: [session()])
            XCTAssertFalse(source.select(session().id, displayedScope: syntheticScope(generation: 2)))
            XCTAssertFalse(source.create(displayedScope: syntheticScope(epoch: 2)))
        }
    }
}
