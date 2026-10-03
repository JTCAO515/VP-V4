import Foundation
import CoreFoundation

/// Inert content union. It never carries patches, HTML, URLs, or confirmation instructions.
enum NativeFiveResultContent {
    struct Draft {
        let title:String; let summary:String; let version:Int; let tripTitle:String; let days:[NativeTripDay]
        let sourceKind:String; let sourceID:String; let sourceRevision:Int?
    }
    struct Decision { let title:String;let summary:String;let comparison:NativeSelectedSources.Artifact;let state:String;let chosenOptionID:String? }
    struct Translation {let sourceTurnID:String;let sourceLocale:String;let targetLocale:String;let translation:String;let backTranslation:String}
    case comparison(NativeResultContent)
    case proposal(id:String,revision:Int)
    case journey(Draft)
    case decision(Decision)
    case practical(Translation)
    static func text(_ value:Any?,max:Int)->String? {guard let s=value as? String,!s.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,s.utf16.count<=max,!s.unicodeScalars.contains(where:{$0.value<32 && ![9,10,13].contains($0.value)}) else{return nil};return s}
    static func integer(_ value:Any?,minimum:Int=1,maximum:Int=2_147_483_647)->Int? {guard let n=value as? NSNumber,CFGetTypeID(n) != CFBooleanGetTypeID(),n.doubleValue.isFinite,n.doubleValue.rounded()==n.doubleValue,n.doubleValue>=Double(minimum),n.doubleValue<=Double(maximum) else{return nil};return n.intValue}
    static func decode(_ r:[String:Any]) throws ->Self {
        guard let schema=r["schemaVersion"] as? String,let actions=r["actions"] as? [Any],actions.isEmpty else{throw NativeDataError.invalidResponse}
        func exact(_ keys:[String])->Bool{Set(r.keys)==Set(keys)}
        if schema=="comparison/1" {
            guard exact(["schemaVersion","title","summary","options","actions"]) else{throw NativeDataError.invalidResponse}
            let content=try JSONDecoder().decode(NativeResultContent.self,from:JSONSerialization.data(withJSONObject:r))
            guard text(r["title"],max:120) != nil,text(r["summary"],max:1000) != nil,
                  let options=r["options"] as? [[String:Any]],options.allSatisfy({Set($0.keys)==Set(["id","title","tradeoff"]) && text($0["id"],max:40) != nil && text($0["title"],max:120) != nil && text($0["tradeoff"],max:500) != nil}),content.valid,content.options?.allSatisfy({$0.id.range(of:"^[a-z0-9_-]+$",options:.regularExpression) != nil})==true else{throw NativeDataError.invalidResponse};return .comparison(content)
        }
        if schema=="change-proposal-reference/1" {
            guard exact(["schemaVersion","proposalId","proposalRevision","actions"]),let id=r["proposalId"] as? String,UUID(uuidString:id) != nil,let revision=integer(r["proposalRevision"]) else{throw NativeDataError.invalidResponse};return .proposal(id:id,revision:revision)
        }
        if schema=="practical/1" {
            guard exact(["schemaVersion","kind","sourceTurnId","sourceLocale","targetLocale","translation","backTranslation","actions"]),r["kind"] as? String=="translation",
                  let id=r["sourceTurnId"] as? String,UUID(uuidString:id) != nil,let source=r["sourceLocale"] as? String,let target=r["targetLocale"] as? String,
                  ["zh","en"].contains(source),["zh","en"].contains(target),source != target,let translation=text(r["translation"],max:2400),let back=text(r["backTranslation"],max:2400) else{throw NativeDataError.invalidResponse}
            return .practical(.init(sourceTurnID:id,sourceLocale:source,targetLocale:target,translation:translation,backTranslation:back))
        }
        guard let title=text(r["title"],max:120),let summary=text(r["summary"],max:1000) else{throw NativeDataError.invalidResponse}
        if schema=="decision/1" {
            guard exact(["schemaVersion","title","summary","comparisonRef","state","chosenOptionId","actions"]),let reference=r["comparisonRef"] as? [String:Any],Set(reference.keys)==Set(["artifactId","revision"]),
                  let id=reference["artifactId"] as? String,UUID(uuidString:id) != nil,let revision=integer(reference["revision"]),let state=r["state"] as? String else{throw NativeDataError.invalidResponse}
            let choice=r["chosenOptionId"] as? String
            guard state=="pending" && r["chosenOptionId"] is NSNull || state=="chosen" && text(choice,max:40)?.range(of:"^[a-z0-9_-]+$",options:.regularExpression) != nil else{throw NativeDataError.invalidResponse}
            return .decision(.init(title:title,summary:summary,comparison:.init(artifactId:id,revision:revision),state:state,chosenOptionID:choice))
        }
        if schema=="journey-draft/1" {
            guard exact(["schemaVersion","title","summary","draft","source","actions"]),let draft=r["draft"] as? [String:Any],Set(draft.keys)==Set(["version","title","days"]),
                  let version=integer(draft["version"],minimum:0),let tripTitle=text(draft["title"],max:160),let rawDays=draft["days"] as? [[String:Any]],rawDays.count<=30,
                  let source=r["source"] as? [String:Any],let kind=source["kind"] as? String else{throw NativeDataError.invalidResponse}
            let sourceID:String,sourceRevision:Int?
            switch kind {
            case "task_output":guard Set(source.keys)==Set(["kind","taskTurnId"]),let id=source["taskTurnId"] as? String,UUID(uuidString:id) != nil else{throw NativeDataError.invalidResponse};sourceID=id;sourceRevision=nil
            case "trip_snapshot":guard Set(source.keys)==Set(["kind","tripId","tripVersion"]),let id=source["tripId"] as? String,UUID(uuidString:id) != nil,let rev=integer(source["tripVersion"],minimum:0),rev==version else{throw NativeDataError.invalidResponse};sourceID=id;sourceRevision=rev
            case "proposal_preview":guard Set(source.keys)==Set(["kind","proposalId","proposalRevision"]),let id=source["proposalId"] as? String,UUID(uuidString:id) != nil,let rev=integer(source["proposalRevision"]) else{throw NativeDataError.invalidResponse};sourceID=id;sourceRevision=rev
            default:throw NativeDataError.invalidResponse
            }
            var days:[NativeTripDay]=[];var itemIDs=Set<String>()
            for d in rawDays {
                guard Set(d.keys).isSubset(of:["id","date","timeZone","items"]),let id=text(d["id"],max:64),id.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil,let date=text(d["date"],max:10),NativeTravelIntake.validDates(.init(startDate:date,endDate:date)),
                      let items=d["items"] as? [[String:Any]] ?? (d["items"]==nil ? []:nil),items.count<=50 else{throw NativeDataError.invalidResponse}
                var decoded:[NativeTripItem]=[]
                for i in items {
                    guard Set(i.keys).isSubset(of:["id","dayId","title","startsAt","endsAt"]),let itemID=text(i["id"],max:64),itemID.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil,itemIDs.insert(itemID).inserted,i["dayId"] as? String==id,let name=text(i["title"],max:160) else{throw NativeDataError.invalidResponse}
                    for key in ["startsAt","endsAt"] {if let value=i[key] {guard let s=value as? String,s.range(of:#"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$"#,options:.regularExpression) != nil,NativeKnowledgeRead.date(s) != nil else{throw NativeDataError.invalidResponse}}}
                    if let start=i["startsAt"] as? String,let end=i["endsAt"] as? String {guard NativeKnowledgeRead.date(end)!>NativeKnowledgeRead.date(start)! else{throw NativeDataError.invalidResponse}}
                    decoded.append(.init(id:itemID,dayId:id,title:name,startsAt:i["startsAt"] as? String,endsAt:i["endsAt"] as? String))
                }
                guard Set(decoded.map(\.id)).count==decoded.count,d["timeZone"]==nil || (d["timeZone"] as? String).map({$0.utf16.count<=64 && $0.range(of:"^[A-Za-z_+-]+(/[A-Za-z_+-]+)+$",options:.regularExpression) != nil})==true else{throw NativeDataError.invalidResponse}
                days.append(.init(id:id,date:date,timeZone:d["timeZone"] as? String,items:decoded))
            }
            guard Set(days.map(\.id)).count==days.count,Set(days.map(\.date)).count==days.count else{throw NativeDataError.invalidResponse}
            return .journey(.init(title:title,summary:summary,version:version,tripTitle:tripTitle,days:days,sourceKind:kind,sourceID:sourceID,sourceRevision:sourceRevision))
        }
        throw NativeDataError.invalidResponse
    }
}
struct NativeFiveResultRecord {
    let artifactID:String;let revision:Int;let current:Bool;let source:NativeResultSource;let content:NativeFiveResultContent
    let memories:[NativeTravelMemoryReference];let evidence:[Evidence]
    struct Evidence {let factID:String;let assertionID:String;let revision:Int;let city:String;let scene:String}
    static func decode(_ data:Data,artifactID:String,revision:Int)throws->Self? {
        guard data.count<=100_000,let envelope=try JSONSerialization.jsonObject(with:data) as? [String:Any],Set(envelope.keys)==Set(["version","data"]),envelope["version"] as? Int==2,let r=envelope["data"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        if ["empty","unavailable"].contains(r["kind"] as? String ?? "") {guard Set(r.keys)==Set(["kind"]) else{throw NativeDataError.invalidResponse};return nil}
        guard Set(r.keys)==Set(["kind","artifactId","revision","currentRevision","current","historicalReadable","lifecycle","source","basis","content","createdAt"]),r["kind"] as? String=="result_artifact",
              r["artifactId"] as? String==artifactID,r["revision"] as? Int==revision,(1...1000).contains(revision),(r["currentRevision"] as? Int).map({(revision...1000).contains($0)})==true,r["historicalReadable"] as? Bool==true,
              let current=r["current"] as? Bool,(!current || r["currentRevision"] as? Int==revision),r["lifecycle"] as? String=="active",let source=r["source"] as? [String:Any],let basis=r["basis"] as? [String:Any],Set(basis.keys)==Set(["memories","evidence"]),
              let memories=basis["memories"] as? [[String:Any]],memories.count<=20,let evidence=basis["evidence"] as? [[String:Any]],evidence.count<=20,
              let content=r["content"] as? [String:Any],let created=r["createdAt"] as? String,NativeKnowledgeRead.date(created) != nil else{throw NativeDataError.invalidResponse}
        let origin=try JSONDecoder().decode(NativeResultSource.self,from:JSONSerialization.data(withJSONObject:source));guard origin.complete else{throw NativeDataError.invalidResponse}
        let refs=try memories.map { m -> NativeTravelMemoryReference in guard Set(m.keys)==Set(["id","revision"]),let id=m["id"] as? String,UUID(uuidString:id) != nil,let rev=NativeFiveResultContent.integer(m["revision"],maximum:9_007_199_254_740_991) else{throw NativeDataError.invalidResponse};return .init(id:id,revision:rev) }
        let facts=try evidence.map { e -> Evidence in
            guard Set(e.keys)==Set(["factId","assertionId","assertionRevision","city","scene"]),let id=e["factId"] as? String,UUID(uuidString:id) != nil,let assertion=e["assertionId"] as? String,UUID(uuidString:assertion) != nil,
                  let rev=NativeFiveResultContent.integer(e["assertionRevision"]),let city=e["city"] as? String,["shanghai","beijing","guangzhou","chongqing"].contains(city),let scene=e["scene"] as? String,
                  ["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"].contains(scene) else{throw NativeDataError.invalidResponse};return .init(factID:id,assertionID:assertion,revision:rev,city:city,scene:scene)
        }
        return .init(artifactID:artifactID,revision:revision,current:current,source:origin,content:try NativeFiveResultContent.decode(content),memories:refs,evidence:facts)
    }
}

struct NativeFiveResultReference {
    let artifactID:String;let revision:Int
    static func decode(_ data:Data,field:String,expectedID:String)throws->Self?{
        guard data.count<=12_000,let e=try JSONSerialization.jsonObject(with:data) as? [String:Any],Set(e.keys)==Set(["version","data"]),e["version"] as? Int==2,let r=e["data"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        if ["empty","unavailable"].contains(r["kind"] as? String ?? ""){guard Set(r.keys)==Set(["kind"]) else{throw NativeDataError.invalidResponse};return nil}
        guard ["taskId","tripId"].contains(field),Set(r.keys)==Set(["kind","artifactId","revision",field]),r["kind"] as? String=="result_reference",r[field] as? String==expectedID,
              let id=r["artifactId"] as? String,UUID(uuidString:id) != nil,let revision=r["revision"] as? Int,(1...1000).contains(revision) else{throw NativeDataError.invalidResponse}
        return .init(artifactID:id,revision:revision)
    }
}
struct NativeDecisionChoice:Encodable,Equatable {
    let artifactId:String;let expectedRevision:Int;let operationId:String;let optionId:String
}

/// Reject unknown result kinds in the v2 index before projecting legacy row fields.
enum NativeFiveResultSearch {
    static func validate(_ bytes:Data)throws {
        guard let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["version","data"]),root["version"] as? Int==2,let page=root["data"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        if page["kind"] as? String=="unavailable" {guard Set(page.keys)==Set(["kind"]) else{throw NativeDataError.invalidResponse};return}
        guard Set(page.keys)==Set(["kind","results","nextCursor"]),page["kind"] as? String=="result_search",let rows=page["results"] as? [[String:Any]] else{throw NativeDataError.invalidResponse}
        let schemas=["comparison/1","change-proposal-reference/1","journey-draft/1","decision/1","practical/1"]
        guard rows.allSatisfy({Set($0.keys)==Set(["artifactId","revision","schemaVersion","title","summary","tripId","tripVersion"]) && schemas.contains($0["schemaVersion"] as? String ?? "")}) else{throw NativeDataError.invalidResponse}
    }
}
