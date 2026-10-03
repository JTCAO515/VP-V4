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
struct NativePlanRouteRequest:Encodable,Equatable {
    let fromItemId:String;let toItemId:String;let mode:String;let departure:String;let mapConsent:Bool
    var valid:Bool{NativeTripSupportTarget.item(fromItemId) && NativeTripSupportTarget.item(toItemId) && fromItemId != toItemId && ["walking","transit","driving"].contains(mode) && departure=="now" && mapConsent}
}
struct NativePlanFeasibilityTarget:Equatable {
    let actor:NativeDataScope;let tripId:String;let proposalId:String;let proposalRevision:Int;let baseVersion:Int;let proposalDigest:String
    var valid:Bool {NativeMemoryWire.uuid(tripId) && NativeMemoryWire.uuid(proposalId) && (1...999_999_999).contains(proposalRevision) && (0...999_999_999).contains(baseVersion) && NativeQualifiedDelegationRPC.digest(proposalDigest)}
    init(actor:NativeDataScope,pending:NativeTripPending){self.actor=actor;tripId=pending.trip.id;proposalId=pending.proposal.id;proposalRevision=pending.proposal.revision;baseVersion=pending.proposal.baseTripVersion;proposalDigest=pending.proposal.digest}
}
struct NativePlanFeasibilityRequest:Encodable {
    let proposalId:String;let expectedProposalRevision:Int;let expectedBaseVersion:Int;let needs:NativePlanNeeds;let placeChoices:[NativePlanPlaceChoice];let routeRequests:[NativePlanRouteRequest]?
    init(target:NativePlanFeasibilityTarget,needs:NativePlanNeeds,choices:[NativePlanPlaceChoice],route:NativePlanRouteRequest?=nil) throws {
        guard target.valid,needs.valid,choices.count<=40,choices.allSatisfy(\.valid),Set(choices.map(\.itemId)).count==choices.count else{throw NativeDataError.invalidResponse}
        if let route{guard route.valid,choices.contains(where:{$0.itemId==route.fromItemId}),choices.contains(where:{$0.itemId==route.toItemId}) else{throw NativeDataError.invalidResponse}}
        routeRequests=route.map{[$0]}
        proposalId=target.proposalId;expectedProposalRevision=target.proposalRevision;expectedBaseVersion=target.baseVersion;self.needs=needs;placeChoices=choices.sorted{$0.itemId<$1.itemId}
    }
}
struct NativePlanPreferences:Decodable {
    let kind:String;let status:String;let travelPace:String?;let currency:String?;let defaultDepartureTime:String?;let updatedAt:String?;let influence:String;let explicitInputPriority:String;let hints:[String]
    func valid(explicitCurrency:String?)->Bool {
        guard kind=="profile_preference_context/1",influence=="soft_reference_only",explicitInputPriority=="current_explicit_input" else{return false}
        if status=="unknown" || status=="unavailable"{return travelPace==nil && currency==nil && defaultDepartureTime==nil && updatedAt==nil && hints.isEmpty}
        guard status=="current",let pace=travelPace,["relaxed","balanced","packed"].contains(pace),let currency,["CNY","USD","EUR","RUB","SAR"].contains(currency),defaultDepartureTime?.range(of:#"^([01]\d|2[0-3]):[0-5]\d$"#,options:.regularExpression) != nil,updatedAt.flatMap(NativeKnowledgeRead.date) != nil,hints.count==3,hints[0]=="PROFILE_PACE_"+pace.uppercased()+"_SOFT_REFERENCE",hints[2]=="PROFILE_DEPARTURE_REFERENCE_ONLY" else{return false}
        if let explicitCurrency{return hints[1]==(explicitCurrency==currency ? "EXPLICIT_CURRENCY_MATCHES_PROFILE":"EXPLICIT_CURRENCY_OVERRIDES_PROFILE")}
        return ["EXPLICIT_CURRENCY_MATCHES_PROFILE","EXPLICIT_CURRENCY_OVERRIDES_PROFILE"].contains(hints[1])
    }
}
struct NativePlanFeasibilityRead:Decodable {
    struct Basis:Decodable {let tripId:String;let proposalId:String;let proposalRevision:Int;let baseVersion:Int;let proposalDigest:String}
    struct Line:Decodable {let itemId:String?;let constraint:String;let status:String;let reason:String}
    struct Evidence:Decodable,Identifiable {
        struct Fact:Decodable{let factId:String;let version:Int;let expiresAt:String}
        let kind:String?;let itemId:String?;let placeReferenceId:String?;let mappingId:String?;let mappingVersion:Int?;let sourceDigest:String?;let contextDigest:String?;let claimType:String?;let facts:[Fact]?
        let fromItemId:String?;let toItemId:String?;let originCanonicalPoiId:String?;let destinationCanonicalPoiId:String?;let provider:String?;let mode:String?;let departure:String?;let actualDeparture:String?;let timeBinding:String?;let observedAt:String?;let expiresAt:String?
        var isRoute:Bool{kind=="route_observation"}
        var id:String{isRoute ? "route:\(fromItemId ?? ""):\(toItemId ?? "")":"place:\(itemId ?? "")"}
        var live:Bool{isRoute ? expiresAt.flatMap(NativeKnowledgeRead.date).map{$0>Date()}==true:(facts?.allSatisfy{NativeKnowledgeRead.date($0.expiresAt).map{$0>Date()}==true} ?? false)}
    }
    struct Missing:Decodable,Equatable{let itemId:String?;let constraint:String;let reason:String}
    struct Decision:Decodable{let dayId:String;let itemId:String;let startsAt:String?;let endsAt:String?;let disposition:String}
    let kind:String;let basis:Basis;let status:String;let lines:[Line];let evidenceBasis:[Evidence];let missingEvidence:[Missing];let userDecisions:[Decision];let scheduleChanges:String;let proposalMutation:String;let needsBasis:String;let preferenceContext:NativePlanPreferences?
    static func decode(_ bytes:Data,target:NativePlanFeasibilityTarget,choices:[NativePlanPlaceChoice]=[],route:NativePlanRouteRequest?=nil,explicitCurrency:String?=nil,after:NativeTripContent?=nil) throws -> Self? {
        guard target.valid,bytes.count<=262_144,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any] else{throw NativeDataError.invalidResponse}
        if raw["kind"] as? String=="unavailable"{guard Set(raw.keys)==Set(["kind","reason"]),["STALE_BASIS","STALE_EVIDENCE"].contains(raw["reason"] as? String ?? "") else{throw NativeDataError.invalidResponse};return nil}
        let keys=Set(["kind","basis","status","lines","evidenceBasis","missingEvidence","userDecisions","scheduleChanges","proposalMutation","needsBasis"])
        if let profile=raw["preferenceContext"]{guard let profile=profile as? [String:Any],Set(profile.keys)==Set(["kind","status","travelPace","currency","defaultDepartureTime","updatedAt","influence","explicitInputPriority","hints"]) else{throw NativeDataError.invalidResponse}}
        guard Set(raw.keys)==(raw["preferenceContext"]==nil ? keys:keys.union(["preferenceContext"])) ,let basis=raw["basis"] as? [String:Any],Set(basis.keys)==Set(["tripId","proposalId","proposalRevision","baseVersion","proposalDigest"]),let lines=raw["lines"] as? [[String:Any]],(1...2048).contains(lines.count),lines.allSatisfy({Set($0.keys)==Set(["itemId","constraint","status","reason"])}),
              let evidence=raw["evidenceBasis"] as? [[String:Any]],evidence.count<=41,evidence.allSatisfy({r in
                  if r["kind"] as? String=="route_observation"{return Set(r.keys)==Set(["kind","fromItemId","toItemId","originCanonicalPoiId","destinationCanonicalPoiId","provider","mode","departure","actualDeparture","timeBinding","observedAt","expiresAt"])}
                  guard Set(r.keys)==Set(["itemId","placeReferenceId","mappingId","mappingVersion","sourceDigest","contextDigest","claimType","facts"]),let facts=r["facts"] as? [[String:Any]],(1...8).contains(facts.count) else{return false};return facts.allSatisfy{Set($0.keys)==Set(["factId","version","expiresAt"])}}),
              let missing=raw["missingEvidence"] as? [[String:Any]],missing.count<=2048,missing.allSatisfy({Set($0.keys)==Set(["itemId","constraint","reason"])}),let decisions=raw["userDecisions"] as? [[String:Any]],decisions.count<=500,decisions.allSatisfy({Set($0.keys)==Set(["dayId","itemId","startsAt","endsAt","disposition"])}) else{throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="plan_feasibility/1",result.basis.tripId==target.tripId,result.basis.proposalId==target.proposalId,result.basis.proposalRevision==target.proposalRevision,result.basis.baseVersion==target.baseVersion,result.basis.proposalDigest==target.proposalDigest,result.scheduleChanges=="none",result.proposalMutation=="none",result.needsBasis=="current_explicit_input",result.preferenceContext?.valid(explicitCurrency:explicitCurrency) ?? true,
              result.lines.allSatisfy({line in (line.itemId==nil || NativeTripSupportTarget.item(line.itemId!)) && !line.constraint.isEmpty && line.constraint.utf8.count<=128 && !line.reason.isEmpty && line.reason.utf8.count<=256 && ["supported","pending","violated"].contains(line.status)}),
              result.missingEvidence==result.lines.filter{$0.status=="pending"}.map{Missing(itemId:$0.itemId,constraint:$0.constraint,reason:$0.reason)},
              Set(result.evidenceBasis.map(\.id)).count==evidence.count,result.evidenceBasis.allSatisfy({e in
                  if e.isRoute {
                      guard let route,route.valid,e.fromItemId==route.fromItemId,e.toItemId==route.toItemId,e.mode==route.mode,e.provider=="amap",e.departure=="now",e.originCanonicalPoiId.map(NativeMemoryWire.uuid)==true,e.destinationCanonicalPoiId.map(NativeMemoryWire.uuid)==true,e.originCanonicalPoiId != e.destinationCanonicalPoiId,["exact","reference_only"].contains(e.timeBinding ?? ""),let observed=e.observedAt.flatMap(NativeKnowledgeRead.date),let expires=e.expiresAt.flatMap(NativeKnowledgeRead.date),observed<=Date(),Date().timeIntervalSince(observed)<=300,expires>Date(),let actual=e.actualDeparture.flatMap(NativeKnowledgeRead.date),actual<=Date(),Date().timeIntervalSince(actual)<=300 else{return false}
                      return e.timeBinding != "exact" || e.actualDeparture==e.observedAt
                  }
                  return choices.contains{$0.itemId==e.itemId && $0.placeReferenceId==e.placeReferenceId && $0.mappingId==e.mappingId && $0.expectedMappingVersion==e.mappingVersion} && e.sourceDigest.map(NativeQualifiedDelegationRPC.digest)==true && e.contextDigest.map(NativeQualifiedDelegationRPC.digest)==true && ["address","time_window"].contains(e.claimType ?? "") && e.facts?.allSatisfy{NativeMemoryWire.uuid($0.factId) && (1...9_007_199_254_740_991).contains($0.version) && NativeKnowledgeRead.date($0.expiresAt).map{$0>Date()}==true}==true
              }),Set(result.userDecisions.map(\.itemId)).count==decisions.count,result.userDecisions.allSatisfy({d in NativeTripSupportTarget.item(d.dayId) && NativeTripSupportTarget.item(d.itemId) && d.disposition=="preserved" && (d.startsAt?.utf8.count ?? 0)<=128 && (d.endsAt?.utf8.count ?? 0)<=128}) else{throw NativeDataError.invalidResponse}
        if let after {
            let original=after.days.flatMap{day in day.items.map{(day.id,$0)}}
            guard original.count==decisions.count,result.userDecisions.allSatisfy({d in original.contains{$0.0==d.dayId && $0.1.id==d.itemId && $0.1.startsAt==d.startsAt && $0.1.endsAt==d.endsAt}}) else{throw NativeDataError.invalidResponse}
        }
        for observation in result.evidenceBasis where observation.isRoute {
            guard result.userDecisions.contains(where:{$0.itemId==observation.fromItemId && $0.endsAt==observation.actualDeparture}),result.userDecisions.contains(where:{$0.itemId==observation.toItemId}) else{throw NativeDataError.invalidResponse}
            if observation.timeBinding=="reference_only" {
                guard !result.lines.contains(where:{$0.itemId==observation.toItemId && ["door_to_door_route","baggage_appointment_buffers","walking_limit"].contains($0.constraint) && $0.status != "pending"}) else{throw NativeDataError.invalidResponse}
            }
        }
        let actual=result.lines.contains{$0.status=="violated"} ? "infeasible":result.lines.contains{$0.status=="pending"} ? "pending":"feasible"
        guard result.status==actual else{throw NativeDataError.invalidResponse};return result
    }
}
