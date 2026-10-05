import Foundation

struct NativePlaceGuideSource: Decodable, Equatable {
    let sourceRevisionId: String
    let revisionLabel: String
    let publisher: String
    let uri: String
    let locator: String
    var url: URL? { URL(string: uri).flatMap { ["https", "http"].contains($0.scheme) ? $0 : nil } }
}

struct NativePlaceGuideSegment: Decodable, Equatable, Identifiable {
    let id: String
    let kind: String
    let subjectId: String
    let predicate: String
    let factId: String
    let factVersion: Int
    let assertionId: String
    let assertionRevision: Int
    let text: String
    let conditions: [String]
    let exclusions: [String]
    let reviewedAt: String
    let expiresAt: String
    let sources: [NativePlaceGuideSource]
    /// The published expression and every qualifier are spoken verbatim, without model rewriting.
    var speechText: String { ([text] + conditions + exclusions).joined(separator: "\n") }
}

struct NativePlaceGuideReady: Decodable, Equatable {
    struct Names: Decodable, Equatable { let en: String; let zh: String }
    struct Rights: Decodable, Equatable { let revision: Int; let display: Bool; let tts: Bool; let cache: Bool; let prompt: Bool }
    let kind: String
    let version: Int
    let tripId: String
    let tripVersion: Int
    let placeReferenceId: String
    let canonicalPoiId: String
    let place: Names
    let locale: String
    let interest: String
    let digest: String
    let evaluatedAt: String
    let expiresAt: String
    let rights: Rights
    let segments: [NativePlaceGuideSegment]
    let completedSegmentIds: [String]
    let replayAskUnits: Int
    let narration: String
    let unsupportedNarratives: [String]

    func remaining(now: Date = Date()) -> TimeInterval {
        guard let expires = playbackExpiresAt else { return 0 }
        return max(0, min(30, expires.timeIntervalSince(now)))
    }
    /// Preserve the absolute authority boundary; two separate now() calls must not extend it.
    var playbackExpiresAt: Date? {
        guard let expires = NativeKnowledgeRead.date(expiresAt), let evaluated = NativeKnowledgeRead.date(evaluatedAt) else { return nil }
        return min(expires, evaluated.addingTimeInterval(30))
    }

    static func decode(_ bytes: Data, expected: NativePlaceGuideSelection, now: Date = Date()) throws -> Self {
        guard bytes.count <= 65_536, expected.valid else { throw NativeDataError.invalidResponse }
        let raw = try NativePlaceActionWire.exact(JSONSerialization.jsonObject(with: bytes), ["kind", "version", "tripId", "tripVersion", "placeReferenceId", "canonicalPoiId", "place", "locale", "interest", "digest", "evaluatedAt", "expiresAt", "rights", "segments", "completedSegmentIds", "replayAskUnits", "narration", "unsupportedNarratives", "generationCost"])
        guard raw["generationCost"] is NSNull else { throw NativeDataError.invalidResponse }
        _ = try NativePlaceActionWire.exact(raw["place"] as Any, ["en", "zh"])
        let rights = try NativePlaceActionWire.exact(raw["rights"] as Any, ["revision", "display", "tts", "cache", "prompt"])
        guard ["display", "tts", "cache", "prompt"].allSatisfy({ NativePlaceActionWire.boolean(rights[$0]) != nil }),
              NativePlaceActionWire.integer(rights["revision"]).map({ $0 > 0 }) == true,
              let rows = raw["segments"] as? [[String: Any]], (1...4).contains(rows.count) else { throw NativeDataError.invalidResponse }
        for row in rows {
            _ = try NativePlaceActionWire.exact(row, ["id", "kind", "subjectId", "predicate", "factId", "factVersion", "assertionId", "assertionRevision", "text", "conditions", "exclusions", "reviewedAt", "expiresAt", "sources"])
            guard let sources = row["sources"] as? [[String: Any]], (1...8).contains(sources.count) else { throw NativeDataError.invalidResponse }
            for source in sources { _ = try NativePlaceActionWire.exact(source, ["sourceRevisionId", "revisionLabel", "publisher", "uri", "locator"]) }
        }
        let value = try JSONDecoder().decode(Self.self, from: bytes)
        guard value.kind == "ready", value.version == 1, value.tripId == expected.tripID,
              value.tripVersion == expected.tripVersion, value.placeReferenceId == expected.placeReferenceID,
              value.canonicalPoiId == expected.canonicalPoiID, value.locale == expected.locale,
              value.interest == expected.interest.rawValue, NativePlaceActionWire.digest(value.digest) != nil,
              value.rights.display, value.replayAskUnits == 0, value.narration == "published_facts",
              value.unsupportedNarratives == ["history", "legend"],
              validText(value.place.en, maximum: 160), validText(value.place.zh, maximum: 160),
              let evaluated = NativeKnowledgeRead.date(value.evaluatedAt),
              let expires = NativeKnowledgeRead.date(value.expiresAt),
              evaluated <= now.addingTimeInterval(5), now.timeIntervalSince(evaluated) <= 30,
              expires > now, expires > evaluated,
              value.completedSegmentIds.count <= 4,
              Set(value.completedSegmentIds).count == value.completedSegmentIds.count,
              Set(value.completedSegmentIds).isSubset(of: Set(value.segments.map(\.id))),
              Set(value.segments.map(\.id)).count == value.segments.count,
              value.rights.cache || value.completedSegmentIds.isEmpty,
              value.segments.map(\.speechText).joined(separator: "\n").utf16.count <= 2400 else { throw NativeDataError.invalidResponse }
        for segment in value.segments {
            guard NativePlaceActionWire.id(segment.id) != nil, segment.id == segment.assertionId,
                  segment.kind == "fact", ["located_at", "opens_during"].contains(segment.predicate),
                  validText(segment.subjectId, maximum: 200), NativePlaceActionWire.id(segment.factId) != nil,
                  segment.factVersion > 0, segment.assertionRevision > 0, validText(segment.text, maximum: 2400),
                  segment.conditions.count <= 20, segment.exclusions.count <= 20,
                  (segment.conditions + segment.exclusions).allSatisfy({ validText($0, maximum: 1000) }),
                  let reviewed = NativeKnowledgeRead.date(segment.reviewedAt), reviewed <= now.addingTimeInterval(5),
                  let segmentExpiry = NativeKnowledgeRead.date(segment.expiresAt), segmentExpiry >= expires,
                  Set(segment.sources.map(\.sourceRevisionId)).count == segment.sources.count,
                  segment.sources.allSatisfy({ NativePlaceActionWire.id($0.sourceRevisionId) != nil && validText($0.publisher, maximum: 200)
                      && validText($0.revisionLabel, maximum: 200) && validText($0.locator, maximum: 1000) && $0.url != nil })
            else { throw NativeDataError.invalidResponse }
        }
        return value
    }

