import XCTest
@testable import VisePanda

nonisolated final class NativeHotelHandoffTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_789_977_600) // 2026-09-22 UTC
    private var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(secondsFromGMT: 0)!; return c }
    private var search: NativeHotelSearch { .init(hotelOrCity: "上海 & aid=evil#fragment", checkIn: "2026-10-20", checkOut: "2026-10-22", adults: 2, rooms: 1, includesChildren: false) }

    @MainActor func testOnlyExplicitFieldsAndFixedOfficialDestination() throws {
        let handoff = try NativeHotelHandoff.prepare(search, provider: .booking, now: now, calendar: calendar)
        let url = try XCTUnwrap(URLComponents(url: handoff.url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(url.scheme, "https"); XCTAssertEqual(url.host, "www.booking.com")
        XCTAssertEqual(url.path, "/searchresults.html"); XCTAssertNil(url.fragment); XCTAssertNil(url.user)
        let fields = Dictionary(uniqueKeysWithValues: (url.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(fields, ["ss":search.hotelOrCity, "checkin":"2026-10-20", "checkout":"2026-10-22", "group_adults":"2", "no_rooms":"1", "group_children":"0"])
        XCTAssertEqual(handoff.state, .prepared)
    }
    @MainActor func testChildrenNeverBecomeZeroOrInventedAges() throws {
        var input = search; input.includesChildren = true
        let handoff = try NativeHotelHandoff.prepare(input, provider: .booking, now: now, calendar: calendar)
        let keys = URLComponents(url: handoff.url, resolvingAgainstBaseURL: false)?.queryItems?.map(\.name)
        XCTAssertEqual(keys, ["ss", "checkin", "checkout"])
    }
    @MainActor func testTripFallbackHasNoParametersOrAttribution() throws {
        let handoff = try NativeHotelHandoff.prepare(search, provider: .trip, now: now, calendar: calendar)
        XCTAssertEqual(handoff.url.absoluteString, "https://www.trip.com/hotels/")
    }
    @MainActor func testInvalidDatesAndOccupancyFailClosed() {
        for (arrival, departure) in [("2026-02-30","2026-03-02"), ("2026-10-22","2026-10-20"), ("2026-10-20","2026-10-20"), ("2026-01-01","2026-01-02"), ("2026-10-20","2027-10-20"), ("26-10-20","2026-10-22")] {
            var input = search; input.checkIn = arrival; input.checkOut = departure
            XCTAssertThrowsError(try NativeHotelHandoff.prepare(input, provider: .booking, now: now, calendar: calendar))
        }
        for (adults, rooms) in [(0,1),(1,0),(1,2),(31,1)] {
            var input = search; input.adults = adults; input.rooms = rooms
            XCTAssertThrowsError(try NativeHotelHandoff.prepare(input, provider: .booking, now: now, calendar: calendar))
        }
    }
    @MainActor func testEmptyControlAndURLTextFailClosed() {
        for name in [" ", "hotel\nprivate notes", "https://evil.example", String(repeating:"x", count:161)] {
            var input = search; input.hotelOrCity = name
            XCTAssertThrowsError(try NativeHotelHandoff.prepare(input, provider: .booking, now: now, calendar: calendar))
        }
    }
    @MainActor func testExpiryAndOpenFailureRemainDistinctFromBooking() throws {
        var handoff = try NativeHotelHandoff.prepare(search, provider: .booking, now: now, calendar: calendar)
        XCTAssertEqual(try handoff.validateForOpen(now: now, calendar: calendar), handoff.url)
        handoff.recordOpen(acceptedBySystem: false); XCTAssertEqual(handoff.state, .openFailed)
        handoff.recordOpen(acceptedBySystem: true); XCTAssertEqual(handoff.state, .opened)
        XCTAssertThrowsError(try handoff.validateForOpen(now: now.addingTimeInterval(900), calendar: calendar))
        XCTAssertEqual(handoff.state, .expired)
        handoff.recordOpen(acceptedBySystem: true); XCTAssertEqual(handoff.state, .expired)
    }
    @MainActor func testDateFormattingUsesLocalDayNotUTCShift() {
        var local = calendar; local.timeZone = TimeZone(secondsFromGMT: 8 * 3600)!
        let date = ISO8601DateFormatter().date(from: "2026-10-19T17:00:00Z")!
        XCTAssertEqual(NativeHotelHandoff.day(date, calendar: local), "2026-10-20")
    }
}
