import Foundation
import CoreFoundation

// Fixed consumer wire: e72ac95d. No free text, health text, provider payload or Trip writer.
enum NativeRecoveryReport: String, CaseIterable, Codable, Identifiable {
    case fatigue, delay, closure, highRiskUnwell = "high_risk_unwell"
    var id: String { rawValue }
    func label(chinese: Bool) -> String {
        switch self {
        case .fatigue: chinese ? "走不动／疲劳" : "Too tired to continue"
        case .delay: chinese ? "晚点" : "Delayed"
        case .closure: chinese ? "我报告地点关闭" : "I report a closure"
        case .highRiskUnwell: chinese ? "严重不适，需要求助" : "Seriously unwell; need help"
        }
    }
}

struct NativeRecoveryBinding: Codable, Equatable {
    let referenceId: String
    let revision: Int
    let dayId: String
    let itemId: String
}

struct NativeRecoveryInput: Codable, Equatable {
    struct Report: Codable, Equatable { let source: String; let kind: NativeRecoveryReport; let observedAt: String }
    let operationId: String
    let expectedHeadVersion: Int
    let dayId: String
    let selectedItemIds: [String]
    let fixedItemIds: [String]
    let reservationBindings: [NativeRecoveryBinding]
    let report: Report
    let locale: String
    func validate() throws {
        guard NativeRecoveryWire.uuid(operationId), (0...999999999).contains(expectedHeadVersion),
              NativeRecoveryWire.item(dayId), (1...8).contains(selectedItemIds.count), fixedItemIds.count <= 64,
              selectedItemIds.allSatisfy(NativeRecoveryWire.item), fixedItemIds.allSatisfy(NativeRecoveryWire.item),
              Set(selectedItemIds).count == selectedItemIds.count, Set(fixedItemIds).count == fixedItemIds.count,
              Set(selectedItemIds).isDisjoint(with: fixedItemIds), reservationBindings.count <= 100,
              Set(reservationBindings.map(\.referenceId)).count == reservationBindings.count,
              Set(reservationBindings.map { $0.dayId + "/" + $0.itemId }).count == reservationBindings.count,
              reservationBindings.allSatisfy({ NativeRecoveryWire.uuid($0.referenceId) && (1...999999999).contains($0.revision)
                  && NativeRecoveryWire.item($0.dayId) && NativeRecoveryWire.item($0.itemId) && !selectedItemIds.contains($0.itemId) }),
              report.source == "user_report", NativeRecoveryWire.date(report.observedAt) != nil,
              ["zh", "en"].contains(locale) else { throw NativeDataError.invalidResponse }
    }
    func body() throws -> Data {
        try validate()
        return try NativeRecoveryWire.encode(["operation": "preview", "input": try NativeRecoveryWire.object(self)])
    }
}

struct NativeRecoverySelection: Codable, Equatable {
    let operationId: String
    let contextId: String
    let contextDigest: String
    let candidateId: String
    func validate() throws {
        guard NativeRecoveryWire.uuid(operationId), NativeRecoveryWire.uuid(contextId), NativeRecoveryWire.hash(contextDigest),
              ["omit_one", "omit_selected"].contains(candidateId) else { throw NativeDataError.invalidResponse }
    }
    func body() throws -> Data {
        try validate()
        return try NativeRecoveryWire.encode(["operation": "select", "input": try NativeRecoveryWire.object(self)])
    }
}

struct NativeRecoveryCandidate: Decodable, Identifiable {
    let candidateId: String
    let disposition: String
    let action: String
    let omittedItemIds: [String]
    let patch: NativeTripPatch
    let dayDiffs: [NativeTripPending.Proposal.DayDiff]
    struct Feasibility: Decodable {
        struct Line: Decodable { let itemId: String?; let constraint: String; let status: String; let reason: String }
        let status: String
        // Messages are displayed only when present in this fixed assembler wire.
        let lines: [Line]
    }
    let feasibility: Feasibility
    let fixedItemIds: [String]
    let unchangedItemIds: [String]
    let label: String
    var id: String { candidateId }
}

struct NativeRecoveryPreview: Decodable {
    struct ReservationBasis: Decodable {
        let referenceId: String; let revision: Int; let contentDigest: String; let status: String; let evidenceTier: String
    }
    struct Preference: Decodable {
        let travelPace: String?
        let updatedAt: String?
        let status: String
        let influence: String
        let explicitInputPriority: String
    }
    struct Official: Decodable { let status: String; let reason: String }
    let kind: String
    let tripId: String?
    let baseVersion: Int
    let report: NativeRecoveryInput.Report
    let status: String
    let reason: String?
    let contextId: String?
    let contextDigest: String?
    let expiresAt: String?
    let reservationBasis: [ReservationBasis]?
    let candidates: [NativeRecoveryCandidate]
    let preferenceContext: Preference
    let sourceSemantics: String
    let tripMutation: String
    let externalOutcome: String
    let nextStep: String
    let officialChannel: Official
    let needsManualVerification: [String]

