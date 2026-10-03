import Foundation

struct NativePlanNeeds:Encodable,Equatable {
    let partySize:Int
    let currency:String
    let maxBudgetMinor:Int?
    let minTransferMinutes:Int
    let baggageBufferMinutes:Int
    let appointmentBufferMinutes:Int
    let maxWalkingMinutes:Int?
    var valid:Bool {(1...20).contains(partySize) && currency.range(of:#"^[A-Z]{3}$"#,options:.regularExpression) != nil && (maxBudgetMinor.map{(0...100_000_000).contains($0)} ?? true) && [minTransferMinutes,baggageBufferMinutes,appointmentBufferMinutes].allSatisfy{(0...1440).contains($0)} && (maxWalkingMinutes.map{(0...1440).contains($0)} ?? true)}
    enum CodingKeys:String,CodingKey {case partySize,currency,maxBudgetMinor,minTransferMinutes,baggageBufferMinutes,appointmentBufferMinutes,maxWalkingMinutes}
    func encode(to encoder:Encoder)throws {
        var c=encoder.container(keyedBy:CodingKeys.self)
        try c.encode(partySize,forKey:.partySize);try c.encode(currency,forKey:.currency)
        if let maxBudgetMinor{try c.encode(maxBudgetMinor,forKey:.maxBudgetMinor)}else{try c.encodeNil(forKey:.maxBudgetMinor)}
        try c.encode(minTransferMinutes,forKey:.minTransferMinutes);try c.encode(baggageBufferMinutes,forKey:.baggageBufferMinutes);try c.encode(appointmentBufferMinutes,forKey:.appointmentBufferMinutes)
        if let maxWalkingMinutes{try c.encode(maxWalkingMinutes,forKey:.maxWalkingMinutes)}else{try c.encodeNil(forKey:.maxWalkingMinutes)}
    }
}
struct NativePlanPlaceChoice:Encodable,Equatable,Identifiable {
    var id:String{itemId}
    let dayId:String;let itemId:String;let placeReferenceId:String;let mappingId:String;let expectedMappingVersion:Int;let city:String;let scene:String;let locale:String
    var valid:Bool {NativeTripSupportTarget.item(dayId) && NativeTripSupportTarget.item(itemId) && NativeMemoryWire.uuid(placeReferenceId) && NativeMemoryWire.uuid(mappingId) && (1...9_007_199_254_740_991).contains(expectedMappingVersion) && ["shanghai","beijing","guangzhou","chongqing"].contains(city) && ["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"].contains(scene) && ["zh","en"].contains(locale)}
}
struct NativePlanFeasibilityTarget:Equatable {
    let actor:NativeDataScope;let tripId:String;let proposalId:String;let proposalRevision:Int;let baseVersion:Int;let proposalDigest:String
    var valid:Bool {NativeMemoryWire.uuid(tripId) && NativeMemoryWire.uuid(proposalId) && (1...999_999_999).contains(proposalRevision) && (0...999_999_999).contains(baseVersion) && NativeQualifiedDelegationRPC.digest(proposalDigest)}
    init(actor:NativeDataScope,pending:NativeTripPending){self.actor=actor;tripId=pending.trip.id;proposalId=pending.proposal.id;proposalRevision=pending.proposal.revision;baseVersion=pending.proposal.baseTripVersion;proposalDigest=pending.proposal.digest}
}
struct NativePlanFeasibilityRequest:Encodable {
    let proposalId:String;let expectedProposalRevision:Int;let expectedBaseVersion:Int;let needs:NativePlanNeeds;let placeChoices:[NativePlanPlaceChoice]
    init(target:NativePlanFeasibilityTarget,needs:NativePlanNeeds,choices:[NativePlanPlaceChoice]) throws {
        guard target.valid,needs.valid,choices.count<=40,choices.allSatisfy(\.valid),Set(choices.map(\.itemId)).count==choices.count else{throw NativeDataError.invalidResponse}
        proposalId=target.proposalId;expectedProposalRevision=target.proposalRevision;expectedBaseVersion=target.baseVersion;self.needs=needs;placeChoices=choices.sorted{$0.itemId<$1.itemId}
    }
}
struct NativePlanFeasibilityRead:Decodable {
    struct Basis:Decodable {let tripId:String;let proposalId:String;let proposalRevision:Int;let baseVersion:Int;let proposalDigest:String}
    struct Line:Decodable {let itemId:String?;let constraint:String;let status:String;let reason:String}
    struct Evidence:Decodable {struct Fact:Decodable{let factId:String;let version:Int;let expiresAt:String};let itemId:String;let placeReferenceId:String;let mappingId:String;let mappingVersion:Int;let sourceDigest:String;let contextDigest:String;let claimType:String;let facts:[Fact]}
    struct Missing:Decodable,Equatable{let itemId:String?;let constraint:String;let reason:String}
    struct Decision:Decodable{let dayId:String;let itemId:String;let startsAt:String?;let endsAt:String?;let disposition:String}
    let kind:String;let basis:Basis;let status:String;let lines:[Line];let evidenceBasis:[Evidence];let missingEvidence:[Missing];let userDecisions:[Decision];let scheduleChanges:String;let proposalMutation:String;let needsBasis:String
    static func decode(_ bytes:Data,target:NativePlanFeasibilityTarget,choices:[NativePlanPlaceChoice]=[],after:NativeTripContent?=nil) throws -> Self? {
        guard target.valid,bytes.count<=262_144,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any] else{throw NativeDataError.invalidResponse}
        if raw["kind"] as? String=="unavailable"{guard Set(raw.keys)==Set(["kind","reason"]),["STALE_BASIS","STALE_EVIDENCE"].contains(raw["reason"] as? String ?? "") else{throw NativeDataError.invalidResponse};return nil}
        guard Set(raw.keys)==Set(["kind","basis","status","lines","evidenceBasis","missingEvidence","userDecisions","scheduleChanges","proposalMutation","needsBasis"]),let basis=raw["basis"] as? [String:Any],Set(basis.keys)==Set(["tripId","proposalId","proposalRevision","baseVersion","proposalDigest"]),let lines=raw["lines"] as? [[String:Any]],(1...2048).contains(lines.count),lines.allSatisfy({Set($0.keys)==Set(["itemId","constraint","status","reason"])}),
              let evidence=raw["evidenceBasis"] as? [[String:Any]],evidence.count<=40,evidence.allSatisfy({r in guard Set(r.keys)==Set(["itemId","placeReferenceId","mappingId","mappingVersion","sourceDigest","contextDigest","claimType","facts"]),let facts=r["facts"] as? [[String:Any]],(1...8).contains(facts.count) else{return false};return facts.allSatisfy{Set($0.keys)==Set(["factId","version","expiresAt"])}}),
              let missing=raw["missingEvidence"] as? [[String:Any]],missing.count<=2048,missing.allSatisfy({Set($0.keys)==Set(["itemId","constraint","reason"])}),let decisions=raw["userDecisions"] as? [[String:Any]],decisions.count<=500,decisions.allSatisfy({Set($0.keys)==Set(["dayId","itemId","startsAt","endsAt","disposition"])}) else{throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="plan_feasibility/1",result.basis.tripId==target.tripId,result.basis.proposalId==target.proposalId,result.basis.proposalRevision==target.proposalRevision,result.basis.baseVersion==target.baseVersion,result.basis.proposalDigest==target.proposalDigest,result.scheduleChanges=="none",result.proposalMutation=="none",result.needsBasis=="current_explicit_input",
              result.lines.allSatisfy({line in (line.itemId==nil || NativeTripSupportTarget.item(line.itemId!)) && !line.constraint.isEmpty && line.constraint.utf8.count<=128 && !line.reason.isEmpty && line.reason.utf8.count<=256 && ["supported","pending","violated"].contains(line.status)}),
              result.missingEvidence==result.lines.filter{$0.status=="pending"}.map{Missing(itemId:$0.itemId,constraint:$0.constraint,reason:$0.reason)},
              Set(result.evidenceBasis.map(\.itemId)).count==evidence.count,result.evidenceBasis.allSatisfy({e in
                  choices.contains{$0.itemId==e.itemId && $0.placeReferenceId==e.placeReferenceId && $0.mappingId==e.mappingId && $0.expectedMappingVersion==e.mappingVersion} && NativeQualifiedDelegationRPC.digest(e.sourceDigest) && NativeQualifiedDelegationRPC.digest(e.contextDigest) && ["address","time_window"].contains(e.claimType) && e.facts.allSatisfy{NativeMemoryWire.uuid($0.factId) && (1...9_007_199_254_740_991).contains($0.version) && NativeKnowledgeRead.date($0.expiresAt).map{$0>Date()}==true}
              }),Set(result.userDecisions.map(\.itemId)).count==decisions.count,result.userDecisions.allSatisfy({d in NativeTripSupportTarget.item(d.dayId) && NativeTripSupportTarget.item(d.itemId) && d.disposition=="preserved" && (d.startsAt?.utf8.count ?? 0)<=128 && (d.endsAt?.utf8.count ?? 0)<=128}) else{throw NativeDataError.invalidResponse}
        if let after {
            let original=after.days.flatMap{day in day.items.map{(day.id,$0)}}
            guard original.count==decisions.count,result.userDecisions.allSatisfy({d in original.contains{$0.0==d.dayId && $0.1.id==d.itemId && $0.1.startsAt==d.startsAt && $0.1.endsAt==d.endsAt}}) else{throw NativeDataError.invalidResponse}
        }
        let actual=result.lines.contains{$0.status=="violated"} ? "infeasible":result.lines.contains{$0.status=="pending"} ? "pending":"feasible"
        guard result.status==actual else{throw NativeDataError.invalidResponse};return result
    }
}
