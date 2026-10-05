import Foundation
import Observation

/// Day/item IDs retain the confirmed Trip's opaque identity; only Trip IDs are UUIDs.
struct NativeTranslationTripSource: Codable, Equatable {
    let ownerId: String
    let tripId: String
    let headVersion: Int
    let dayId: String?
    let itemId: String?
    let field: String

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(ownerId, forKey: .ownerId); try values.encode(tripId, forKey: .tripId)
        try values.encode(headVersion, forKey: .headVersion); try values.encode(field, forKey: .field)
        if let dayId { try values.encode(dayId, forKey: .dayId) } else { try values.encodeNil(forKey: .dayId) }
        if let itemId { try values.encode(itemId, forKey: .itemId) } else { try values.encodeNil(forKey: .itemId) }
    }

    var valid: Bool {
        UUID(uuidString: tripId) != nil && headVersion > 0
        && UUID(uuidString: ownerId) != nil
        && [dayId, itemId].compactMap { $0 }.allSatisfy { $0.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil }
        && (field == "title" ? (dayId == nil && itemId == nil || dayId != nil && itemId != nil) : field == "date" && dayId != nil && itemId == nil)
    }
}

struct NativeTranslationTripSelection: Equatable {
    let scope: NativeDataScope
    let source: NativeTranslationTripSource
    let value: String

    func matches(scope current: NativeDataScope?, source: NativeTranslationTripSource, value: String) -> Bool {
        self.scope == current && self.scope.subject.lowercased() == source.ownerId.lowercased() && self.source == source && self.value.utf8.elementsEqual(value.utf8)
    }
}

struct NativeTranslationTripCandidate: Decodable, Identifiable {
    let tripId: String
    let title: String
    let headVersion: Int
    var id: String { tripId }
}

struct NativeTranslationTripField: Decodable, Equatable, Identifiable {
    let dayId: String?
    let itemId: String?
    let field: String
    let value: String
    var id: String { [dayId ?? "", itemId ?? "", field].map { "\($0.utf8.count):\($0)" }.joined() }
}

struct NativeTranslationTripCatalog: Decodable {
    let version: Int
    let kind: String
    let ownerId: String
    let currentTripId: String?
    let trips: [NativeTranslationTripCandidate]
}

struct NativeTranslationTripRead: Decodable {
    let version: Int
    let kind: String
    let ownerId: String
    let tripId: String
    let headVersion: Int
    let title: String
    let fields: [NativeTranslationTripField]

    func source(_ field: NativeTranslationTripField) -> NativeTranslationTripSource {
        .init(ownerId: ownerId, tripId: tripId, headVersion: headVersion, dayId: field.dayId, itemId: field.itemId, field: field.field)
    }
}

/// Read-only selector. No Trip mutation, automatic selection, Memory or persistent store.
@MainActor @Observable
final class NativeTranslationTripStore {
    private(set) var catalog: NativeTranslationTripCatalog?
    private(set) var detail: NativeTranslationTripRead?
    private(set) var busy = false
    private(set) var unavailable = false
    private var generation = UUID()
    private var scope: NativeDataScope?

    func clear() {
        generation = UUID(); catalog = nil; detail = nil; scope = nil; busy = false; unavailable = false
    }

