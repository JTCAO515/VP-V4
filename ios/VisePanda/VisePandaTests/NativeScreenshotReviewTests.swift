import XCTest
@testable import VisePanda

nonisolated final class NativeScreenshotReviewTests: XCTestCase {
    @MainActor
    func testDateComparisonUsesOnlyCurrentTripDates() {
        let date = NativeScreenshotCorrection(
            id: UUID(), kind: .date, sourceLine: 2,
            sourceText: "October 1, 2026", correctedValue: "2026-10-01"
        )
        XCTAssertEqual(NativeScreenshotComparison.classify(date, tripDates: ["2026-10-01"]), .alreadyInTrip)
        XCTAssertEqual(NativeScreenshotComparison.classify(date, tripDates: ["2026-10-02"]), .dateNotInTrip)

        let amount = NativeScreenshotCorrection(
            id: UUID(), kind: .amount, sourceLine: 3,
            sourceText: "CNY 128", correctedValue: "128"
        )
        XCTAssertEqual(NativeScreenshotComparison.classify(amount, tripDates: ["2026-10-01"]), .needsReview)
        XCTAssertEqual(NativeScreenshotComparison.classify(date, tripDates: [], hasTrip: false), .needsReview)
        XCTAssertTrue(NativeScreenshotComparison.validDate("2026-10-01"))
        XCTAssertFalse(NativeScreenshotComparison.validDate("2026-02-30"))
        XCTAssertFalse(NativeScreenshotComparison.validDate("October 1"))
    }
}
