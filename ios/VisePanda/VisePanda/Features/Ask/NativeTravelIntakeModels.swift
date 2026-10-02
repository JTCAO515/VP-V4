import Foundation

/// All optional fields encode explicit null; absence never means keep or default.
struct NativeTravelIntake: Codable, Equatable {
    var schemaVersion = "stay-area-intake/1"
    var city: String?
    var comparisonTarget: String?
    var durationDays: Int?
    var partySize: Int?
    var interests: [String]?
    var pace: String?
    var lodgingBudget: Budget?
    var dates: Dates?
    var mobilityConstraints: [String]?
    struct Budget: Codable, Equatable { var currency: String; var perNightMinorUnits: Int }
    struct Dates: Codable, Equatable { var startDate: String; var endDate: String }
    enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, city, comparisonTarget, durationDays, partySize, interests, pace, lodgingBudget, dates, mobilityConstraints
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(city, forKey: .city); try c.encode(comparisonTarget, forKey: .comparisonTarget)
        try c.encode(durationDays, forKey: .durationDays); try c.encode(partySize, forKey: .partySize)
        try c.encode(interests, forKey: .interests); try c.encode(pace, forKey: .pace)
        try c.encode(lodgingBudget, forKey: .lodgingBudget); try c.encode(dates, forKey: .dates)
        try c.encode(mobilityConstraints, forKey: .mobilityConstraints)
    }
    var valid: Bool {
        schemaVersion == "stay-area-intake/1"
        && (city == nil || Self.text(city!, max: 80))
        && (comparisonTarget == nil || ["area_transport", "lodging_budget_filter"].contains(comparisonTarget!))
        && (durationDays == nil || (1...30).contains(durationDays!))
        && (partySize == nil || (1...10).contains(partySize!))
        && (interests == nil || (interests!.count <= 8 && Set(interests!).count == interests!.count && interests!.allSatisfy { ["food", "photography", "culture", "nature"].contains($0) }))
        && (pace == nil || ["relaxed", "balanced", "fast"].contains(pace!))
        && (lodgingBudget == nil || (["CNY", "USD", "EUR", "GBP"].contains(lodgingBudget!.currency) && (1...10_000_000).contains(lodgingBudget!.perNightMinorUnits)))
        && (dates == nil || Self.validDates(dates!))
        && (mobilityConstraints == nil || (mobilityConstraints!.count <= 6 && Set(mobilityConstraints!).count == mobilityConstraints!.count && mobilityConstraints!.allSatisfy { Self.text($0, max: 120) }))
    }
    static func text(_ value: String, max: Int) -> Bool {
        !value.isEmpty && value.utf16.count <= max && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    static func validDates(_ value: Dates) -> Bool {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard let start = f.date(from: value.startDate), let end = f.date(from: value.endDate),
              f.string(from: start) == value.startDate, f.string(from: end) == value.endDate else { return false }
        return end >= start && end.timeIntervalSince(start) <= 30 * 86400
    }
}

enum NativeTravelIntakeCorrectionLimit: Equatable { case goalVersion, intakeRevision, messageSequence }