    private static func validText(_ value: String, maximum: Int) -> Bool {
        !value.isEmpty && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
        && value.utf16.count <= maximum && value.unicodeScalars.allSatisfy { !CharacterSet.controlCharacters.contains($0) }
    }
}

extension NativePlaceGuideSelection {
    func command(_ action: String, extra: [String: Any] = [:]) throws -> Data {
        guard valid else { throw NativeDataError.invalidResponse }
        var value: [String: Any] = ["action": action, "expectedTripVersion": tripVersion,
            "placeReferenceId": placeReferenceID, "locale": locale, "interest": interest.rawValue]
        for (key, field) in extra { guard value[key] == nil else { throw NativeDataError.invalidResponse }; value[key] = field }
        return try NativePlaceActionWire.bytes(value)
    }
}

/// Safe historical metadata is independent of a current content-use grant.
enum NativePlaceGuideMetadataExport {
    static func decode(_ bytes: Data, expected: NativePlaceGuideSelection, now: Date = Date()) throws -> String {
        let value = try NativePlaceActionWire.exact(NativePlaceGuideStore.outcome(bytes), ["kind", "version", "scope", "coverage", "tripId", "placeReferenceId", "records", "bindings"])
        guard value["kind"] as? String == "export", NativePlaceActionWire.integer(value["version"]) == 1,
              value["scope"] as? String == "guide_selection_metadata", value["coverage"] as? String == "complete_for_selection",
              value["tripId"] as? String == expected.tripID, value["placeReferenceId"] as? String == expected.placeReferenceID,
              let records = value["records"] as? [[String: Any]], records.count <= 100,
              let bindings = value["bindings"] as? [[String: Any]], bindings.count <= 100 else { throw NativeDataError.invalidResponse }
        for row in records {
            _ = try NativePlaceActionWire.exact(row, ["digest", "canonicalPoiId", "locale", "interest", "rightsRevision", "completedSegmentIds", "expiresAt", "updatedAt"])
            guard NativePlaceActionWire.digest(row["digest"]) != nil, NativePlaceActionWire.id(row["canonicalPoiId"]) != nil,
                  row["locale"] as? String == expected.locale, row["interest"] as? String == expected.interest.rawValue,
                  NativePlaceActionWire.integer(row["rightsRevision"]).map({ $0 > 0 }) == true,
                  let completed = row["completedSegmentIds"] as? [String], completed.count <= 4, Set(completed).count == completed.count,
                  completed.allSatisfy({ NativePlaceActionWire.id($0) != nil }),
                  date(row["expiresAt"]) != nil, let updated = date(row["updatedAt"]), updated <= now.addingTimeInterval(5)
            else { throw NativeDataError.invalidResponse }
        }
        for row in bindings {
            _ = try NativePlaceActionWire.exact(row, ["turnId", "serviceTaskId", "operationId", "canonicalPoiId", "locale", "interest", "digest", "rightsRevision", "expiresAt", "tripVersion", "invalidated"])
            guard ["turnId", "serviceTaskId", "operationId", "canonicalPoiId"].allSatisfy({ NativePlaceActionWire.id(row[$0]) != nil }),
                  NativePlaceActionWire.integer(row["tripVersion"]) != nil, row["locale"] as? String == expected.locale,
                  row["interest"] as? String == expected.interest.rawValue, NativePlaceActionWire.digest(row["digest"]) != nil,
                  NativePlaceActionWire.integer(row["rightsRevision"]).map({ $0 > 0 }) == true,
                  date(row["expiresAt"]) != nil, NativePlaceActionWire.boolean(row["invalidated"]) != nil else { throw NativeDataError.invalidResponse }
        }
        guard Set(records.compactMap({ $0["digest"] as? String })).count == records.count,
              Set(bindings.compactMap({ $0["turnId"] as? String })).count == bindings.count else { throw NativeDataError.invalidResponse }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .prettyPrinted])
        guard let text = String(data: data, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return text
    }
    private static func date(_ raw: Any?) -> Date? {
        guard let value = raw as? String, value.utf8.count <= 40 else { return nil }
        return NativeKnowledgeRead.date(value)
    }
}
