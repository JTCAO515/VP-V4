import XCTest
@testable import VisePanda

nonisolated final class NativeScreenshotTripDraftTests: XCTestCase {
    @MainActor
    func testCorrectionBecomesProposalPatchAndReplayIsDuplicate() {
        let detail = makeDetail(days: [])
        let corrections = [
            correction(.date, "2026-10-01", line: 1),
            correction(.amount, "CNY 128", line: 2),
            correction(.address, "Shanghai Station", line: 3),
            correction(.status, "User reported confirmed", line: 4),
        ]
        let digest = String(repeating: "a", count: 64)
        guard case .ready(let draft, let states) = NativeScreenshotTripDraft.make(detail: detail, digest: digest, corrections: corrections) else {
            return XCTFail("Expected a local draft")
        }
        XCTAssertEqual(draft.patch.expectedVersion, 1)
        XCTAssertEqual(draft.patch.operations.count, 4)
        XCTAssertEqual(states[.date], .added)
        XCTAssertEqual(states[.amount], .added)
        XCTAssertTrue(draft.days[0].items.allSatisfy { $0.title.hasPrefix("User-checked screenshot L") })

        let saved = makeDetail(days: draft.days, version: 2)
        if case .duplicate = NativeScreenshotTripDraft.make(detail: saved, digest: digest, corrections: corrections) {
            // Same image and corrections must not create another Trip item.
        } else {
            XCTFail("Replay should be a duplicate")
        }
        let changed = [corrections[0], correction(.amount, "CNY 130", line: 2), corrections[2], corrections[3]]
        guard case .ready(_, let changedStates) = NativeScreenshotTripDraft.make(detail: saved, digest: digest, corrections: changed) else {
            return XCTFail("Expected a reviewed conflict")
        }
        XCTAssertEqual(changedStates[.amount], .conflict)
    }

    @MainActor
    func testInvalidOrMissingDateCannotEnterTripProposal() {
        let detail = makeDetail(days: [])
        let digest = String(repeating: "b", count: 64)
        if case .invalid = NativeScreenshotTripDraft.make(detail: detail, digest: digest,
                                                           corrections: [correction(.amount, "128", line: 1)]) {} else {
            XCTFail("Date is required to attach the field to a Trip day")
        }
        if case .invalid = NativeScreenshotTripDraft.make(detail: detail, digest: digest,
                                                           corrections: [correction(.date, "2026-02-30", line: 1)]) {} else {
            XCTFail("Invalid calendar day must fail closed")
        }
    }

    @MainActor
    func testAcceptedCorrectionAlwaysFitsTripItemTitle() {
        XCTAssertNil(NativeScreenshotTripDraft.itemTitle(kind: .address, sourceLine: 40,
                                                           value: String(repeating: "A", count: 160)))
        let prefix = "User-checked screenshot L40 · address: "
        let fitting = String(repeating: "A", count: 160 - prefix.count)
        XCTAssertEqual(NativeScreenshotTripDraft.itemTitle(kind: .address, sourceLine: 40,
                                                              value: fitting)?.count, 160)
    }

    @MainActor
    private func correction(_ kind: NativeScreenshotFieldKind, _ value: String, line: Int) -> NativeScreenshotCorrection {
        .init(id: UUID(), kind: kind, sourceLine: line, sourceText: "Source line \(line)", correctedValue: value)
    }

    @MainActor
    private func makeDetail(days: [NativeTripDay], version: Int = 1) -> NativeTripDetail {
        .init(version: 2,
              trip: .init(id: "11111111-1111-4111-8111-111111111111", title: "Trip", headVersion: version,
                          updatedAt: "2026-09-18T00:00:00Z"),
              content: .init(days: days), hardLocks: .notEnabled,
              externalOrderStatus: .notConnected, confirmationState: "confirmed")
    }
}
