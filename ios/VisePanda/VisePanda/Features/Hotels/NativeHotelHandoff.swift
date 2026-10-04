import Foundation

/// Explicit current-Trip lodging input kept on this device only. It is never a
/// provider booking, a Memory preference, or a confirmed Trip mutation.
enum NativeLodgingIntent: String, Codable, CaseIterable {
    case undecided, searching, booked, notNeeded = "not_needed", deferred
}

enum NativeLodgingBedType: String, Codable, CaseIterable {
    case unspecified, double, twin
}

enum NativeLodgingBudgetBasis: String, Codable, CaseIterable {
    case perRoomPerNight = "per_room_per_night", totalStay = "total_stay"
}

struct NativeLodgingBudget: Codable, Equatable {
    let amountMinor: Int
    let currency: String
    let basis: NativeLodgingBudgetBasis
    var valid: Bool { (1...10_000_000).contains(amountMinor) && ["CNY", "USD", "EUR", "GBP"].contains(currency) }

    static func parse(_ value: String, currency: String, basis: NativeLodgingBudgetBasis) -> Self? {
        guard value.range(of: #"^[0-9]{1,7}(\.[0-9]{1,2})?$"#, options: .regularExpression) != nil else { return nil }
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard let units = Int(parts[0]), units <= 100_000 else { return nil }
        let fraction = parts.count == 2 ? String(parts[1]).padding(toLength: 2, withPad: "0", startingAt: 0) : "00"
        guard let cents = Int(fraction) else { return nil }
        let budget = Self(amountMinor: units * 100 + cents, currency: currency, basis: basis)
        return budget.valid ? budget : nil
    }
}

/// A user-selected public point or typed hotel name, never supplier confirmation.
struct NativeLodgingSelection: Codable, Equatable {
    let hotelName: String
    let provider: NativePlaceProvider?
    let providerPoiId: String?
    let canonicalPoiId: String?
    let selectedAt: Date

    var valid: Bool {
        let name = hotelName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name == hotelName, name.utf16.count <= 160,
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              !name.contains("://") else { return false }
        if provider == nil { return providerPoiId == nil && canonicalPoiId == nil }
        guard let providerPoiId, providerPoiId.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { return false }
        return canonicalPoiId == nil || UUID(uuidString: canonicalPoiId!) != nil
    }
}

struct NativeLodgingLocalRecord: Codable, Equatable {
    let schemaVersion: String
    let namespace: NativeOfflineTripNamespace
    let revision: Int
    let tripVersion: Int
    let intent: NativeLodgingIntent
    let city: String?
    let checkIn: String?
    let checkOut: String?
    let adults: Int?
    let children: Int?
    let rooms: Int?
    let bedType: NativeLodgingBedType?
    let budget: NativeLodgingBudget?
    let candidateChoices: [NativeLodgingSelection]
    let selected: NativeLodgingSelection?
    let updatedAt: Date

    var valid: Bool {
        guard schemaVersion == "native-lodging-local/1", namespace.valid,
              (1...1_000_000).contains(revision), (0...999_999_999).contains(tripVersion),
              budget?.valid != false, selected?.valid != false,
              candidateChoices.count <= 2, candidateChoices.allSatisfy(\.valid) else { return false }
        let identities = candidateChoices.compactMap { $0.canonicalPoiId?.lowercased() }
        if Set(identities).count != identities.count { return false }
        if let selected, selected.provider != nil,
           !candidateChoices.contains(where: { $0.provider == selected.provider &&
               $0.providerPoiId == selected.providerPoiId && $0.canonicalPoiId == selected.canonicalPoiId }) { return false }
        if let city, !["shanghai", "beijing", "guangzhou", "chongqing"].contains(city) { return false }
        if let adults, !(1...30).contains(adults) { return false }
        if let children, !(0...30).contains(children) { return false }
        if let rooms, !(1...30).contains(rooms) { return false }
        let partyFields = [adults, children, rooms].compactMap { $0 }.count
        if partyFields != 0 && partyFields != 3 { return false }
        if let selected, selected.selectedAt > updatedAt { return false }
        if checkIn != nil || checkOut != nil {
            guard let checkIn, let checkOut,
                  Self.validStay(checkIn: checkIn, checkOut: checkOut) else { return false }
        }
        return true
    }

    func needsTripRecheck(currentVersion: Int) -> Bool { tripVersion != currentVersion }