    func load(scope: NativeDataScope?, tripID: String? = nil, expectedVersion: Int? = nil,
              currentScope: () -> NativeDataScope?, request: NativeTranslationStore.Request) async -> Bool {
        clear(); self.scope = scope
        guard let scope, currentScope() == scope, tripID == nil || UUID(uuidString: tripID!) != nil else { unavailable = true; return false }
        let own = generation
        busy = true
        defer { if generation == own { busy = false } }
        do {
            let path = "api/translate/trip-sources" + (tripID.map { "/" + $0.lowercased() } ?? "")
            let bytes = try await request(path, "GET", nil)
            guard own == generation, currentScope() == scope, !Task.isCancelled, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            if let tripID {
                let read = try JSONDecoder().decode(NativeTranslationTripRead.self, from: bytes)
                guard read.version == 1, read.kind == "trip_source", read.ownerId.lowercased() == scope.subject.lowercased(),
                      read.tripId.lowercased() == tripID.lowercased(), read.headVersion > 0,
                      expectedVersion == nil || read.headVersion == expectedVersion,
                      read.fields.count <= 512, Set(read.fields.map(\.id)).count == read.fields.count,
                      read.fields.allSatisfy({ read.source($0).valid && !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.value.utf16.count <= 600 }) else { throw NativeDataError.invalidResponse }
                detail = read
            } else {
                let read = try JSONDecoder().decode(NativeTranslationTripCatalog.self, from: bytes)
                guard read.version == 1, read.kind == "trip_sources", read.ownerId.lowercased() == scope.subject.lowercased(),
                      read.trips.count <= 20, Set(read.trips.map(\.id)).count == read.trips.count,
                      read.trips.allSatisfy({ UUID(uuidString: $0.tripId) != nil && $0.headVersion > 0 }),
                      read.currentTripId == nil || read.trips.contains(where: { $0.tripId == read.currentTripId }) else { throw NativeDataError.invalidResponse }
                catalog = read
            }
            return true
        } catch {
            if generation == own { catalog = nil; detail = nil; unavailable = true }
            return false
        }
    }

    func revalidate(_ selection: NativeTranslationTripSelection, currentScope: () -> NativeDataScope?,
                    request: NativeTranslationStore.Request) async -> Bool {
        guard await load(scope: selection.scope, tripID: selection.source.tripId, expectedVersion: selection.source.headVersion,
                         currentScope: currentScope, request: request), let detail else { return false }
        return detail.fields.contains { selection.matches(scope: currentScope(), source: detail.source($0), value: $0.value) }
    }
}

struct NativeTranslationSubmission: Encodable, Equatable {
    let threadId: String
    let turnId: String
    let idempotencyKey: String
    let policyId: String
    let sourceLocale: String
    let targetLocale: String
    let text: String
    var tripSource: NativeTranslationTripSource? = nil
}

struct NativeTranslationPhrase: Decodable, Identifiable, Equatable {
    let turnId: String
    let sourceLocale: String
    let targetLocale: String
    let original: String
    let state: String
    let translation: String?
    let backTranslation: String?
    var id: String { turnId }
    var valid: Bool {
        UUID(uuidString: turnId) != nil && ["zh", "en"].contains(sourceLocale)
        && ["zh", "en"].contains(targetLocale) && sourceLocale != targetLocale
        && !original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && original.utf16.count <= 600
        && ["pending", "cancelled", "unavailable", "needs_review", "translated"].contains(state)
        && (state == "translated"
            ? [translation, backTranslation].allSatisfy { value in
                guard let value else { return false }
                return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf16.count <= 2400
            }
            : translation == nil && backTranslation == nil)
    }
}
private struct NativeTranslationHistory: Decodable {
    let version: Int
    let kind: String
    let phrases: [NativeTranslationPhrase]
}

/// Only the active actor's last server-read phrases are kept in memory. No private
/// history is used as model context; loading saved results never requests a model.
@MainActor @Observable
final class NativeTranslationStore {
    typealias Request = (_ path: String, _ method: String, _ body: Data?) async throws -> Data
    private(set) var scope: NativeDataScope?
    private(set) var policy: NativeTextPolicy?
    private(set) var phrases: [NativeTranslationPhrase] = []
    private(set) var pending: NativeTranslationSubmission?
    private(set) var busy = false
    private(set) var errorCode: String?
    private var generation = UUID()
    private var pendingNotice: String?

    func clear() {
        generation = UUID(); scope = nil; policy = nil; phrases = []; pending = nil
        pendingNotice = nil; busy = false; errorCode = nil
    }

    func load(scope: NativeDataScope?, request: Request) async {
        if self.scope != scope { clear(); self.scope = scope }
        guard scope != nil, !busy else { return }
        let own = generation
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        do { try await refresh(own: own, request: request) }
        catch { failed(error, own: own) }
    }

