import XCTest
import UIKit
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

    @MainActor
    func testBoundedVisionRecognitionReturnsSourceLines() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 500)).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1200, height: 500))
            let style: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 76, weight: .bold),
                                                         .foregroundColor: UIColor.black]
            ("2026-10-01" as NSString).draw(at: CGPoint(x: 50, y: 50), withAttributes: style)
            ("CNY 128" as NSString).draw(at: CGPoint(x: 50, y: 220), withAttributes: style)
        }
        let data = try XCTUnwrap(image.pngData())
        let lines = try NativeScreenshotOCR.recognize(data)
        XCTAssertTrue(lines.contains(where: { $0.text.contains("2026-10-01") }))
        XCTAssertTrue(lines.contains(where: { $0.text.contains("128") }))
        XCTAssertEqual(lines.map(\.id), Array(1...lines.count))
    }
}