    private static func validStay(checkIn: String, checkOut: String) -> Bool {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard checkIn.count == 10, checkOut.count == 10,
              let arrival = formatter.date(from: checkIn), let departure = formatter.date(from: checkOut),
              formatter.string(from: arrival) == checkIn, formatter.string(from: departure) == checkOut,
              let nights = formatter.calendar.dateComponents([.day], from: arrival, to: departure).day else { return false }
        return (1...90).contains(nights)
    }
}

/// Builds one reviewable edit for an explicitly named first/last-day item.
/// It never presents a hotel selection as a booked Trip fact.
enum NativeLodgingTripAdjustment {
    static func prepare(detail: NativeTripDetail, dayID: String, itemID: String, title: String) -> NativeTripDraft? {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard detail.confirmationState == "confirmed", !trimmed.isEmpty, trimmed.utf16.count <= 160 else { return nil }
        let dated = detail.content.days.sorted { $0.date < $1.date }
        guard let first = dated.first?.id, let last = dated.last?.id, [first, last].contains(dayID) else { return nil }
        var draft = NativeTripDraft(detail)
        guard let day = draft.days.firstIndex(where: { $0.id == dayID }),
              let item = draft.days[day].items.firstIndex(where: { $0.id == itemID }),
              draft.days[day].items[item].title != trimmed else { return nil }
        draft.days[day].items[item].title = trimmed
        guard draft.patch.operations.count == 1, draft.patch.operations[0].kind == .upsertItem else { return nil }
        return draft
    }
}

/// Exact ordinary-owner read request. Nulls are explicit; no Memory, provider
/// URL, affiliate value or private Trip item text is sent as lodging evidence.
enum NativeLodgingContextRequest {
    static func make(record: NativeLodgingLocalRecord, locale: String, tripVersion: Int,
                     useSavedTravelPace: Bool = false) -> Data? {
        guard record.valid, record.tripVersion == tripVersion,
              ["zh", "en"].contains(locale), record.intent != .undecided else { return nil }
        let none = NSNull()
        var budget: Any = none
        if let value = record.budget {
            budget = ["amountMinor": value.amountMinor, "currency": value.currency, "basis": value.basis.rawValue] as [String: Any]
        }
        let candidates: [[String: Any]] = record.candidateChoices.compactMap { choice in
            guard let provider = choice.provider, let providerPoiId = choice.providerPoiId,
                  let canonicalPoiId = choice.canonicalPoiId else { return nil }
            return ["canonicalPoiId": canonicalPoiId, "provider": provider.rawValue, "providerPoiId": providerPoiId]
        }
        let needs: [String: Any] = [
            "city": record.city as Any? ?? none, "checkIn": record.checkIn as Any? ?? none,
            "checkOut": record.checkOut as Any? ?? none, "adults": record.adults as Any? ?? none,
            "children": record.children as Any? ?? none, "rooms": record.rooms as Any? ?? none,
            "bedType": record.bedType?.rawValue as Any? ?? none, "budget": budget,
            "intent": record.intent.rawValue, "userNote": none
        ]
        let body: [String: Any] = [
            "expectedTripVersion": tripVersion, "locale": locale, "needs": needs,
            "profileChoice": ["currentPace": none, "useSaved": useSavedTravelPace,
                              "expectedSourceRevision": none] as [String: Any],
            "candidates": candidates, "comparisonReference": none, "proposalReference": none
        ]
        guard JSONSerialization.isValidJSONObject(body) else { return nil }
        return try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    }
}

struct NativeLodgingContext: Decodable {
    struct Basis: Decodable { let tripId: String; let tripVersion: Int }
    struct Choice: Decodable { let canonicalPoiId: String; let provider: NativePlaceProvider; let providerPoiId: String }
    struct SourceRef: Decodable {
        let sourceRevisionId: String; let revisionLabel: String; let snippetHash: String
        let publisher: String; let uri: String; let locator: String
    }
    struct Evidence: Decodable {
        let canonicalPoiId: String; let classification: String
        let mappingId: String; let mappingVersion: Int; let mappingDigest: String
        let statementId: String; let statementRevision: Int; let payloadHash: String
        let factId: String; let publicationVersion: Int; let sourceDigest: String
        let sourceRefs: [SourceRef]; let rightsDigest: String
        let reviewedAt: String; let expiresAt: String