    func consent(accept: Bool, request: Request) async {
        guard scope != nil, !busy, let policy else { return }
        let own = generation
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        // Hide cached text immediately when the user withdraws its governing consent.
        if !accept { phrases = []; pending = nil; pendingNotice = nil; self.policy = nil }
        do {
            let body = accept ? ["policyId": policy.id, "noticeHash": policy.noticeHash] : ["policyId": policy.id]
            _ = try await request("api/translate/consent", accept ? "POST" : "DELETE", JSONEncoder().encode(body))
            try await refresh(own: own, request: request)
        } catch { failed(error, own: own) }
    }

    func submit(text: String, sourceLocale: String, tripSelection: NativeTranslationTripSelection? = nil, request: Request) async {
        guard scope != nil, !busy, let policy, policy.valid, policy.consentState == .accepted,
              ["zh", "en"].contains(sourceLocale), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 600 else { return }
        guard tripSelection == nil || (tripSelection!.source.valid && tripSelection!.matches(scope: scope, source: tripSelection!.source, value: text)) else {
            errorCode = "TRIP_SOURCE_CHANGED"; return
        }
        let own = generation
        let submission = pending ?? NativeTranslationSubmission(threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(),
            idempotencyKey: UUID().uuidString.lowercased(), policyId: policy.id, sourceLocale: sourceLocale,
            targetLocale: sourceLocale == "zh" ? "en" : "zh", text: text, tripSource: tripSelection?.source)
        guard submission.text == text, submission.sourceLocale == sourceLocale, submission.policyId == policy.id,
              submission.tripSource == tripSelection?.source,
              pending == nil || pendingNotice == policy.noticeHash else { errorCode = "PENDING_REQUEST"; return }
        pending = submission; pendingNotice = policy.noticeHash
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        do {
            let data = try await request("api/translate", "POST", JSONEncoder().encode(submission))
            try check(own)
            let accepted = try JSONDecoder().decode(NativeTextAccepted.self, from: data)
            guard accepted.version == 1, accepted.kind == "accepted", accepted.turnId == submission.turnId else { throw NativeDataError.invalidResponse }
            try await refresh(own: own, request: request)
        } catch { failed(error, own: own) }
    }

    func cancel(request: Request) async {
        guard scope != nil, !busy, let pending else { return }
        let own = generation
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        do {
            _ = try await request("api/translate/turns/\(pending.turnId)/cancel", "POST", Data("{}".utf8))
            try check(own)
            self.pending = nil; pendingNotice = nil
            try await refresh(own: own, request: request)
        } catch { failed(error, own: own) }
    }

    private func refresh(own: UUID, request: Request) async throws {
        let data = try await request("api/translate/policy", "GET", nil)
        try check(own)
        let reply = try JSONDecoder().decode(NativeTextPolicyReply.self, from: data)
        guard reply.version == 1, reply.kind == "policy", reply.policy.valid else { throw NativeDataError.invalidResponse }
        if policy?.id != reply.policy.id || policy?.noticeHash != reply.policy.noticeHash { phrases = [] }
        policy = reply.policy
        if let pending, pending.policyId != reply.policy.id || pendingNotice != reply.policy.noticeHash {
            self.pending = nil; pendingNotice = nil
        }
        guard reply.policy.consentState == .accepted else { phrases = []; pending = nil; pendingNotice = nil; return }
        let historyData = try await request("api/translate", "GET", nil)
        try check(own)
        let history = try JSONDecoder().decode(NativeTranslationHistory.self, from: historyData)
        guard history.version == 1, history.kind == "translations", history.phrases.count <= 20,
              history.phrases.allSatisfy(\.valid), Set(history.phrases.map(\.id)).count == history.phrases.count else { throw NativeDataError.invalidResponse }
        phrases = history.phrases
        if let pending, let phrase = phrases.first(where: { $0.id == pending.turnId }), phrase.state != "pending" {
            self.pending = nil; pendingNotice = nil
        }
    }
    private func check(_ own: UUID) throws {
        guard own == generation, !Task.isCancelled else { throw CancellationError() }
    }
    private func failed(_ error: Error, own: UUID) {
        guard own == generation, !Task.isCancelled else { return }
        if case NativeDataError.server(let code) = error {
            errorCode = code
            if code == "INVALID_INPUT" { pending = nil; pendingNotice = nil }
            if ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED", "FORBIDDEN"].contains(code) { policy = nil; phrases = []; pending = nil; pendingNotice = nil }
        } else { errorCode = "PROVIDER_UNAVAILABLE" }
    }
}

