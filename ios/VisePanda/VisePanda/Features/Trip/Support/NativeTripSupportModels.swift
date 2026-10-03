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

struct NativeTripSupportPrepareRequest: Codable {
    let operationId: String
    let placeReferenceId: String
    let dayId: String
    let itemId: String
    let proposalId: String
    let expectedProposalRevision: Int
    let expectedBaseVersion: Int
    let expectedProposalDigest: String
    let expectedItemDigest: String
    let mappingId: String
    let expectedMappingVersion: Int
    let expectedMappingDigest: String
    let city: String
    let scene: String
    let locale: String
    let scope: NativeTripSupportScope
    let expectedClaimRevision: Int
    let expectedPayloadHash: String
    let expectedSourceDigest: String
    var valid: Bool {
        [operationId,placeReferenceId,proposalId,mappingId].allSatisfy(NativeMemoryWire.uuid) &&
        [expectedProposalDigest,expectedItemDigest,expectedMappingDigest,expectedPayloadHash,expectedSourceDigest].allSatisfy(NativeQualifiedDelegationRPC.digest) &&
        NativeTripSupportTarget.item(dayId) && NativeTripSupportTarget.item(itemId) &&
        (1...2_147_483_647).contains(expectedProposalRevision) && (0...999_999_999).contains(expectedBaseVersion) &&
        (1...9_007_199_254_740_991).contains(expectedMappingVersion) && (1...2_147_483_647).contains(expectedClaimRevision) &&
        ["shanghai","beijing","guangzhou","chongqing"].contains(city) &&
        ["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"].contains(scene) && ["zh","en"].contains(locale)
    }
}
struct NativeTripSupportRenewRequest: Codable {
    let operationId: String
    let supportId: String
    let expectedVersion: Int
    let tripVersion: Int
    let dayId: String
    let itemId: String
    let mappingId: String
    let expectedMappingVersion: Int
    let expectedMappingDigest: String
    let expectedClaimRevision: Int
    let expectedPayloadHash: String
    let expectedSourceDigest: String
    var valid: Bool {
        [operationId,supportId,mappingId].allSatisfy(NativeMemoryWire.uuid) &&
        [expectedMappingDigest,expectedPayloadHash,expectedSourceDigest].allSatisfy(NativeQualifiedDelegationRPC.digest) &&
        NativeTripSupportTarget.item(dayId) && NativeTripSupportTarget.item(itemId) &&
        (1...9_007_199_254_740_991).contains(expectedVersion) && (0...999_999_999).contains(tripVersion) &&
        (1...9_007_199_254_740_991).contains(expectedMappingVersion) && (1...2_147_483_647).contains(expectedClaimRevision)
    }
}
struct NativeSupportedTripConfirmRequest: Codable, Equatable {
    let proposalId: String
    let idempotencyKey: String
    let digest: String
    let expectedProposalRevision: Int
    let expectedBaseVersion: Int
    let supportSelection: [NativeTripSupportChoice]
    var valid: Bool {
        NativeMemoryWire.uuid(proposalId) && NativeMemoryWire.uuid(idempotencyKey) && NativeQualifiedDelegationRPC.digest(digest) &&
        (1...2_147_483_647).contains(expectedProposalRevision) && (0...999_999_999).contains(expectedBaseVersion) &&
        (1...8).contains(supportSelection.count) && Set(supportSelection.map(\.receiptId)).count==supportSelection.count &&
        supportSelection.allSatisfy({ NativeMemoryWire.uuid($0.receiptId) && (1...9_007_199_254_740_991).contains($0.version) && NativeQualifiedDelegationRPC.digest($0.sourceDigest) })
    }
}
struct NativeSupportedTripConfirmReceipt: Decodable {
    struct Binding: Decodable {
        let supportId: String
        let receiptId: String
        let version: Int
        let status: NativeTripSupportStatus
    }
    let kind: String
    let outcome: String
    let tripId: String
    let proposalId: String
    let resultingVersion: Int
    let supports: [Binding]
    static func decode(_ bytes:Data,tripID:String,request:NativeSupportedTripConfirmRequest) throws -> Self {
        guard request.valid, bytes.count<=131_072, let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any], Set(raw.keys)==Set(["kind","outcome","tripId","proposalId","resultingVersion","supports"]),
              let supports=raw["supports"] as? [[String:Any]], supports.count==request.supportSelection.count,
              supports.allSatisfy({ Set($0.keys)==Set(["supportId","receiptId","version","status"]) }) else { throw NativeDataError.invalidResponse }
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="confirmed", ["applied","already_applied"].contains(result.outcome), result.tripId==tripID, result.proposalId==request.proposalId, result.resultingVersion==request.expectedBaseVersion+1,
              Set(result.supports.map(\.receiptId))==Set(request.supportSelection.map(\.receiptId)), Set(result.supports.map(\.supportId)).count==result.supports.count,
              result.supports.allSatisfy({ NativeMemoryWire.uuid($0.supportId) && NativeMemoryWire.uuid($0.receiptId) && (1...9_007_199_254_740_991).contains($0.version) }) else { throw NativeDataError.invalidResponse }
        return result
    }
}
struct NativeTripSupportRenewReceipt: Decodable {
    let kind: String
    let supportId: String
    let version: Int
    let receiptId: String
    static func decode(_ bytes:Data,request:NativeTripSupportRenewRequest) throws -> Self {
        guard request.valid, bytes.count<=4096, let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any], Set(raw.keys)==Set(["kind","supportId","version","receiptId"]) else { throw NativeDataError.invalidResponse }
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="renewed", result.supportId==request.supportId, result.version==request.expectedVersion+1, NativeMemoryWire.uuid(result.receiptId) else { throw NativeDataError.invalidResponse }
        return result
    }
}

struct NativeTripSupportConfirmJournal: Codable {
    let endpoint: String
    let owner: String
    let epoch: Int
    let tripID: String
    let body: Data
    func request() throws -> NativeSupportedTripConfirmRequest {
        guard NativeMemoryWire.uuid(owner),NativeMemoryWire.uuid(tripID),epoch>0,body.count<=65_536,
              let raw=try JSONSerialization.jsonObject(with:body) as? [String:Any],Set(raw.keys)==Set(["proposalId","idempotencyKey","digest","expectedProposalRevision","expectedBaseVersion","supportSelection"]),
              let choices=raw["supportSelection"] as? [[String:Any]],choices.allSatisfy({Set($0.keys)==Set(["receiptId","version","sourceDigest"])}) else { throw NativeDataError.invalidResponse }
        let request=try JSONDecoder().decode(NativeSupportedTripConfirmRequest.self,from:body)
        guard request.valid else { throw NativeDataError.invalidResponse }
        return request
    }
    func matches(_ actor:NativeDataScope) -> Bool { endpoint==actor.endpoint && owner==actor.subject && epoch==actor.mobileEpoch }
}
