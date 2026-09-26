import XCTest
@testable import VisePanda

nonisolated final class NativeHotelHandoffTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_035_200) // 2026-09-22 UTC
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
    @MainActor func testComparisonDatesOnlyComeFromConfirmedValidTripDays() {
        let trip = NativeTripSummary(id: "one", title: "Trip", headVersion: 7, updatedAt: "2026-09-22")
        let days = [NativeTripDay(id: "b", date: "2026-10-22", timeZone: "Asia/Shanghai", items: []),
                    NativeTripDay(id: "a", date: "2026-10-20", timeZone: "Asia/Shanghai", items: [])]
        let detail = NativeTripDetail(version: 2, trip: trip, content: .init(days: days),
                                      hardLocks: .notEnabled, externalOrderStatus: .notConnected,
                                      confirmationState: "confirmed")
        XCTAssertEqual(NativeHotelTripWindow.suggest(from: detail),
                       .init(checkIn: "2026-10-20", checkOut: "2026-10-23", nights: 3, tripVersion: 7))
        let unconfirmed = NativeTripDetail(version: 2, trip: trip, content: .init(days: days),
                                           hardLocks: .notEnabled, externalOrderStatus: .notConnected,
                                           confirmationState: "initial")
        XCTAssertNil(NativeHotelTripWindow.suggest(from: unconfirmed))
        var invalidDays = days
        invalidDays[0].date = "2026-02-30"
        let invalid = NativeTripDetail(version: 2, trip: trip, content: .init(days: invalidDays),
                                       hardLocks: .notEnabled, externalOrderStatus: .notConnected,
                                       confirmationState: "confirmed")
        XCTAssertNil(NativeHotelTripWindow.suggest(from: invalid))
    }

    @MainActor func testAreaComparisonNeedsTwoMatchingFreshRoutesWithSharedObservedMode() throws {
        let first = NativePlaceCandidate(provider: .amap, providerPoiId: "area-one", rawName: "Area one", matchedCanonicalPoiId: nil)
        let second = NativePlaceCandidate(provider: .amap, providerPoiId: "area-two", rawName: "Area two", matchedCanonicalPoiId: nil)
        let destination = NativePlaceCandidate(provider: .amap, providerPoiId: "trip-stop", rawName: "Trip stop", matchedCanonicalPoiId: nil)
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-22T00:01:00Z"))
        func route(_ origin: String, expiry: String = "2026-09-22T00:05:00.000Z",
                   provider: String = "amap", status: String = "observed", threeModes: Bool = true) throws -> NativeRouteReply {
            let driving = threeModes ? #",{"mode":"driving","status":"no_routes"}"# : ""
            let json = """
            {"provider":"\(provider)","origin":{"provider":"amap","providerPoiId":"\(origin)","rawName":"Area"},
             "destination":{"provider":"amap","providerPoiId":"trip-stop","rawName":"Trip stop"},
             "observedAt":"2026-09-22T00:00:00.000Z","expiresAt":"\(expiry)",
             "options":[{"mode":"walking","status":"\(status)","durationSeconds":900,"distanceMeters":1000},
                        {"mode":"transit","status":"no_routes"}\(driving)]}
            """
            return try JSONDecoder().decode(NativeRouteReply.self, from: Data(json.utf8))
        }
        let validFirst = try route("area-one"), validSecond = try route("area-two")
        func accepts(_ a: NativeRouteReply, _ b: NativeRouteReply) -> Bool {
            NativeHotelRouteComparison.accepts(a, b, firstArea: first, secondArea: second,
                                                destination: destination, now: now)
        }
        XCTAssertTrue(accepts(validFirst, validSecond))
        XCTAssertFalse(accepts(try route("wrong-area"), validSecond))
        XCTAssertFalse(accepts(validFirst, try route("area-two", expiry: "2026-09-22T00:01:00.000Z")))
        XCTAssertFalse(accepts(validFirst, try route("area-two", provider: "other")))
        XCTAssertFalse(accepts(validFirst, try route("area-two", status: "provider_rejected")))
        XCTAssertFalse(accepts(validFirst, try route("area-two", threeModes: false)))
    }
}