struct NativeSavedTranslationReference: Identifiable {
    let phrase: NativeTranslationPhrase
    let policyID: String
    let noticeHash: String
    let scope: NativeDataScope
    let deadline: TimeInterval
    let query: String?
    var id: String { phrase.id }
    init(phrase: NativeTranslationPhrase, policyID: String, noticeHash: String, scope: NativeDataScope, deadline: TimeInterval, query: String? = nil) {
        self.phrase = phrase; self.policyID = policyID; self.noticeHash = noticeHash; self.scope = scope; self.deadline = deadline; self.query = query
    }
}

enum NativeTranslationHistoryWire {
    // Mirrors the documented server wire cap, including JSON escape overhead.
    static let maximumResponseBytes = 1_000_000
    static let maximumQueryUnits = 120
    static let maximumCursorCharacters = 1200
    static func sameQuery(_ lhs: String?, _ rhs: String?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil): true
        case (.some(let lhs), .some(let rhs)): lhs.utf8.elementsEqual(rhs.utf8)
        default: false
        }
    }
    static func cursorTurn(_ value: String, query: String?) -> String? {
        guard let query else { return UUID(uuidString: value) == nil ? nil : value }
        guard value.hasPrefix("q1."), value.utf8.count <= maximumCursorCharacters else { return nil }
        let encoded = String(value.dropFirst(3))
        guard !encoded.isEmpty, encoded.utf8.allSatisfy({ (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95 }) else { return nil }
        let padded = encoded.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            + String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let bytes = Data(base64Encoded: padded), let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: String],
              object.count == 2, let turn = object["turnId"], UUID(uuidString: turn) != nil,
              sameQuery(object["query"], query), query.utf16.count <= maximumQueryUnits else { return nil }
        return turn
    }
}

private struct NativeSavedTranslationReply: Decodable {
    let version: Int
    let kind: String
    let policyId: String?
    let phrases: [NativeTranslationPhrase]?
    let nextCursor: String?
    let phrase: NativeTranslationPhrase?
    let query: String?
}

