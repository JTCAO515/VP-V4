import XCTest
@testable import VisePanda

nonisolated final class NativeHotelHandoffTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_035_200) // 2026-09-22 UTC
    private var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(secondsFromGMT: 0)!; return c }
    private var search: NativeHotelSearch { .init(hotelOrCity: "上海 & aid=evil#fragment", checkIn: "2026-10-20", checkOut: "2026-10-22", adults: 2, rooms: 1, includesChildren: false) }

    @MainActor func testExplicitBudgetUnitsAndTentativeNameDoNotBecomeQuoteOrBooking() {
        XCTAssertEqual(NativeLodgingBudget.parse("400.50", currency:"CNY", basis:.perRoomPerNight),
                       .init(amountMinor:40050,currency:"CNY",basis:.perRoomPerNight))
        for value in ["0", "400.501", "-4", "100000.01", "abc"] {
            XCTAssertNil(NativeLodgingBudget.parse(value,currency:"CNY",basis:.totalStay))
        }
        let typed=NativeLodgingSelection(hotelName:"Public hotel",provider:nil,providerPoiId:nil,canonicalPoiId:nil,selectedAt:Date())
        XCTAssertTrue(typed.valid)
        XCTAssertFalse(NativeLodgingSelection(hotelName:"passport\nnotes",provider:nil,providerPoiId:nil,canonicalPoiId:nil,selectedAt:Date()).valid)
        XCTAssertFalse(NativeLodgingSelection(hotelName:"Public hotel",provider:.amap,providerPoiId:nil,canonicalPoiId:nil,selectedAt:Date()).valid)
    }

    @MainActor func testHotelAdjustmentPreparesOnlyOneFirstOrLastDayProposalEdit() throws {
        let trip=NativeTripSummary(id:"trip",title:"Trip",headVersion:4,updatedAt:"2026-10-04")
        func day(_ id:String,_ date:String)->NativeTripDay {
            .init(id:id,date:date,timeZone:"Asia/Shanghai",items:[.init(id:id+"-item",dayId:id,title:"Existing stop")])
        }
        let detail=NativeTripDetail(version:2,trip:trip,content:.init(days:[day("first","2026-10-20"),day("middle","2026-10-21"),day("last","2026-10-22")]),
                                    hardLocks:.notEnabled,externalOrderStatus:.notConnected,confirmationState:"confirmed")
        let draft=try XCTUnwrap(NativeLodgingTripAdjustment.prepare(detail:detail,dayID:"first",itemID:"first-item",title:"Possible hotel transfer"))
        XCTAssertEqual(draft.patch.expectedVersion,4)
        XCTAssertEqual(draft.patch.operations.count,1)
        XCTAssertEqual(draft.patch.operations.first?.kind,.upsertItem)
        XCTAssertEqual(draft.patch.operations.first?.itemId,"first-item")
        XCTAssertEqual(detail.content.days[0].items[0].title,"Existing stop")
        XCTAssertNil(NativeLodgingTripAdjustment.prepare(detail:detail,dayID:"middle",itemID:"middle-item",title:"Possible hotel transfer"))
        XCTAssertNil(NativeLodgingTripAdjustment.prepare(detail:detail,dayID:"last",itemID:"wrong",title:"Possible hotel transfer"))
    }

    @MainActor func testContextRequestUsesExplicitLocalFieldsAndNullUnknowns() throws {
        let scope=NativeDataScope(endpoint:"http://127.0.0.1:6000",subject:"12345678-1234-4234-8234-123456789abc",mobileEpoch:1,generation:1)
        let namespace=try NativeOfflineTripNamespace(scope:scope,tripID:"22345678-1234-4234-8234-123456789abc")
        let selection=NativeLodgingSelection(hotelName:"My hotel note",provider:.amap,providerPoiId:"amap-1",
            canonicalPoiId:"32345678-1234-4234-8234-123456789abc",selectedAt:Date())
        let second=NativeLodgingSelection(hotelName:"Another note",provider:.amap,providerPoiId:"amap-2",
            canonicalPoiId:"42345678-1234-4234-8234-123456789abc",selectedAt:Date())
        let record=NativeLodgingLocalRecord(schemaVersion:"native-lodging-local/1",namespace:namespace,revision:1,
            tripVersion:7,intent:.searching,city:"shanghai",checkIn:nil,checkOut:nil,adults:nil,children:nil,rooms:nil,
            bedType:nil,budget:nil,candidateChoices:[selection,second],selected:selection,updatedAt:Date())
        let data=try XCTUnwrap(NativeLodgingContextRequest.make(record:record,locale:"zh",tripVersion:7))
        let root=try XCTUnwrap(JSONSerialization.jsonObject(with:data) as? [String:Any])
        XCTAssertEqual(Set(root.keys),Set(["expectedTripVersion","locale","needs","profileChoice","candidates","comparisonReference","proposalReference"]))
        let needs=try XCTUnwrap(root["needs"] as? [String:Any])
        XCTAssertTrue(needs["adults"] is NSNull);XCTAssertTrue(needs["budget"] is NSNull)
        XCTAssertNil(needs["hotelName"]);XCTAssertNil(needs["My hotel note"])
        let choices=try XCTUnwrap(root["candidates"] as? [[String:Any]])
        XCTAssertEqual(choices.count,2);XCTAssertEqual(choices.map{$0["providerPoiId"] as? String},["amap-1","amap-2"])
        let profile=try XCTUnwrap(root["profileChoice"] as? [String:Any])
        XCTAssertEqual(profile["useSaved"] as? Bool,false)
        let opted=try XCTUnwrap(NativeLodgingContextRequest.make(record:record,locale:"zh",tripVersion:7,useSavedTravelPace:true))
        let optedRoot=try XCTUnwrap(JSONSerialization.jsonObject(with:opted) as? [String:Any])
        XCTAssertEqual((optedRoot["profileChoice"] as? [String:Any])?["useSaved"] as? Bool,true)
        XCTAssertNil(NativeLodgingContextRequest.make(record:record,locale:"zh",tripVersion:8))
    }

    @MainActor func testReviewedHotelLabelNeedsMatchingCurrentReceiptAndUnknownCommerce() throws {
        let canonical="32345678-1234-4234-8234-123456789abc"
        let hash=String(repeating:"a",count:64)
        let selection=NativeLodgingSelection(hotelName:"Public hotel",provider:.amap,providerPoiId:"amap-1",
            canonicalPoiId:canonical,selectedAt:Date())
        let evidence:[String:Any]=["canonicalPoiId":canonical,"classification":"hotel",
            "mappingId":"42345678-1234-4234-8234-123456789abc","mappingVersion":2,"mappingDigest":hash,
            "statementId":"52345678-1234-4234-8234-123456789abc",
            "statementRevision":1,"payloadHash":hash,"factId":"62345678-1234-4234-8234-123456789abc","publicationVersion":1,
            "sourceDigest":hash,"sourceRefs":[["sourceRevisionId":"72345678-1234-4234-8234-123456789abc","revisionLabel":"r1",
                "snippetHash":hash,"publisher":"publisher","uri":"https://example.org/source","locator":"line-1"]],
            "rightsDigest":hash,"reviewedAt":"2026-10-04T00:00:00.000Z","expiresAt":"2026-10-04T00:01:30.000Z"]
        func reply(_ choice:String=canonical,_ quote:String="unknown",_ receipt:Any=evidence) throws -> NativeLodgingContext {
            let body:[String:Any]=["schemaVersion":"lodging-context/1",
                "basis":["tripId":"22345678-1234-4234-8234-123456789abc","tripVersion":7],
                "expiresAt":"2026-10-04T00:01:30.000Z",
                "candidates":[["choice":["canonicalPoiId":choice,"provider":"amap","providerPoiId":"amap-1"],
                    "identityStatus":"canonical_mapping_current","hotelClassification":"reviewed_hotel",
                    "classificationEvidence":receipt,"availability":"unknown","quote":quote,"checkInEligibility":"unknown"]],
                "ranking":["commissionUsed":false,"userNoteUsed":false],
                "profilePreview":["status":"unknown","value":NSNull(),"usage":"local_preview_only","appliedToRanking":false],
                "intent":["value":"searching","supplierConfirmed":false],"tripMutation":"none"]
            return try JSONDecoder().decode(NativeLodgingContext.self,
                from:JSONSerialization.data(withJSONObject:body))
        }
        let now=try XCTUnwrap(ISO8601DateFormatter().date(from:"2026-10-04T00:01:00Z"))
        let tripID="22345678-1234-4234-8234-123456789abc"
        func allowed(_ value:NativeLodgingContext)->Bool {
            value.reviewedHotel(for:selection,tripID:tripID,tripVersion:7,lodgingIntent:.searching,now:now)
        }
        XCTAssertTrue(allowed(try reply()))
        XCTAssertFalse(allowed(try reply("42345678-1234-4234-8234-123456789abc")))
        XCTAssertFalse(allowed(try reply(canonical,"available")))
        XCTAssertFalse(allowed(try reply(canonical,"unknown",NSNull())))
        XCTAssertFalse(try reply().reviewedHotel(for:selection,tripID:tripID,tripVersion:8,lodgingIntent:.searching,now:now))
        XCTAssertFalse(try reply().reviewedHotel(for:selection,tripID:tripID,tripVersion:7,lodgingIntent:.searching,
            now:try XCTUnwrap(ISO8601DateFormatter().date(from:"2026-10-04T00:01:30Z"))))
    }

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
        var multipleRooms = search; multipleRooms.adults = 1; multipleRooms.rooms = 2
        let generic = try NativeHotelHandoff.prepare(multipleRooms, provider: .trip, now: now, calendar: calendar)
        XCTAssertEqual(generic.url.absoluteString, "https://www.trip.com/hotels/")
        XCTAssertThrowsError(try NativeHotelHandoff.prepare(multipleRooms, provider: .booking, now: now, calendar: calendar))
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
