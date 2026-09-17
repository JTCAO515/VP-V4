import XCTest
import SwiftUI
import Vision
@testable import VisePanda

nonisolated final class NativeTripShareTests: XCTestCase {
    @MainActor private func detail(state: String? = "confirmed", version: Int = 7) -> NativeTripDetail {
        .init(version: 2, trip: .init(id: "private-trip", title: "Hotel room 908 with Alice", headVersion: version, updatedAt: "2026-09-17"),
              content: .init(days: [
                .init(id: "d1", date: "2026-10-02", timeZone: "Asia/Shanghai", items: [
                    .init(id: "safe", dayId: "d1", title: "Museum / 博物馆", startsAt: "private time"),
                    .init(id: "private", dayId: "d1", title: "Hotel booking ABC, Alice, room 908")]),
                .init(id: "d2", date: "2026-10-03", items: [.init(id: "safe2", dayId: "d2", title: "Park / 公园")])]),
              hardLocks: "unknown", externalOrderStatus: "unknown", confirmationState: state)
    }

    @MainActor func testDefaultProjectionHidesAllFreeTextAndTravelDatesInBothLanguages() throws {
        for chinese in [false, true] {
            let card = try XCTUnwrap(NativeTripShareCard.make(from: detail(), selection: .init(), chinese: chinese, now: .init(timeIntervalSince1970: 0)))
            XCTAssertFalse(card.title.contains("Hotel"))
            XCTAssertEqual(card.rows.count, 2)
            XCTAssertTrue(card.rows.allSatisfy { $0.title == nil && !$0.day.contains("2026") })
            XCTAssertEqual(card.version, 7)
            XCTAssertEqual(card.exportedAt, "1970-01-01T00:00:00Z")
            XCTAssertTrue(card.disclosure.contains("AI"))
        }
    }

    @MainActor func testExplicitSelectionUsesOnlySavedTitlesAndOneDayWithoutTimesOrOtherItems() throws {
        var selection = NativeTripShareSelection()
        selection.items = [.init(dayID: "d1", itemID: "safe"), .init(dayID: "d2", itemID: "safe2"), .init(dayID: "d1", itemID: "unknown")]
        selection.dayID = "d1"
        let card = try XCTUnwrap(NativeTripShareCard.make(from: detail(), selection: selection, chinese: false, now: .now))
        XCTAssertEqual(card.rows, [.init(day: "Day 1", title: "Museum / 博物馆")])
        selection.includeDates = true; selection.includeTitle = true
        let included = try XCTUnwrap(NativeTripShareCard.make(from: detail(), selection: selection, chinese: false, now: .now))
        XCTAssertEqual(included.title, detail().trip.title)
        XCTAssertEqual(included.rows[0].day, "2026-10-02")
        selection.items.remove(.init(dayID: "d1", itemID: "safe"))
        XCTAssertNil(NativeTripShareCard.make(from: detail(), selection: selection, chinese: false, now: .now)?.rows[0].title)
    }

    @MainActor func testInitialUnknownAndMissingDayCannotBePresentedAsConfirmed() {
        for state in [nil, "initial", "pending"] {
            XCTAssertNil(NativeTripShareCard.make(from: detail(state: state), selection: .init(), chinese: false, now: .now))
        }
        var selection = NativeTripShareSelection(); selection.dayID = "gone"
        XCTAssertNil(NativeTripShareCard.make(from: detail(), selection: selection, chinese: true, now: .now))
    }

    @MainActor func testAccountGenerationVersionAndContentChangesInvalidatePreview() {
        let scope = NativeDataScope(endpoint: "local", subject: "a", mobileEpoch: 1, generation: 1)
        let source = NativeTripShareSource(scope: scope, detail: detail())
        XCTAssertTrue(source.matches(scope: scope, detail: detail()))
        XCTAssertFalse(source.matches(scope: nil, detail: detail()))
        XCTAssertFalse(source.matches(scope: .init(endpoint: "local", subject: "b", mobileEpoch: 1, generation: 1), detail: detail()))
        XCTAssertFalse(source.matches(scope: .init(endpoint: "local", subject: "a", mobileEpoch: 1, generation: 2), detail: detail()))
        XCTAssertFalse(source.matches(scope: scope, detail: detail(version: 8)))
        XCTAssertFalse(source.matches(scope: scope, detail: detail(state: "initial")))
        XCTAssertFalse(source.matches(scope: scope, detail: nil))
    }

    @MainActor func testSelectingOneDayItemDoesNotSelectMatchingIDOnAnotherDay() throws {
        let original = detail()
        let collision = NativeTripDetail(version: 2, trip: original.trip,
            content: .init(days: [original.content.days[0],
                .init(id: "d2", date: "2026-10-03", items: [.init(id: "safe", dayId: "d2", title: "Private hotel room")])]),
            hardLocks: "unknown", externalOrderStatus: "unknown", confirmationState: "confirmed")
        var selection = NativeTripShareSelection(); selection.items = [.init(dayID: "d1", itemID: "safe")]
        let card = try XCTUnwrap(NativeTripShareCard.make(from: collision, selection: selection, chinese: false, now: .now))
        XCTAssertEqual(card.rows.compactMap(\.title), ["Museum / 博物馆"])
    }

    @MainActor func testActualExportPixelsExcludePrivateText() throws {
        var selection = NativeTripShareSelection(); selection.items = [.init(dayID: "d1", itemID: "safe")]
        let card = try XCTUnwrap(NativeTripShareCard.make(from: detail(), selection: selection, chinese: false, now: .init(timeIntervalSince1970: 0)))
        let preview = try XCTUnwrap(NativeTripSharePreview.render(card))
        let image = try XCTUnwrap(preview.images.first?.cgImage)
        let request = VNRecognizeTextRequest()
        request.recognitionLanguages = ["en-US"]
        try VNImageRequestHandler(cgImage: image).perform([request])
        let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
        XCTAssertTrue(text.contains("Museum"), text)
        for hidden in ["Alice", "Hotel", "908", "ABC", "2026-10-02", "private-trip", "private time"] {
            XCTAssertFalse(text.contains(hidden), "Export pixels exposed \(hidden)")
        }
        let attachment = XCTAttachment(image: preview.images[0]); attachment.name = "VPJ49-export-en"; attachment.lifetime = .keepAlways; add(attachment)
    }

    @MainActor func testRenderedPagesPreserveAllSelectedTextAndUseOnlyImagesForSharing() throws {
        var trip = detail()
        let items = (0..<17).map { NativeTripItem(id: "i\($0)", dayId: "d", title: "\($0) " + String(repeating: "长文字 Long text ", count: 10)) }
        trip = .init(version: 2, trip: trip.trip, content: .init(days: [.init(id: "d", date: "2026-10-02", items: items)]), hardLocks: "unknown", externalOrderStatus: "unknown", confirmationState: "confirmed")
        var selection = NativeTripShareSelection(); selection.items = Set(items.map { .init(dayID: $0.dayId, itemID: $0.id) })
        let card = try XCTUnwrap(NativeTripShareCard.make(from: trip, selection: selection, chinese: true, now: .now))
        XCTAssertEqual(card.pages.flatMap { $0 }.compactMap(\.title), items.map(\.title))
        XCTAssertEqual(card.pages.count, 5)
        let preview = try XCTUnwrap(NativeTripSharePreview.render(card))
        XCTAssertEqual(preview.images.count, 5)
        for image in preview.images {
            XCTAssertEqual(image.size.width, 360)
            XCTAssertGreaterThan(image.size.height, 200)
            XCTAssertNotNil(image.pngData())
        }
        let attachment = XCTAttachment(image: preview.images[0]); attachment.name = "VPJ49-long-chinese-card"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