struct NativeTravelMemoryReference: Codable, Equatable { let id: String; let revision: Int }
struct NativeTravelIntakeBasis: Decodable, Equatable {
    let version: Int; let kind: String; let schemaVersion: String
    let conversationId: String; let goalId: String; let goalVersion: Int
    let messageId: String; let messageSequence: Int; let intakeRevision: Int
    let sourceKind: String; let intake: NativeTravelIntake
    let memoryBasis: [NativeTravelMemoryReference]; let contextDigest: String
    let readiness: Readiness; let readyForProvider: Bool
    struct Readiness: Decodable, Equatable { let kind: String; let scope: String?; let unknown: [String]?; let questions: [String]?; let reason: String? }
    var correctionLimit: NativeTravelIntakeCorrectionLimit? {
        if goalVersion == 10_000 { return .goalVersion }
        if intakeRevision == 1_000 { return .intakeRevision }
        if messageSequence == 1_000_000 { return .messageSequence }
        return nil
    }
    static func decode(_ bytes: Data) throws -> Self {
        guard bytes.count <= 32_000, let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(root.keys) == Set(["version", "kind", "schemaVersion", "conversationId", "goalId", "goalVersion", "messageId", "messageSequence", "intakeRevision", "sourceKind", "intake", "memoryBasis", "contextDigest", "readiness", "readyForProvider"]),
              let projection = root["intake"] as? [String: Any],
              Set(projection.keys) == Set(NativeTravelIntake.CodingKeys.allCases.map(\.rawValue)) else { throw NativeDataError.invalidResponse }
        for (key, keys) in [("lodgingBudget", ["currency", "perNightMinorUnits"]), ("dates", ["startDate", "endDate"])] {
            if !(projection[key] is NSNull) {
                guard let nested = projection[key] as? [String: Any], Set(nested.keys) == Set(keys) else { throw NativeDataError.invalidResponse }
            }
        }
        guard let readiness = root["readiness"] as? [String: Any], let kind = readiness["kind"] as? String else { throw NativeDataError.invalidResponse }
        switch kind {
        case "ready":
            guard Set(readiness.keys) == Set(["kind", "scope", "unknown"]), readiness["scope"] as? String == "transport_screening",
                  let unknown = readiness["unknown"] as? [String], Set(unknown).count == unknown.count,
                  unknown.allSatisfy({ NativeTravelIntake.CodingKeys.allCases.map(\.rawValue).contains($0) && $0 != "schemaVersion" }) else { throw NativeDataError.invalidResponse }
        case "waiting_user":
            guard Set(readiness.keys) == Set(["kind", "questions"]), let questions = readiness["questions"] as? [String],
                  !questions.isEmpty, Set(questions).count == questions.count,
                  questions.allSatisfy({ ["city", "comparison_target", "lodging_budget"].contains($0) }) else { throw NativeDataError.invalidResponse }
        case "unavailable":
            guard Set(readiness.keys) == Set(["kind", "reason"]), let reason = readiness["reason"] as? String,
                  ["city_not_covered", "budget_filter_not_integrated"].contains(reason) else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
        guard let memories = root["memoryBasis"] as? [[String: Any]], memories.allSatisfy({ Set($0.keys) == Set(["id", "revision"]) }) else { throw NativeDataError.invalidResponse }
        let v = try JSONDecoder().decode(Self.self, from: bytes)
        guard v.version == 5, v.kind == "travel_intake", v.schemaVersion == "assistant-travel-current-basis/1",
              [v.conversationId, v.goalId, v.messageId].allSatisfy({ UUID(uuidString: $0) != nil }),
              (1...10_000).contains(v.goalVersion), (1...1_000_000).contains(v.messageSequence), (1...1_000).contains(v.intakeRevision), v.sourceKind == "explicit_current_input",
              v.intake.valid, v.memoryBasis.count <= 3, Set(v.memoryBasis.map(\.id)).count == v.memoryBasis.count,
              v.memoryBasis.allSatisfy({ UUID(uuidString: $0.id) != nil && (1...999_999_999_999_999).contains($0.revision) }),
              v.contextDigest.count == 64, v.contextDigest.allSatisfy({ "0123456789abcdef".contains($0) }), !v.readyForProvider,
              ["ready", "waiting_user", "unavailable"].contains(v.readiness.kind) else { throw NativeDataError.invalidResponse }
        let missing = Set(projection.filter { $0.value is NSNull }.map(\.key))
        switch v.readiness.kind {
        case "ready":
            guard v.intake.city == "shanghai", v.intake.comparisonTarget == "area_transport",
                  Set(v.readiness.unknown ?? []) == missing else { throw NativeDataError.invalidResponse }
        case "waiting_user":
            var expected: [String] = []
            if v.intake.city == nil { expected.append("city") }
            if v.intake.comparisonTarget == nil { expected.append("comparison_target") }
            if expected.isEmpty && v.intake.city == "shanghai" && v.intake.comparisonTarget == "lodging_budget_filter" && v.intake.lodgingBudget == nil { expected = ["lodging_budget"] }
            guard !expected.isEmpty, Set(expected) == Set(v.readiness.questions ?? []) else { throw NativeDataError.invalidResponse }
        case "unavailable":
            guard let city = v.intake.city, v.intake.comparisonTarget != nil else { throw NativeDataError.invalidResponse }
            if city != "shanghai" { guard v.readiness.reason == "city_not_covered" else { throw NativeDataError.invalidResponse } }
            else { guard v.intake.comparisonTarget == "lodging_budget_filter", v.intake.lodgingBudget != nil, v.readiness.reason == "budget_filter_not_integrated" else { throw NativeDataError.invalidResponse } }
        default: throw NativeDataError.invalidResponse
        }
        return v
    }
}

struct NativeTravelIntakeSelection: Equatable {
    let scope: NativeDataScope; let conversationID: String; let goalID: String
    let goalVersion: Int; let parentMessageID: String; let policyID: String
    var canCorrect: Bool { valid && goalVersion < 10_000 }
    var valid: Bool { (1...10_000).contains(goalVersion) && [conversationID, goalID, parentMessageID, policyID].allSatisfy { UUID(uuidString: $0) != nil } }
}
struct NativeTravelIntakeSubmission: Encodable {
    let conversationId: String; let goalId: String; let messageId: String; let idempotencyKey: String
    let policyId: String; let locale: String; let text: String
    let relationship: String; let parentMessageId: String
    let expectedGoalVersion: Int; let expectedIntakeRevision: Int
    let intake: NativeTravelIntake; let memoryBasis: [NativeTravelMemoryReference]
}
struct NativeTravelIntakeReceipt: Decodable {
    let version: Int; let kind: String; let conversationId: String; let goalId: String; let messageId: String
    let messageSequence: Int; let goalVersion: Int; let intakeRevision: Int
    let contextDigest: String?; let reused: Bool; let current: Bool; let readyForProvider: Bool
    static func decode(_ bytes: Data) throws -> Self {
        guard bytes.count <= 10_000, let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let current = root["current"] as? Bool else { throw NativeDataError.invalidResponse }
        let keys = Set(["version", "kind", "conversationId", "goalId", "messageId", "messageSequence", "goalVersion", "intakeRevision", "reused", "current", "readyForProvider"] + (current ? ["contextDigest"] : []))
        guard Set(root.keys) == keys else { throw NativeDataError.invalidResponse }
        let value = try JSONDecoder().decode(Self.self, from: bytes)
        guard value.version == 5, value.kind == "accepted", !value.readyForProvider,
              [value.conversationId, value.goalId, value.messageId].allSatisfy({ UUID(uuidString: $0) != nil }),
              (1...10_000).contains(value.goalVersion), (1...1_000_000).contains(value.messageSequence),
              (1...1_000).contains(value.intakeRevision) else { throw NativeDataError.invalidResponse }
        if current { guard let digest = value.contextDigest, digest.count == 64, digest.allSatisfy({ "0123456789abcdef".contains($0) }) else { throw NativeDataError.invalidResponse } }
        return value
    }
    func matches(_ r: NativeTravelIntakeSubmission) -> Bool {
        version == 5 && kind == "accepted" && conversationId == r.conversationId && goalId == r.goalId
        && messageId == r.messageId && messageSequence > 0 && goalVersion == r.expectedGoalVersion + (r.relationship == "amendment" ? 1 : 0)
        && intakeRevision == r.expectedIntakeRevision + 1 && !readyForProvider
    }
}

