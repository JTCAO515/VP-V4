import Foundation

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
              (1...30).contains(search.adults), (1...30).contains(search.rooms), search.rooms <= search.adults,
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