    func validate(input: NativeRecoveryInput, detail: NativeTripDetail, now: Date) throws {
        guard kind == "local_recovery/1", tripId == detail.trip.id, baseVersion == input.expectedHeadVersion,
              report == input.report, sourceSemantics == "user_report", tripMutation == "none", externalOutcome == "unknown",
              officialChannel.status == "unavailable", officialChannel.reason == "NO_QUALIFIED_OFFICIAL_CHANNEL",
              preferenceContext.influence == "soft_reference_only", preferenceContext.explicitInputPriority == "current_explicit_input",
              ["unknown", "current"].contains(preferenceContext.status),
              preferenceContext.travelPace == nil || ["relaxed", "balanced", "packed"].contains(preferenceContext.travelPace!),
              preferenceContext.updatedAt == nil || NativeRecoveryWire.date(preferenceContext.updatedAt!) != nil,
              Set(needsManualVerification) == Set(["ONWARD_ROUTE", "OPENING", "RESERVATION", "EXTERNAL_CANCELLATION_REFUND"])
        else { throw NativeDataError.invalidResponse }
        if status == "pending" {
            guard candidates.isEmpty, reason != nil else { throw NativeDataError.invalidResponse }; return
        }
        guard status == "candidates", input.report.kind != .highRiskUnwell, (1...2).contains(candidates.count),
              Set(candidates.map(\.id)).count == candidates.count, let contextId, NativeRecoveryWire.uuid(contextId),
              let contextDigest, NativeRecoveryWire.hash(contextDigest), let expiresAt,
              let expiry = NativeRecoveryWire.date(expiresAt), let observed = NativeRecoveryWire.date(input.report.observedAt),
              observed <= now, expiry > now, expiry <= observed.addingTimeInterval(300), reason == nil,
              detail.confirmationState == "confirmed", detail.trip.headVersion == input.expectedHeadVersion,
              let day = detail.content.days.first(where: { $0.id == input.dayId }),
              input.selectedItemIds.allSatisfy({ id in day.items.contains(where: { $0.id == id }) }) else { throw NativeDataError.invalidResponse }
        let all = detail.content.days.flatMap(\.items)
        guard let reservationBasis, reservationBasis.count <= 100,
              Set(reservationBasis.map(\.referenceId)).count == reservationBasis.count,
              reservationBasis.allSatisfy({ NativeRecoveryWire.uuid($0.referenceId) && (1...999999999).contains($0.revision)
                  && NativeRecoveryWire.hash($0.contentDigest) && ["reserved", "amended", "cancelled"].contains($0.status)
                  && ["user_reported", "artifact_confirmed", "provider_verified"].contains($0.evidenceTier) }),
              reservationBasis.filter({ ["reserved", "amended"].contains($0.status) }).allSatisfy({ ref in
                  input.reservationBindings.contains(where: { $0.referenceId == ref.referenceId && $0.revision == ref.revision })
              }),
              input.reservationBindings.allSatisfy({ binding in reservationBasis.contains(where: { $0.referenceId == binding.referenceId && $0.revision == binding.revision })
                  && detail.content.days.contains(where: { $0.id == binding.dayId && $0.items.contains(where: { $0.id == binding.itemId }) }) })
        else { throw NativeDataError.invalidResponse }
        let fixed = Set(input.fixedItemIds + input.reservationBindings.map(\.itemId))
        for candidate in candidates {
            let expected = candidate.id == "omit_one" ? Array(input.selectedItemIds.prefix(1)) : input.selectedItemIds
            guard ["omit_one", "omit_selected"].contains(candidate.id), candidate.disposition == "candidate_only",
                  candidate.action == "omit_explicit_optional_items", candidate.omittedItemIds == expected,
                  candidate.patch.expectedVersion == input.expectedHeadVersion,
                  candidate.patch.operations == expected.map({ NativeTripOperation(kind: .deleteItem, dayId: input.dayId, itemId: $0) }),
                  fixed == Set(candidate.fixedItemIds), Set(expected).isDisjoint(with: fixed),
                  candidate.fixedItemIds.count == fixed.count,
                  Set(candidate.unchangedItemIds) == Set(all.filter { !expected.contains($0.id) }.map(\.id)),
                  candidate.unchangedItemIds.count == all.count - expected.count,
                  ["pending", "feasible"].contains(candidate.feasibility.status), candidate.label.utf16.count <= 256,
                  candidate.feasibility.lines.count <= 5000,
                  candidate.dayDiffs.count == 1, candidate.dayDiffs[0].kind == "changed", candidate.dayDiffs[0].dayId == day.id,
                  candidate.dayDiffs[0].date == day.date, candidate.dayDiffs[0].items.count == expected.count,
                  Set(candidate.dayDiffs[0].items.map(\.itemId)) == Set(expected),
                  candidate.dayDiffs[0].items.allSatisfy({ diff in diff.kind == "removed" && day.items.contains(where: { $0.id == diff.itemId && $0.title == diff.title }) })
            else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeRecoveryReceipt: Codable, Equatable {
    let kind: String; let operationId: String; let contextId: String; let contextDigest: String; let candidateId: String
    let proposalId: String; let proposalRevision: Int; let baseVersion: Int; let expiresAt: String; let reused: Bool
    var identity: String { "\(operationId)|\(contextId)|\(contextDigest)|\(candidateId)|\(proposalId)|\(proposalRevision)|\(baseVersion)|\(expiresAt)" }
}
struct NativeRecoveryOperation: Decodable {
    let kind: String; let operationId: String; let tripId: String; let input: NativeRecoverySelection
    let receipt: NativeRecoveryReceipt; let state: String; let resultingVersion: Int?
    func validate(selection: NativeRecoverySelection, tripID: String, baseVersion: Int) throws {
        try selection.validate()
        guard kind == "local_recovery_operation/1", operationId == selection.operationId, self.tripId == tripID,
              input == selection, receipt.kind == "local_recovery_proposal/1", receipt.operationId == selection.operationId,
              receipt.contextId == selection.contextId, receipt.contextDigest == selection.contextDigest,
              receipt.candidateId == selection.candidateId, NativeRecoveryWire.uuid(receipt.proposalId),
              (1...999999999).contains(receipt.proposalRevision), receipt.baseVersion == baseVersion,
              NativeRecoveryWire.date(receipt.expiresAt) != nil, ["pending", "applied", "rejected", "expired", "stale"].contains(state),
              state == "applied" ? resultingVersion == baseVersion + 1 : resultingVersion == nil
        else { throw NativeDataError.invalidResponse }
    }
}
struct NativeRecoveryOutcome: Decodable {
    let kind: String; let operation: NativeRecoveryOperation; let proposal: NativeTripPending.Proposal?
    let tripMutation: String
    var proposalReference: String? { proposal.map { "\($0.id):\($0.revision):\($0.digest)" } }
    func validate(pending: NativeRecoveryPending, now: Date) throws {
        let selection = try pending.selection()
        try operation.validate(selection: selection, tripID: pending.tripID, baseVersion: pending.baseVersion)
        if let original = pending.originalReceipt {
            guard original.identity == operation.receipt.identity else { throw NativeDataError.invalidResponse }
        }
        if operation.state == "pending" {
            let r = operation.receipt
            guard kind == "local_recovery_selected/1", tripMutation == "none", let p = proposal, !p.stale,
                  p.status == "pending", p.id == r.proposalId, p.revision == r.proposalRevision,
                  p.baseTripVersion == r.baseVersion, NativeRecoveryWire.hash(p.digest),
                  NativeRecoveryWire.date(p.expiresAt) == NativeRecoveryWire.date(r.expiresAt),
                  NativeRecoveryWire.date(p.expiresAt).map({ $0 > now }) == true,
                  p.patch == pending.expectedPatch, p.titleDiff.before == p.titleDiff.after
            else { throw NativeDataError.invalidResponse }
            if let digest = pending.originalProposalDigest, p.digest != digest { throw NativeDataError.invalidResponse }
        } else {
            guard kind == "local_recovery_recovered/1", proposal == nil,
                  tripMutation == (operation.state == "applied" ? "original_proposal_applied" : "none")
            else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeRecoveryReservation: Identifiable {
    let id: String; let revision: Int; let title: String; let status: String; let evidenceTier: String
    let startsAt: String?; let endsAt: String?
}

enum NativeRecoveryWire {
    static func uuid(_ s: String) -> Bool { UUID(uuidString: s) != nil && s == s.lowercased() }
    static func hash(_ s: String) -> Bool { s.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil }
    static func item(_ s: String) -> Bool { s.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil }
    static func date(_ s: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }; f.formatOptions = [.withInternetDateTime]; return f.date(from: s)
    }
    static func integer(_ v: Any?) -> Int? {
        guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
              n.doubleValue.rounded() == n.doubleValue, (0...999999999).contains(n.doubleValue) else { return nil }
        return n.intValue
    }
    static func boolean(_ v: Any?) -> Bool? {
        guard let n = v as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }; return n.boolValue
    }
    static func exact(_ v: Any, _ keys: [String]) throws -> [String: Any] {
        guard let row = v as? [String: Any], Set(row.keys) == Set(keys) else { throw NativeDataError.invalidResponse }; return row
    }
    static func encode(_ value: [String: Any]) throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard data.count <= 24576 else { throw NativeDataError.invalidResponse }; return data
    }
    static func object<T: Encodable>(_ value: T) throws -> [String: Any] {
        guard let result = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any]
        else { throw NativeDataError.invalidResponse }; return result
    }
    static func root(_ data: Data) throws -> [String: Any] {
        guard data.count <= 512000 else { throw NativeDataError.invalidResponse }
        let root = try exact(JSONSerialization.jsonObject(with: data), ["data"])
        guard let value = root["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }; return value
    }
    static func decode<T: Decodable>(_ type: T.Type, _ object: [String: Any]) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: object))
    }
}
