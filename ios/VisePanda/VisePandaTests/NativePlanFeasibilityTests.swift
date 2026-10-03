import XCTest
@testable import VisePanda

nonisolated final class NativePlanFeasibilityTests:XCTestCase {
    private let owner="11111111-2222-3333-4444-555555555555",trip="22222222-2222-3333-4444-555555555555",proposal="33333333-2222-3333-4444-555555555555",digest=String(repeating:"a",count:64)
    @MainActor private var needs:NativePlanNeeds{.init(partySize:2,currency:"CNY",maxBudgetMinor:nil,minTransferMinutes:15,baggageBufferMinutes:10,appointmentBufferMinutes:5,maxWalkingMinutes:nil)}
    @MainActor private var after:NativeTripContent{.init(days:[.init(id:"Day_1",date:"2026-10-04",timeZone:"Asia/Shanghai",items:[.init(id:"Item_A",dayId:"Day_1",title:"Original appointment",startsAt:"2026-10-04T10:00:00+08:00",endsAt:"2026-10-04T11:00:00+08:00")])])}
    @MainActor private func target(_ actor:NativeDataScope)->NativePlanFeasibilityTarget {
        let p=NativeTripPending.Proposal(id:proposal,revision:2,baseTripVersion:3,status:"pending",createdAt:"2026-10-03T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z",titleDiff:.init(before:"Trip",after:"Trip"),dayDiffs:[],patch:.init(expectedVersion:3,operations:[]),digest:digest,stale:false,evidence:"not_evaluated",assumptions:"not_evaluated",after:after)
        return .init(actor:actor,pending:.init(version:2,trip:.init(id:trip,title:"Trip",headVersion:3,updatedAt:"2026-10-03T00:00:00Z"),proposal:p))
    }
    @MainActor private var actor:NativeDataScope{.init(endpoint:"http://127.0.0.1:63221",subject:owner,mobileEpoch:1,generation:0)}
    @MainActor private func response(_ target:NativePlanFeasibilityTarget)->[String:Any] {
        ["kind":"plan_feasibility/1","basis":["tripId":target.tripId,"proposalId":target.proposalId,"proposalRevision":target.proposalRevision,"baseVersion":target.baseVersion,"proposalDigest":target.proposalDigest],"status":"pending","lines":[["itemId":"Item_A","constraint":"calendar_timezone","status":"supported","reason":"EXPLICIT_DATED_WINDOW"],["itemId":"Item_A","constraint":"actual_place","status":"pending","reason":"EXACT_PLACE_EVIDENCE_MISSING"]],"evidenceBasis":[],"missingEvidence":[["itemId":"Item_A","constraint":"actual_place","reason":"EXACT_PLACE_EVIDENCE_MISSING"]],"userDecisions":[["dayId":"Day_1","itemId":"Item_A","startsAt":"2026-10-04T10:00:00+08:00","endsAt":"2026-10-04T11:00:00+08:00","disposition":"preserved"]],"scheduleChanges":"none","proposalMutation":"none","needsBasis":"current_explicit_input"]
    }
    @MainActor private func bytes(_ object:Any)throws->Data{try JSONSerialization.data(withJSONObject:object)}
    @MainActor func testExplicitNullableNeedsAndNoCallerEvidenceOverride() throws {
        let request=try NativePlanFeasibilityRequest(target:target(actor),needs:needs,choices:[])
        let raw=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(request)) as? [String:Any])
        XCTAssertEqual(Set(raw.keys),Set(["proposalId","expectedProposalRevision","expectedBaseVersion","needs","placeChoices"]))
        let input=try XCTUnwrap(raw["needs"] as? [String:Any]);XCTAssertEqual(input.count,7);XCTAssertTrue(input["maxBudgetMinor"] is NSNull);XCTAssertTrue(input["maxWalkingMinutes"] is NSNull)
        XCTAssertThrowsError(try NativePlanFeasibilityRequest(target:target(actor),needs:.init(partySize:0,currency:"CNY",maxBudgetMinor:nil,minTransferMinutes:15,baggageBufferMinutes:0,appointmentBufferMinutes:0,maxWalkingMinutes:nil),choices:[]))
    }
    @MainActor func testPendingGapsExactBasisAndOriginalDecisionCannotBecomeFeasibleOrRescheduled() throws {
        let target=target(actor);var raw=response(target)
        let result=try XCTUnwrap(NativePlanFeasibilityRead.decode(bytes(raw),target:target,after:after));XCTAssertEqual(result.status,"pending");XCTAssertEqual(result.missingEvidence.count,1)
        raw["status"]="feasible";XCTAssertThrowsError(try NativePlanFeasibilityRead.decode(bytes(raw),target:target,after:after))
        raw=response(target);raw["scheduleChanges"]="rescheduled";XCTAssertThrowsError(try NativePlanFeasibilityRead.decode(bytes(raw),target:target,after:after))
        raw=response(target);raw["userDecisions"]=[["dayId":"Day_1","itemId":"Item_A","startsAt":"2026-10-04T12:00:00+08:00","endsAt":"2026-10-04T13:00:00+08:00","disposition":"preserved"]]
        XCTAssertThrowsError(try NativePlanFeasibilityRead.decode(bytes(raw),target:target,after:after))
        raw=response(target);raw["missingEvidence"]=[];XCTAssertThrowsError(try NativePlanFeasibilityRead.decode(bytes(raw),target:target))
    }
    @MainActor func testChangedInputAndLateActorInvalidateResult()async throws {
        let target=target(actor),store=NativePlanFeasibilityStore();store.bind(target)
        await store.check(needs:needs,after:after,current:{target},post:{_ in try self.bytes(self.response(target))})
        XCTAssertNotNil(store.visible(target));store.invalidate();XCTAssertNil(store.visible(target))
        var current:NativePlanFeasibilityTarget?=target
        await store.check(needs:needs,after:after,current:{current},post:{_ in current=nil;return try self.bytes(self.response(target))})
        XCTAssertNil(store.result)
    }
    @MainActor func testOptionalRouteAndSavedPreferencesRemainReferenceOnly() throws {
        let target=target(actor)
        let choices=[NativePlanPlaceChoice(dayId:"Day_1",itemId:"Item_A",placeReferenceId:trip,mappingId:proposal,expectedMappingVersion:1,city:"shanghai",scene:"attraction",locale:"en"),NativePlanPlaceChoice(dayId:"Day_1",itemId:"Item_B",placeReferenceId:owner,mappingId:proposal,expectedMappingVersion:1,city:"shanghai",scene:"attraction",locale:"en")]
        let route=NativePlanRouteRequest(fromItemId:"Item_A",toItemId:"Item_B",mode:"walking",departure:"now",mapConsent:true)
        let request=try NativePlanFeasibilityRequest(target:target,needs:needs,choices:choices,route:route)
        let encoded=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(request)) as? [String:Any]),routes=try XCTUnwrap(encoded["routeRequests"] as? [[String:Any]])
        XCTAssertEqual(routes.count,1);XCTAssertEqual(Set(routes[0].keys),Set(["fromItemId","toItemId","mode","departure","mapConsent"]))
        XCTAssertThrowsError(try NativePlanFeasibilityRequest(target:target,needs:needs,choices:choices,route:.init(fromItemId:"Item_A",toItemId:"Item_B",mode:"walking",departure:"now",mapConsent:false)))
        let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        let originalDeparture=f.string(from:Date().addingTimeInterval(-60)),observed=f.string(from:Date().addingTimeInterval(-1)),expiry=f.string(from:Date().addingTimeInterval(240))
        var raw=response(target)
        var lines=try XCTUnwrap(raw["lines"] as? [[String:Any]]);lines.append(["itemId":"Item_B","constraint":"door_to_door_route","status":"pending","reason":"QUALIFIED_ROUTE_MISSING"]);raw["lines"]=lines
        raw["missingEvidence"]=[["itemId":"Item_A","constraint":"actual_place","reason":"EXACT_PLACE_EVIDENCE_MISSING"],["itemId":"Item_B","constraint":"door_to_door_route","reason":"QUALIFIED_ROUTE_MISSING"]]
        raw["userDecisions"]=[["dayId":"Day_1","itemId":"Item_A","startsAt":f.string(from:Date().addingTimeInterval(-3600)),"endsAt":originalDeparture,"disposition":"preserved"],["dayId":"Day_1","itemId":"Item_B","startsAt":f.string(from:Date().addingTimeInterval(600)),"endsAt":f.string(from:Date().addingTimeInterval(3600)),"disposition":"preserved"]]
        raw["evidenceBasis"]=[["kind":"route_observation","fromItemId":"Item_A","toItemId":"Item_B","originCanonicalPoiId":trip,"destinationCanonicalPoiId":owner,"provider":"amap","mode":"walking","departure":"now","actualDeparture":originalDeparture,"timeBinding":"reference_only","observedAt":observed,"expiresAt":expiry]]
        raw["preferenceContext"]=["kind":"profile_preference_context/1","status":"current","travelPace":"relaxed","currency":"USD","defaultDepartureTime":"09:00","updatedAt":"2026-10-03T00:00:00Z","influence":"soft_reference_only","explicitInputPriority":"current_explicit_input","hints":["PROFILE_PACE_RELAXED_SOFT_REFERENCE","EXPLICIT_CURRENCY_OVERRIDES_PROFILE","PROFILE_DEPARTURE_REFERENCE_ONLY"]]
        let result=try XCTUnwrap(NativePlanFeasibilityRead.decode(bytes(raw),target:target,choices:choices,route:route,explicitCurrency:"CNY"))
        XCTAssertEqual(result.status,"pending");XCTAssertEqual(result.preferenceContext?.currency,"USD");XCTAssertEqual(request.needs.currency,"CNY");XCTAssertEqual(result.userDecisions.first?.endsAt,originalDeparture)
        lines[2]["status"]="supported";raw["lines"]=lines;raw["missingEvidence"]=[["itemId":"Item_A","constraint":"actual_place","reason":"EXACT_PLACE_EVIDENCE_MISSING"]]
        XCTAssertThrowsError(try NativePlanFeasibilityRead.decode(bytes(raw),target:target,choices:choices,route:route,explicitCurrency:"CNY"))
        var profile=try XCTUnwrap(raw["preferenceContext"] as? [String:Any]);profile["influence"]="hard_constraint";raw["preferenceContext"]=profile
        XCTAssertThrowsError(try NativePlanFeasibilityRead.decode(bytes(raw),target:target,choices:choices,route:route,explicitCurrency:"CNY"))
    }

    @MainActor func testActualSessionPostsReadOnlyExactProposalRequest()async throws {
        let suite="vpj65.feasibility."+UUID().uuidString,defaults=try XCTUnwrap(UserDefaults(suiteName:suite));defer{defaults.removePersistentDomain(forName:suite)}
        let configuration=URLSessionConfiguration.ephemeral;configuration.protocolClasses=[FeasibilityProtocol.self]
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);defer{try? FileManager.default.removeItem(at:root)}
        let materials=NativeDeviceMaterials(inbox:NativeScreenshotInbox(root:root.appendingPathComponent("inbox")),exportRoot:root.appendingPathComponent("exports"))
        let session=NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:63221"],defaults:defaults,configuration:configuration,bundleConfiguration:[:],vault:FeasibilityVault(),deviceMaterials:materials)
        await session.login(email:"synthetic",password:"synthetic")
        let target=target(try XCTUnwrap(session.dataScope));FeasibilityProtocol.configure(try bytes(response(target)))
        let body=try JSONEncoder().encode(NativePlanFeasibilityRequest(target:target,needs:needs,choices:[]))
        let response=try await session.planFeasibility(target,body:body)
        let result=try XCTUnwrap(NativePlanFeasibilityRead.decode(response,target:target,after:after))
        XCTAssertEqual(result.status,"pending");XCTAssertEqual(FeasibilityProtocol.lastBody,body);XCTAssertEqual(FeasibilityProtocol.lastPath,"/api/trips/native/v2/\(trip)/feasibility")
        XCTAssertFalse(FeasibilityProtocol.hadCookieOrigin);XCTAssertEqual(result.proposalMutation,"none");XCTAssertEqual(result.scheduleChanges,"none")
    }
}
@MainActor private final class FeasibilityVault:NativeCredentialVault {
    private var records:[String:Data]=[:]
    func write(_ data:Data,service:String,owner:String)->OSStatus{records[service+owner]=data;return errSecSuccess}
    func read(service:String,owner:String)->(OSStatus,Data?){let data=records[service+owner];return(data==nil ? errSecItemNotFound:errSecSuccess,data)}
    func remove(service:String,owner:String)->OSStatus{records.removeValue(forKey:service+owner);return errSecSuccess}
}
nonisolated private final class FeasibilityProtocol:URLProtocol,@unchecked Sendable {
    private static let lock=NSLock()
    nonisolated(unsafe) private static var payload=Data(),body:Data?,path:String?,bad=false
    static var lastBody:Data?{lock.withLock{body}}
    static var lastPath:String?{lock.withLock{path}}
    static var hadCookieOrigin:Bool{lock.withLock{bad}}
    static func configure(_ data:Data){lock.withLock{payload=data;body=nil;path=nil;bad=false}}
    override class func canInit(with request:URLRequest)->Bool{true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest{request}
    override func stopLoading(){}
    override func startLoading(){
        let owner="11111111-2222-3333-4444-555555555555",action=request.url?.lastPathComponent
        if action=="feasibility" {
            let data=Self.lock.withLock{
                Self.path=request.url?.path;Self.bad=request.value(forHTTPHeaderField:"Cookie") != nil || request.value(forHTTPHeaderField:"Origin") != nil
                if let data=request.httpBody{Self.body=data}else if let stream=request.httpBodyStream{stream.open();defer{stream.close()};var data=Data(),buffer=[UInt8](repeating:0,count:4096);while stream.hasBytesAvailable{let n=stream.read(&buffer,maxLength:buffer.count);if n<=0{break};data.append(contentsOf:buffer.prefix(n))};Self.body=data}
                return Self.payload
            };respond(data);return
        }
        let response:[String:Any]
        if action=="credentials" || action=="refresh"{response=["subject":owner,"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresAt":Date().timeIntervalSince1970+3600,"mobileEpoch":1]}else if action=="profile"{response=["subject":owner,"displayName":"Fixture"]}else{response=["subject":owner,"mobileEpoch":1]}
        guard let data=try? JSONSerialization.data(withJSONObject:response) else{return};respond(data)
    }
    private func respond(_ data:Data){guard let url=request.url,let response=HTTPURLResponse(url:url,statusCode:200,httpVersion:"HTTP/1.1",headerFields:["Content-Type":"application/json"]) else{return};client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:data);client?.urlProtocolDidFinishLoading(self)}
}