 enum NativeTravelIntakeRead {
    case current(NativeTravelIntakeBasis)
    case unavailable(String)
    static func decode(_ bytes: Data) throws -> Self {
        guard bytes.count <= 32_000, let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeDataError.invalidResponse }
        if root["kind"] as? String == "unavailable" {
            guard Set(root.keys) == Set(["version", "kind", "reason", "readyForProvider"]),
                  root["version"] as? Int == 5, root["readyForProvider"] as? Bool == false,
                  let reason = root["reason"] as? String, ["intake_unrecorded", "stale_basis"].contains(reason) else { throw NativeDataError.invalidResponse }
            return .unavailable(reason)
        }
        return .current(try NativeTravelIntakeBasis.decode(bytes))
    }
}

struct NativeTravelIntakeWriteBasis: Decodable {
    let version: Int; let kind: String; let conversationId: String; let goalId: String
    let goalVersion: Int; let parentMessageId: String; let messageSequence: Int
    let intakeRevision: Int; let policyId: String; let readyForProvider: Bool
    var correctionLimit: NativeTravelIntakeCorrectionLimit? {
        if intakeRevision == 1_000 { return .intakeRevision }
        if messageSequence == 1_000_000 { return .messageSequence }
        return nil
    }
    static func decode(_ bytes: Data) throws -> Self {
        guard bytes.count <= 10_000, let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(root.keys) == Set(["version", "kind", "conversationId", "goalId", "goalVersion", "parentMessageId", "messageSequence", "intakeRevision", "policyId", "readyForProvider"]) else { throw NativeDataError.invalidResponse }
        let value = try JSONDecoder().decode(Self.self, from: bytes)
        guard value.version == 5, value.kind == "travel_intake_write_basis", !value.readyForProvider,
              [value.conversationId, value.goalId, value.parentMessageId, value.policyId].allSatisfy({ UUID(uuidString: $0) != nil }),
              (1...9_999).contains(value.goalVersion), (1...1_000_000).contains(value.messageSequence), (0...1_000).contains(value.intakeRevision) else { throw NativeDataError.invalidResponse }
        return value
    }
    func matches(_ target: NativeTravelIntakeSelection) -> Bool {
        target.canCorrect && conversationId == target.conversationID && goalId == target.goalID
        && goalVersion == target.goalVersion && parentMessageId == target.parentMessageID && policyId == target.policyID
    }
}

/// The supported currencies all have two fractional digits. No floating-point conversion.
enum NativeTravelBudgetAmount {
    static func minorUnits(_ text: String) -> Int? {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count), !parts[0].isEmpty,
              parts.allSatisfy({ $0.utf8.allSatisfy { (48...57).contains($0) } }) else { return nil }
        if parts.count == 2 && !(1...2).contains(parts[1].utf8.count) { return nil }
        var whole = 0
        for byte in parts[0].utf8 {
            let digit = Int(byte) - 48
            guard whole <= (100_000 - digit) / 10 else { return nil }
            whole = whole * 10 + digit
        }
        let fraction = parts.count == 2 ? Array(parts[1].utf8) : []
        let cents = fraction.isEmpty ? 0 : (Int(fraction[0]) - 48) * 10 + (fraction.count == 2 ? Int(fraction[1]) - 48 : 0)
        let amount = whole * 100 + cents
        return (1...10_000_000).contains(amount) ? amount : nil
    }
    static func display(_ minorUnits: Int) -> String? {
        guard (1...10_000_000).contains(minorUnits) else { return nil }
        let cents = String(minorUnits % 100)
        return String(minorUnits / 100) + "." + (cents.count == 1 ? "0" + cents : cents)
    }
}
