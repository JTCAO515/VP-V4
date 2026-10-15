import Foundation

@main @MainActor struct Probe {
    static var count = 0
    static func check(_ value: @autoclosure () -> Bool, _ label: String) {
        count += 1; precondition(value(), label)
    }
    static func rejects(_ label: String, _ action: () throws -> Void) {
        count += 1
        do { try action(); preconditionFailure("Expected rejection: " + label) } catch {}
    }
    static func main() throws {
        let id = { (n: Int) in String(format: "%08d-1111-4111-8111-111111111111", n) }
        let actor = NativeDataScope(endpoint:"https://synthetic.invalid",subject:id(1),mobileEpoch:3,generation:1)
        let place = try NativePlaceActionIdentity(candidate:.init(provider:.amap,providerPoiId:"CASE-Sensitive",rawName:"Original source label",matchedCanonicalPoiId:id(2)))
        let target = NativePlaceActionSelection(scope:actor,place:place,tripId:id(3),baseVersion:4)
        let now = Date(timeIntervalSince1970:1_800_000_000)
        let context = NativePlaceActionContext(tripId:id(3),tripVersion:4,selection:place,mappingDigest:String(repeating:"a",count:64),contextDigest:String(repeating:"b",count:64),title:"Source original",days:[],saved:nil,sourceCandidatesStatus:"complete",evaluatedAt:now.addingTimeInterval(-1),expiresAt:now.addingTimeInterval(20))
        var reply: [String:Any] = ["kind":"place_ask_context","tripId":id(3),"tripVersion":4,"selection":NativePlaceActionWire.place(place),"mappingDigest":context.mappingDigest,"contextDigest":context.contextDigest,"referenceId":NSNull(),"selectedSources":["artifact":NSNull(),"trip":["tripId":id(3),"headVersion":4],"evidence":[]],"currentInput":NativePlaceActionWire.place(place),"readyForProvider":false,"purpose":"first_party_reference_only","expiresAt":ISO8601DateFormatter().string(from:now.addingTimeInterval(20)),"handoff":NSNull()]
        func capture(_ data:[String:Any]) throws -> NativeCanonicalPlaceAskCapture {
            try .decode(NativePlaceActionWire.bytes(data),context:context,target:target,locale:"en",started:100,now:now,uptime:101)
        }
        let selected = try capture(reply)
        check(selected.current(scope:actor,locale:"en",now:now,uptime:101),"valid selection")
        check(!selected.current(scope:actor,locale:"zh",now:now,uptime:101),"locale fence")
        check(!selected.current(scope:actor,locale:"en",now:now.addingTimeInterval(20),uptime:101),"wall expiry")
        check(!selected.current(scope:actor,locale:"en",now:now,uptime:131),"monotonic expiry")
        check(!selected.current(scope:actor,locale:"en",now:now,uptime:100),"uptime regression")
        check(!selected.current(scope:.init(endpoint:actor.endpoint,subject:actor.subject,mobileEpoch:3,generation:2),locale:"en",now:now,uptime:101),"scope generation")
        let invalid:[String:Any] = ["readyForProvider":true,"purpose":"guide_prompt_use","mappingDigest":String(repeating:"c",count:64),"contextDigest":String(repeating:"d",count:64),"tripVersion":true,"tripId":id(9),"referenceId":"bad","currentInput":[:],"selectedSources":["artifact":id(9),"trip":["tripId":id(3),"headVersion":4],"evidence":[]]]
        for (key,value) in invalid { var changed=reply;changed[key]=value; rejects(key) { _=try capture(changed) } }
        reply["expiresAt"]=ISO8601DateFormatter().string(from:now.addingTimeInterval(31))
        rejects("overlong source TTL") { _=try capture(reply) }
        let original = NativeTextSubmission(threadId:id(10),turnId:id(11),idempotencyKey:id(12),policyId:id(13),locale:"en",text:"  What time does it open?  ",serviceTask:.init(id:id(14),scopeVersion:1,relationship:"new_goal",parentTurnId:nil))
        let pending = try NativeCanonicalPlaceAskPending(originalTask:original,capture:selected)
        let restored = try NativeCanonicalPlaceAskPending.restoring(body:pending.body,scope:actor)
        check(pending.body == restored.body,"root exact whole bytes")
        check(pending.operationID == restored.operationID && pending.turnID == restored.turnID,"original IDs")
        let request = try NativePlaceActionWire.object(pending.body,maximum:24000)
        check((request["submission"] as? [String:Any])?["text"] as? String == original.text,"no text rewrite")
        check(Set(request.keys) == Set(["schemaVersion","submission","expectation"]),"closed request")
        let operation:[String:Any] = ["operationId":id(12),"scopeKind":"thread","scopeId":id(10),"messageId":NSNull(),"turnId":id(11)]
        let originalReceipt:[String:Any] = ["version":3,"kind":"accepted","turnId":id(11),"reused":false,"serviceTaskId":id(14),"scopeVersion":1,"relationship":"new_goal","parentTurnId":NSNull()]
        let binding:[String:Any] = ["turnId":id(11),"serviceTaskId":id(14),"goalId":NSNull(),"goalVersion":NSNull(),"requestDigest":pending.requestDigest,"expectation":selected.expectation.object]
        let accepted:[String:Any] = ["schemaVersion":"canonical-place-ask/1","kind":"accepted","operation":operation,"originalReceipt":originalReceipt,"binding":binding,"readyForProvider":false,"currentEligibilityRequiresRead":true]
        func decode(_ value:[String:Any]) throws -> NativeCanonicalPlaceAskResponse { try .decode(NativePlaceActionWire.bytes(value),pending:pending,expectedDigest:pending.requestDigest) }
        if case .accepted(_,let turn) = try decode(accepted) { check(turn==id(11),"original accepted Turn") } else { preconditionFailure() }
        for key in ["turnId","serviceTaskId","requestDigest"] {
            var wrong=binding;wrong[key]=key=="requestDigest" ? String(repeating:"e",count:64):id(19)
            var changed=accepted;changed["binding"]=wrong
            rejects("wrong binding " + key) { _=try decode(changed) }
        }
        var wrongOperation=operation;wrongOperation["operationId"]=id(18)
        var foreign=accepted;foreign["operation"]=wrongOperation
        rejects("foreign operation") { _=try decode(foreign) }
        let unknown:[String:Any] = ["schemaVersion":"canonical-place-ask/1","kind":"unknown","operation":operation,"readyForProvider":false]
        if case .unknown = try decode(unknown) { check(true,"unknown retained") } else { preconditionFailure() }
        var absent=unknown;absent["kind"]="not_submitted"
        if case .notSubmitted = try decode(absent) { check(true,"not found is not accepted") } else { preconditionFailure() }
        let recovered:[String:Any] = ["schemaVersion":"canonical-place-ask/1","kind":"recovered","operation":operation,"receipt":accepted,"current":["kind":"unavailable","reason":"source_unavailable"],"readyForProvider":false]
        if case .accepted = try decode(recovered) { check(true,"receipt metadata independent of current eligibility") } else { preconditionFailure() }
        let policy=NativeTextPolicy(id:id(13),provider:"qwen",recipient:"fixture",sourceRegion:"fixture",processingRegion:"fixture",storageRegion:"fixture",termsVersion:"fixture",noticeVersion:"fixture-notice",noticeHash:String(repeating:"f",count:64),noticeZh:"样例",noticeEn:"Fixture",retention:"retain_after_hide_v1",expiresAt:"2099-01-01T00:00:00Z",consentState:.accepted)
        let durable=try NativeCanonicalPlaceAskDurable(pending:pending,policy:policy)
        let saved=try JSONEncoder().encode(durable)
        let read=try JSONDecoder().decode(NativeCanonicalPlaceAskDurable.self,from:saved)
        check(read.body==pending.body && read.matches(actor),"Root restart original bytes")
        check(!read.matches(.init(endpoint:actor.endpoint,subject:id(19),mobileEpoch:3,generation:1)),"wrong owner")
        check(!read.matches(.init(endpoint:actor.endpoint,subject:actor.subject,mobileEpoch:4,generation:1)),"wrong epoch")
        check(!read.matches(.init(endpoint:"https://other.invalid",subject:actor.subject,mobileEpoch:3,generation:1)),"wrong endpoint")
        var corrupt=try NativePlaceActionWire.object(saved);corrupt["bodyDigest"]=String(repeating:"0",count:64)
        rejects("Root changed bytes") { _=try JSONDecoder().decode(NativeCanonicalPlaceAskDurable.self,from:NativePlaceActionWire.bytes(corrupt)) }
        corrupt=try NativePlaceActionWire.object(saved);corrupt["extra"]=true
        rejects("Root unknown key") { _=try JSONDecoder().decode(NativeCanonicalPlaceAskDurable.self,from:NativePlaceActionWire.bytes(corrupt)) }
        try pending.body.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
        if CommandLine.arguments.count > 2 {
            let fixture = try NativePlaceActionWire.object(Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])), maximum: 500_000)
            let raw = (fixture["requestBytes"] as! String).data(using: .utf8)!
            let sqlPending = try NativeCanonicalPlaceAskPending.restoring(body: raw, scope: actor)
            let sqlRequest = try NativePlaceActionWire.object(raw, maximum: 24_000)
            let sqlOriginal = try JSONDecoder().decode(NativeTextSubmission.self, from: NativePlaceActionWire.bytes(sqlRequest["submission"] as! [String: Any]))
            for name in ["accepted", "recovered"] {
                let bytes = try NativePlaceActionWire.bytes(fixture[name] as! [String: Any])
                guard case .accepted(let originalReceipt, _) = try NativeCanonicalPlaceAskResponse.decode(bytes, pending: sqlPending, expectedDigest: sqlPending.requestDigest) else { preconditionFailure("SQL fixture not accepted") }
                let originalAccepted = try JSONDecoder().decode(NativeTextAccepted.self, from: originalReceipt)
                check(originalAccepted.matches(sqlOriginal, version: 2), "actual ordinary SQL receipt2 matches unchanged Native codec")
                check(!originalAccepted.matches(sqlOriginal, version: 3), "taskHistory3 never silently accepts SQL2")
            }
            print("PASS: actual SQL ordinary-auth requestBytes/accepted/recovered through actual Native canonical + original receipt2 codecs")
        }
        print("PASS: \(count) actual Swift canonical capture/request/receipt/Root decisions; no network or admission")
    }
}