        func valid(for canonical: String, now: Date) -> Bool {
            func digest(_ value: String) -> Bool {
                value.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil
            }
            guard canonicalPoiId.lowercased() == canonical.lowercased(), classification == "hotel",
                  UUID(uuidString: mappingId) != nil, UUID(uuidString: statementId) != nil,
                  UUID(uuidString: factId) != nil,
                  mappingVersion == 2, statementRevision == 1, publicationVersion == 1,
                  [mappingDigest, payloadHash, sourceDigest, rightsDigest].allSatisfy(digest),
                  (1...3).contains(sourceRefs.count),
                  let reviewed = NativeLodgingContext.parseDate(reviewedAt), reviewed <= now,
                  let expiry = NativeLodgingContext.parseDate(expiresAt), expiry > now,
                  expiry.timeIntervalSince(now) <= 30 else { return false }
            return sourceRefs.allSatisfy { source in
                guard UUID(uuidString: source.sourceRevisionId) != nil,
                      digest(source.snippetHash), !source.revisionLabel.isEmpty, source.revisionLabel.count <= 120,
                      !source.publisher.isEmpty, source.publisher.count <= 160,
                      !source.locator.isEmpty, source.locator.count <= 240,
                      let url = URLComponents(string: source.uri),
                      ["http", "https"].contains(url.scheme ?? ""), url.host != nil,
                      url.user == nil, url.password == nil else { return false }
                return true
            }
        }
    }
    struct Candidate: Decodable {
        let choice: Choice
        let identityStatus: String
        let hotelClassification: String
        let classificationEvidence: Evidence?
        let availability: String; let quote: String; let checkInEligibility: String
    }
    struct Ranking: Decodable { let commissionUsed: Bool; let userNoteUsed: Bool }
    struct Intent: Decodable { let value: String; let supplierConfirmed: Bool }
    struct ProfilePreview: Decodable {
        struct Value: Decodable { let travelPace: String?; let source: String; let sourceRevision: Int? }
        let status: String; let value: Value?; let usage: String; let appliedToRanking: Bool
    }
    let schemaVersion: String
    let basis: Basis
    let expiresAt: String
    let candidates: [Candidate]
    let profilePreview: ProfilePreview
    let ranking: Ranking
    let intent: Intent
    let tripMutation: String

    func reviewedHotel(for selection: NativeLodgingSelection, tripID: String, tripVersion: Int,
                       lodgingIntent: NativeLodgingIntent, now: Date) -> Bool {
        guard schemaVersion == "lodging-context/1", basis.tripId.lowercased() == tripID.lowercased(),
              basis.tripVersion == tripVersion, ranking.commissionUsed == false, ranking.userNoteUsed == false,
              intent.value == lodgingIntent.rawValue, intent.supplierConfirmed == false, tripMutation == "none",
              let deadline = NativeLodgingContext.parseDate(expiresAt), deadline > now,
              deadline.timeIntervalSince(now) <= 30,
              let provider = selection.provider, let poi = selection.providerPoiId,
              let canonical = selection.canonicalPoiId else { return false }
        return candidates.contains { candidate in
            guard candidate.choice.canonicalPoiId.lowercased() == canonical.lowercased(),
                  candidate.choice.provider == provider, candidate.choice.providerPoiId == poi,
                  candidate.identityStatus == "canonical_mapping_current",
                  candidate.hotelClassification == "reviewed_hotel",
                  candidate.availability == "unknown", candidate.quote == "unknown",
                  candidate.checkInEligibility == "unknown", let evidence = candidate.classificationEvidence,
                  evidence.valid(for: canonical, now: now) else { return false }
            return true
        }
    }

    fileprivate static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }
}

/// Explicit search fields only. Never accepts a Trip, notes, arbitrary URL, affiliate ID or room SKU.
struct NativeHotelSearch: Equatable {
    var hotelOrCity: String
    var checkIn: String
    var checkOut: String
    var adults: Int
    var rooms: Int
    var includesChildren: Bool
}

/// A suggested span from confirmed Trip days, never a claim that one hotel is needed throughout it.
struct NativeHotelTripWindow: Equatable {
    let checkIn: String
    let checkOut: String
    let nights: Int
    let tripVersion: Int

    static func suggest(from detail: NativeTripDetail) -> Self? {
        guard detail.confirmationState == "confirmed", !detail.content.days.isEmpty else { return nil }
        let days = detail.content.days.map(\.date).sorted()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard days.allSatisfy({ day in
            day.count == 10 && formatter.date(from: day).map { formatter.string(from: $0) == day } == true
        }), let last = formatter.date(from: days[days.count - 1]),
              let first = formatter.date(from: days[0]),
              let departure = formatter.calendar.date(byAdding: .day, value: 1, to: last),
              let nights = formatter.calendar.dateComponents([.day], from: first, to: departure).day,
              (1...90).contains(nights) else { return nil }
        return .init(checkIn: days[0], checkOut: formatter.string(from: departure),
                     nights: nights, tripVersion: detail.trip.headVersion)
    }
}