/// Opt-in v2 reader; keeps one page and fresh exact content, never model context.
@MainActor @Observable
final class NativeSavedTranslationHistoryStore {
    typealias Read = (_ cursor: String?, _ turnID: String?) async throws -> Data
    private(set) var scope: NativeDataScope?
    private(set) var phrases: [NativeTranslationPhrase] = []
    private(set) var nextCursor: String?
    private(set) var opened: NativeTranslationPhrase?
    private(set) var state = "idle"
    private(set) var query: String?
    private var policyID: String?
    private var noticeHash: String?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func clear() {
        generation = UUID(); scope = nil; phrases = []; nextCursor = nil; opened = nil
        policyID = nil; noticeHash = nil; deadline = 0; state = "idle"; query = nil
    }
    func isCurrent(_ requested: NativeDataScope?, query requestedQuery: String? = nil) -> Bool {
        requested != nil && scope == requested && state == "ready" && uptime() < deadline && NativeTranslationHistoryWire.sameQuery(query, requestedQuery)
    }
    func reference(_ phrase: NativeTranslationPhrase, scope requested: NativeDataScope?, query requestedQuery: String? = nil) -> NativeSavedTranslationReference? {
        guard isCurrent(requested, query: requestedQuery), phrases.contains(phrase), let scope, let policyID, let noticeHash else { return nil }
        return .init(phrase: phrase, policyID: policyID, noticeHash: noticeHash, scope: scope, deadline: deadline, query: query)
    }
    func load(scope requested: NativeDataScope?, query requestedQuery: String? = nil, cursor: String? = nil, exact: NativeSavedTranslationReference? = nil,
              currentScope: () -> NativeDataScope?, policyRequest: NativeTranslationStore.Request, read: Read) async {
        let previousPolicy = policyID, previousNotice = noticeHash
        if let cursor {
            guard exact == nil, isCurrent(requested, query: requestedQuery), cursor == nextCursor else { clear(); state = "unavailable"; return }
        }
        clear()
        guard requestedQuery == nil || (requestedQuery?.utf16.count ?? 0) <= NativeTranslationHistoryWire.maximumQueryUnits,
              let requested, requested == currentScope(), !Task.isCancelled,
              exact == nil || (exact?.scope == requested && uptime() < (exact?.deadline ?? 0)) else { return }
        let own = generation, started = uptime()
        scope = requested; query = exact?.query ?? requestedQuery; state = "loading"
        func current() -> Bool { generation == own && requested == currentScope() && !Task.isCancelled && uptime() - started < 20 }
        do {
            let policyData = try await policyRequest("api/translate/policy", "GET", nil)
            guard current() else { throw NativeDataError.staleSessionResponse }
            let first = try JSONDecoder().decode(NativeTextPolicyReply.self, from: policyData)
            guard first.version == 1, first.kind == "policy", first.policy.valid, first.policy.consentState == .accepted,
                  cursor == nil || (first.policy.id == previousPolicy && first.policy.noticeHash == previousNotice),
                  exact == nil || (first.policy.id == exact?.policyID && first.policy.noticeHash == exact?.noticeHash) else { throw NativeDataError.invalidResponse }
            let data = try await read(cursor, exact?.id)
            guard current(), data.count <= NativeTranslationHistoryWire.maximumResponseBytes else { throw NativeDataError.staleSessionResponse }
            let reply = try JSONDecoder().decode(NativeSavedTranslationReply.self, from: data)
            guard reply.version == 2, reply.policyId == first.policy.id,
                  NativeTranslationHistoryWire.sameQuery(reply.query, exact == nil ? requestedQuery : nil) else { throw NativeDataError.invalidResponse }
            let rows: [NativeTranslationPhrase]
            if let exact {
                guard reply.kind == "translation", let phrase = reply.phrase, phrase == exact.phrase,
                      phrase.valid, phrase.state == "translated", reply.phrases == nil, reply.nextCursor == nil else { throw NativeDataError.invalidResponse }
                rows = [phrase]
            } else {
                guard reply.kind == "translations", let phrases = reply.phrases, phrases.count <= 20,
                      phrases.allSatisfy({ $0.valid && $0.state == "translated" }),
                      Set(phrases.map(\.id)).count == phrases.count,
                      reply.phrase == nil,
                      reply.nextCursor == nil || (phrases.count == 20 && NativeTranslationHistoryWire.cursorTurn(reply.nextCursor ?? "", query: requestedQuery) == phrases.last?.id),
                      reply.nextCursor == nil || reply.nextCursor != cursor else { throw NativeDataError.invalidResponse }
                rows = phrases
            }
            let finalData = try await policyRequest("api/translate/policy", "GET", nil)
            guard current() else { throw NativeDataError.staleSessionResponse }
            let last = try JSONDecoder().decode(NativeTextPolicyReply.self, from: finalData)
            guard last.version == 1, last.kind == "policy", last.policy.valid, last.policy.consentState == .accepted,
                  last.policy.id == first.policy.id, last.policy.noticeHash == first.policy.noticeHash else { throw NativeDataError.invalidResponse }
            policyID = first.policy.id; noticeHash = first.policy.noticeHash; deadline = started + 20
            if exact != nil { opened = rows.first } else { phrases = rows; nextCursor = reply.nextCursor }
            state = "ready"
        } catch {
            guard generation == own, !Task.isCancelled else { return }
            phrases = []; nextCursor = nil; opened = nil; deadline = 0; state = "unavailable"
        }
    }
}
