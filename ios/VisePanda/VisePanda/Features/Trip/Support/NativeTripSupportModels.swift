import Foundation

struct NativeTripSupportTarget: Hashable {
    let actor: NativeDataScope
    let tripID: String
    let tripVersion: Int
    let dayID: String
    let itemID: String
    var valid: Bool {
        NativeMemoryWire.uuid(tripID) && (0...999_999_999).contains(tripVersion) && Self.item(dayID) && Self.item(itemID)
    }
    static func item(_ value: String) -> Bool { value.range(of: #"^[A-Za-z0-9_-]{1,64}$"#, options: .regularExpression) != nil }
}
enum NativeTripSupportScope: String, Codable { case address = "address_reference", openingWindow = "opening_window_reference" }
enum NativeTripSupportStatus: String, Decodable { case current = "reference_current", recheck = "recheck_required", blocked, revoked }
enum NativeTripSupportApplicability: String, Decodable { case unverified, matched }

struct NativeTripSupportClaim: Decodable {
    struct Fact: Decodable {
        let kind: String
        let factId: String
        let version: Int
        let reviewedAt: String
        let expiresAt: String
    }
    struct Value: Decodable {
        let lines: [String]?
        let locality: String?
        let countryCode: String?
        let startsAt: String?
        let endsAt: String?
        let timeZone: String?
    }
    let claimType: String
    let subjectId: String
    let value: Value
    let asOf: String
    let evidence: [Fact]
    static func validate(_ object: Any, scope: NativeTripSupportScope, now: Date) throws {
        guard let raw=object as? [String:Any], Set(raw.keys)==Set(["claimType","subjectId","value","asOf","evidence"]),
              let fields=raw["value"] as? [String:Any], let refs=raw["evidence"] as? [[String:Any]], (1...8).contains(refs.count),
              refs.allSatisfy({ Set($0.keys)==Set(["kind","factId","version","reviewedAt","expiresAt"]) }) else { throw NativeDataError.invalidResponse }
        let claim=try JSONDecoder().decode(Self.self, from: JSONSerialization.data(withJSONObject: raw))
        guard !claim.subjectId.isEmpty, claim.subjectId.utf16.count<=512, NativeKnowledgeRead.date(claim.asOf) != nil,
              claim.evidence.allSatisfy({ $0.kind=="fact" && NativeMemoryWire.uuid($0.factId) && (1...999_999_999).contains($0.version) && $0.reviewedAt != $0.expiresAt && NativeKnowledgeRead.date($0.reviewedAt) != nil && NativeKnowledgeRead.date($0.expiresAt).map({ $0 > now }) == true }) else { throw NativeDataError.invalidResponse }
        switch scope {
        case .address:
            guard claim.claimType=="address", Set(fields.keys).isSubset(of: Set(["lines","locality","countryCode"])), Set(["lines","countryCode"]).isSubset(of: Set(fields.keys)),
                  let lines=claim.value.lines, (1...16).contains(lines.count), lines.allSatisfy({ !$0.isEmpty && $0.utf16.count<=2000 }),
                  let country=claim.value.countryCode, country.range(of: #"^[A-Z]{2}$"#, options: .regularExpression) != nil,
                  claim.value.locality.map({ $0.utf16.count<=2000 }) ?? true else { throw NativeDataError.invalidResponse }
        case .openingWindow:
            guard claim.claimType=="time_window", Set(fields.keys).isSubset(of: Set(["startsAt","endsAt","timeZone"])), Set(["startsAt","timeZone"]).isSubset(of: Set(fields.keys)),
                  let start=claim.value.startsAt.flatMap(NativeKnowledgeRead.date), let zone=claim.value.timeZone, TimeZone(identifier: zone) != nil,
                  claim.value.endsAt.map({ NativeKnowledgeRead.date($0).map({ $0 >= start }) ?? false }) ?? true else { throw NativeDataError.invalidResponse }
        }
    }
}
struct NativeTripSupportRead: Decodable {
    struct Entry: Decodable, Identifiable {
        var id: String { supportId }
        let supportId: String
        let receiptId: String
        let version: Int
        let scope: NativeTripSupportScope
        let applicability: NativeTripSupportApplicability
        let status: NativeTripSupportStatus
        let claimRevision: Int
        let payloadHash: String
        let sourceDigest: String
        let claim: NativeTripSupportClaim?
    }
    let kind: String
    let tripId: String
    let tripVersion: Int
    let dayId: String
    let itemId: String
    let entries: [Entry]
    static func decode(_ bytes: Data, target: NativeTripSupportTarget, now: Date = Date()) throws -> Self {
        guard target.valid, bytes.count<=131_072, let raw=try JSONSerialization.jsonObject(with: bytes) as? [String:Any],
              Set(raw.keys)==Set(["kind","tripId","tripVersion","dayId","itemId","entries"]), let entries=raw["entries"] as? [[String:Any]], entries.count<=8,
              entries.allSatisfy({ Set($0.keys)==Set(["supportId","receiptId","version","scope","applicability","status","claimRevision","payloadHash","sourceDigest","claim"]) }) else { throw NativeDataError.invalidResponse }
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="support", result.tripId==target.tripID, result.tripVersion==target.tripVersion, result.dayId==target.dayID, result.itemId==target.itemID,
              Set(result.entries.map(\.supportId)).count==entries.count, Set(result.entries.map(\.receiptId)).count==entries.count else { throw NativeDataError.invalidResponse }
        for (index, entry) in result.entries.enumerated() {
            guard NativeMemoryWire.uuid(entry.supportId), NativeMemoryWire.uuid(entry.receiptId), (1...999_999_999).contains(entry.version), (1...999_999_999).contains(entry.claimRevision),
                  NativeQualifiedDelegationRPC.digest(entry.payloadHash), NativeQualifiedDelegationRPC.digest(entry.sourceDigest) else { throw NativeDataError.invalidResponse }
            if entry.status == .current {
                try NativeTripSupportClaim.validate(entries[index]["claim"] as Any, scope:entry.scope,now:now)
            } else { guard entries[index]["claim"] is NSNull, entry.claim==nil else { throw NativeDataError.invalidResponse } }
        }
        return result
    }
}
struct NativePreparedTripSupport: Decodable, Identifiable {
    var id: String { receiptId }
    let kind: String
    let receiptId: String
    let version: Int
    let tripId: String
    let proposalId: String
    let proposalRevision: Int
    let baseVersion: Int
    let dayId: String
    let itemId: String
    let scope: NativeTripSupportScope
    let applicability: NativeTripSupportApplicability
    let claim: NativeTripSupportClaim
    let sourceDigest: String
    let expiresAt: String
    static func decode(_ bytes:Data, target:NativeTripSupportTarget, proposal:NativeTripPending.Proposal, now:Date=Date()) throws -> Self {
        guard target.valid, bytes.count<=131_072, let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any], Set(raw.keys)==Set(["kind","receiptId","version","tripId","proposalId","proposalRevision","baseVersion","dayId","itemId","scope","applicability","claim","sourceDigest","expiresAt"]) else { throw NativeDataError.invalidResponse }
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="prepared", NativeMemoryWire.uuid(result.receiptId), result.tripId==target.tripID, result.proposalId==proposal.id, result.proposalRevision==proposal.revision,
              result.baseVersion==target.tripVersion, result.baseVersion==proposal.baseTripVersion, result.dayId==target.dayID, result.itemId==target.itemID,
              (1...999_999_999).contains(result.version), NativeQualifiedDelegationRPC.digest(result.sourceDigest), NativeKnowledgeRead.date(result.expiresAt).map({ $0>now })==true else { throw NativeDataError.invalidResponse }
        try NativeTripSupportClaim.validate(raw["claim"] as Any, scope:result.scope,now:now)
        return result
    }
    var selection: NativeTripSupportChoice { .init(receiptId:receiptId,version:version,sourceDigest:sourceDigest) }
}
struct NativeTripSupportChoice: Codable, Equatable {
    let receiptId: String
    let version: Int
    let sourceDigest: String
}