/// Accepts a pair only when both observations identify the selected map points
/// and share at least one usable mode. A lone result cannot imply a comparison.
enum NativeHotelRouteComparison {
    static func accepts(_ first: NativeRouteReply, _ second: NativeRouteReply,
                        firstArea: NativePlaceCandidate, secondArea: NativePlaceCandidate,
                        destination: NativePlaceCandidate, now: Date) -> Bool {
        guard valid(first, area: firstArea, destination: destination, now: now),
              valid(second, area: secondArea, destination: destination, now: now) else { return false }
        let firstModes = Set(first.options.filter { $0.status == "observed" }.map(\.mode))
        let secondModes = Set(second.options.filter { $0.status == "observed" }.map(\.mode))
        return !firstModes.isDisjoint(with: secondModes)
    }

    private static func valid(_ reply: NativeRouteReply, area: NativePlaceCandidate,
                              destination: NativePlaceCandidate, now: Date) -> Bool {
        guard area.provider == .amap, destination.provider == .amap,
              reply.provider == "amap", reply.origin.provider == .amap, reply.destination.provider == .amap,
              reply.origin.providerPoiId == area.providerPoiId,
              reply.destination.providerPoiId == destination.providerPoiId,
              reply.options.count == 3,
              Set(reply.options.map(\.mode)) == Set(["walking", "transit", "driving"]),
              !reply.expired(at: now) else { return false }
        return reply.options.allSatisfy { option in
            option.status != "observed" ||
                ((option.durationSeconds ?? -1) >= 0 && (option.durationSeconds ?? .infinity) <= 604800 &&
                 (option.distanceMeters ?? -1) >= 0 && (option.distanceMeters ?? .infinity) <= 100_000_000 &&
                 (option.walkingMeters.map { $0 >= 0 && $0 <= 100_000_000 } ?? true))
        }
    }
}

enum NativeHotelProvider: String, CaseIterable, Identifiable {
    case booking, trip
    var id: String { rawValue }
    var title: String { self == .booking ? "Booking.com" : "Trip.com" }
}

struct NativeHotelHandoff: Identifiable {
    enum Failure: Error { case invalidSearch, expired }
    enum State { case prepared, opened, openFailed, expired }
    let id = UUID()
    let provider: NativeHotelProvider
    let search: NativeHotelSearch
    let url: URL
    let expiresAt: Date
    private(set) var state = State.prepared

    static func prepare(_ search: NativeHotelSearch, provider: NativeHotelProvider,
                        now: Date = Date(), calendar: Calendar = .current) throws -> Self {
        let name = search.hotelOrCity.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 160,
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              !name.contains("://"),
              (1...30).contains(search.adults), (1...30).contains(search.rooms),
              (provider != .booking || search.rooms <= search.adults),
              let arrival = parseDay(search.checkIn, calendar: calendar),
              let departure = parseDay(search.checkOut, calendar: calendar),
              arrival >= calendar.startOfDay(for: now), departure > arrival,
              let nights = calendar.dateComponents([.day], from: arrival, to: departure).day,
              nights <= 90 else { throw Failure.invalidSearch }
        var components = URLComponents()
        components.scheme = "https"
        components.host = provider == .booking ? "www.booking.com" : "www.trip.com"
        components.path = provider == .booking ? "/searchresults.html" : "/hotels/"
        if provider == .booking {
            components.queryItems = [URLQueryItem(name: "ss", value: name),
                URLQueryItem(name: "checkin", value: search.checkIn),
                URLQueryItem(name: "checkout", value: search.checkOut)]
            // Child ages are not collected: omit the whole occupancy rather than invent ages or send zero children.
            if !search.includesChildren {
                components.queryItems?.append(contentsOf: [
                    URLQueryItem(name: "group_adults", value: String(search.adults)),
                    URLQueryItem(name: "no_rooms", value: String(search.rooms)),
                    URLQueryItem(name: "group_children", value: "0")])
            }
        }
        guard let url = components.url else { throw Failure.invalidSearch }
        return Self(provider: provider, search: search, url: url, expiresAt: now.addingTimeInterval(900))
    }

    mutating func validateForOpen(now: Date = Date(), calendar: Calendar = .current) throws -> URL {
        guard now < expiresAt, let arrival = Self.parseDay(search.checkIn, calendar: calendar),
              arrival >= calendar.startOfDay(for: now) else {
            state = .expired
            throw Failure.expired
        }
        return url
    }

    mutating func recordOpen(acceptedBySystem: Bool) {
        guard state != .expired else { return }
        state = acceptedBySystem ? .opened : .openFailed
    }

    static func day(_ date: Date, calendar: Calendar = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func parseDay(_ value: String, calendar: Calendar) -> Date? {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
        return date
    }
}
