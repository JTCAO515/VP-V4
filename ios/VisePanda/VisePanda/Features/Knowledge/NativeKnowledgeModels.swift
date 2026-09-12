import Foundation

struct NativeKnowledgeSelection: Codable, Hashable, Sendable {
    var city = "shanghai"
    var scene = "arrival"
    var locale = "en"

    static let cities = ["shanghai", "beijing", "guangzhou", "chongqing"]
    static let scenes = ["arrival", "airport_transport", "payment", "connectivity", "public_transport", "taxi", "rail", "attraction", "accommodation", "emergency"]
    var valid: Bool { Self.cities.contains(city) && Self.scenes.contains(scene) && ["zh", "en"].contains(locale) }
    var queryItems: [URLQueryItem] {
        [URLQueryItem(name: "city", value: city), URLQueryItem(name: "scene", value: scene), URLQueryItem(name: "locale", value: locale)]
    }
}

struct NativeKnowledgeReply: Decodable {
    let data: NativeKnowledgeRead
}

struct NativeKnowledgeRead: Decodable {
    let schemaVersion: String
    let evaluatedAt: String
    let scope: NativeKnowledgeSelection
    let purpose: String
    let recipient: String
    let territory: String
    let status: String
    let statements: [NativeKnowledgeStatement]

    /// A snapshot may live at most30 seconds and never beyond the server's expiry.
    /// Subtract the full request duration conservatively; wall-clock rollback cannot extend it.
    func lifetime(for selection: NativeKnowledgeSelection, elapsed: TimeInterval) throws -> TimeInterval {
        guard selection.valid, scope == selection, schemaVersion == "knowledge-read/1",
              purpose == "trip_planning", recipient == "first_party", territory == "CN-mainland",
              statements.count <= 50, Set(statements.map(\.id)).count == statements.count,
              status == (statements.isEmpty ? "no_eligible_content" : "available"),
              let evaluated = Self.date(evaluatedAt), elapsed.isFinite, elapsed >= 0 else {
            throw NativeDataError.invalidResponse
        }
        var remaining: TimeInterval = 30
        for row in statements {
            guard row.valid, let expires = Self.date(row.expiresAt),
                  let reviewed = Self.date(row.reviewedAt), let published = Self.date(row.publishedAt),
                  reviewed <= published, published <= evaluated, expires > evaluated else {
                throw NativeDataError.invalidResponse
            }
            remaining = min(remaining, expires.timeIntervalSince(evaluated))
        }
        guard remaining > elapsed else { throw NativeDataError.invalidResponse }
        return remaining - elapsed
    }

    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let result = formatter.date(from: value) { return result }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

struct NativeKnowledgeStatement: Decodable, Identifiable {
    let factId: String
    let version: Int
    let assertionId: String
    let assertionRevision: Int
    let assertion: Assertion
    let text: String
    let conditions: [String]
    let exclusions: [String]
    let reviewedAt: String
    let publishedAt: String
    let expiresAt: String
    let sources: [Source]
    var id: String { factId }

    struct Assertion: Decodable {
        let subjectId: String
        let predicate: String
        let objectId: String
        let conditions: [String]
        let exclusions: [String]
    }
    struct Source: Decodable, Identifiable {
        let sourceRevisionId: String
        let publisher: String
        let uri: String
        let locator: String
        var id: String { sourceRevisionId }
        var url: URL? {
            guard let url = URL(string: uri), ["https", "http"].contains(url.scheme),
                  url.host != nil, url.user == nil, url.password == nil else { return nil }
            return url
        }
    }
    var valid: Bool {
        UUID(uuidString: factId) != nil && UUID(uuidString: assertionId) != nil && version == 1 && assertionRevision == 1 &&
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.count <= 1000 &&
        conditions.count == assertion.conditions.count && exclusions.count == assertion.exclusions.count &&
        conditions.count <= 12 && exclusions.count <= 12 &&
        (conditions + exclusions).allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 240 } &&
        (1...3).contains(sources.count) && Set(sources.map(\.id)).count == sources.count &&
        sources.allSatisfy { UUID(uuidString: $0.id) != nil && !$0.publisher.isEmpty && !$0.locator.isEmpty }
    }
}
