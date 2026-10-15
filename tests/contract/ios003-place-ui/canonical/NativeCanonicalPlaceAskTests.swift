import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor private final class CanonicalRootVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var failWrite = false
    var writes = 0
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        guard !failWrite else { return errSecInteractionNotAllowed }
        writes += 1; values[service + owner] = data; return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[service + owner] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

nonisolated private final class CanonicalTransportState: @unchecked Sendable {
    private let lock = NSLock()
    private var body: Data?
    private var count = 0
    private var reads = 0
    private var deny = false
    private var unknown = false
    func reset(unknown: Bool = false) { lock.withLock { body = nil; count = 0; reads = 0; deny = false; self.unknown = unknown } }
    func denyAuth(_ value: Bool) { lock.withLock { deny = value } }
    var posts: Int { lock.withLock { count } }
    var receiptReads: Int { lock.withLock { reads } }
    var originalBytes: Data? { lock.withLock { body } }
    func reply(path: String, method: String, bytes: Data?, query: [URLQueryItem]) throws -> (Int, [String: Any]) {
        try lock.withLock {
            let owner = "11111111-1111-4111-8111-111111111111"
            if deny { return (401, ["error":["code":"UNAUTHENTICATED"]]) }
            if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
                let payload = try JSONSerialization.data(withJSONObject: ["sub":owner,"session_id":"22222222-2222-4222-8222-222222222222"]).base64EncodedString().replacingOccurrences(of:"=",with:"").replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_")
                return (200,["subject":owner,"accessToken":"synthetic." + payload + ".fixture","refreshToken":"synthetic-only","expiresAt":Date().timeIntervalSince1970 + 3600,"mobileEpoch":3])
            }
            if path.hasSuffix("/profile") { return (200,["subject":owner,"displayName":"Controlled fixture"]) }
            if path == "/api/chat/native/v1/policy", method == "GET" {
                return (200,["version":1,"kind":"policy","policy":Self.policy])
            }
            if path == "/api/chat/native/v2/turns", method == "GET" { return (200,["version":2,"kind":"history","turns":[]]) }
            if path == "/api/chat/native/v1/consent", ["POST", "DELETE"].contains(method) { return (200,["version":1,"kind":method == "POST" ? "accepted" : "withdrawn"]) }
            if path.hasSuffix("/place-ask") {
                if method == "POST" {
                    count += 1; body = bytes
                    guard let bytes else { return (503,["error":["code":"PROVIDER_UNAVAILABLE"]]) }
                    let value = try JSONSerialization.jsonObject(with: bytes) as! [String:Any]
                    let original = value["submission"] as! [String:Any]
                    let operation = Self.operation(original)
                    if unknown { return (200,["schemaVersion":"canonical-place-ask/1","kind":"unknown","operation":operation,"readyForProvider":false]) }
                    return (201, try Self.accepted(bytes))
                }
                reads += 1
                guard let bytes = body else { return (503,["error":["code":"PROVIDER_UNAVAILABLE"]]) }
                let accepted = try Self.accepted(bytes)
                let operation = accepted["operation"] as! [String:Any]
                let requested = Dictionary(uniqueKeysWithValues:query.compactMap { q in q.value.map { (q.name,$0) } })
                guard requested["operationId"] == operation["operationId"] as? String,
                      requested["scopeKind"] == "thread", requested["scopeId"] == operation["scopeId"] as? String,
                      requested["turnId"] == operation["turnId"] as? String else { return (400,["error":["code":"INVALID_INPUT"]]) }
                return (200,["schemaVersion":"canonical-place-ask/1","kind":"recovered","operation":operation,"receipt":accepted,"current":["kind":"unavailable","reason":"source_unavailable"],"readyForProvider":false])
            }
            if ["/api/auth/native/v2/login", "/api/auth/native/v2/session"].contains(path) { return (200,["subject":owner,"mobileEpoch":3]) }
            if path == "/api/auth/native/v2/logout" { return (200,[:]) }
            return (404,["error":["code":"INVALID_INPUT"]])
        }
    }
    private static func operation(_ original:[String:Any]) -> [String:Any] {
        ["operationId":original["idempotencyKey"]!,"scopeKind":"thread","scopeId":original["threadId"]!,"messageId":NSNull(),"turnId":original["turnId"]!]
    }
    private static func accepted(_ bytes:Data) throws -> [String:Any] {
        let value = try JSONSerialization.jsonObject(with:bytes) as! [String:Any]
        let original=value["submission"] as! [String:Any], task=original["serviceTask"] as! [String:Any]
        let digest=CryptoDigest.bytes(bytes)
        return ["schemaVersion":"canonical-place-ask/1","kind":"accepted","operation":operation(original),
                "originalReceipt":["version":2,"kind":"accepted","turnId":original["turnId"]!,"reused":false,"serviceTaskId":task["id"]!,"scopeVersion":1,"relationship":task["relationship"]!,"parentTurnId":task["parentTurnId"]!],
                "binding":["turnId":original["turnId"]!,"serviceTaskId":task["id"]!,"goalId":NSNull(),"goalVersion":NSNull(),"requestDigest":digest,"expectation":value["expectation"]!],"readyForProvider":false,"currentEligibilityRequiresRead":true]
    }
    static var policy: [String:Any] {
        ["id":"33333333-3333-4333-8333-333333333333","provider":"qwen","recipient":"fixture","sourceRegion":"fixture","processingRegion":"fixture","storageRegion":"fixture","termsVersion":"fixture","noticeVersion":"fixture-v1","noticeHash":String(repeating:"f",count:64),"noticeZh":"合成测试","noticeEn":"Controlled fixture","retention":"retain_after_hide_v1","expiresAt":"2099-01-01","consentState":"accepted"]
    }
}
import CryptoKit
nonisolated private enum CryptoDigest {
    static func bytes(_ value:Data)->String { SHA256.hash(data:value).map { String(format:"%02x",$0) }.joined() }
}
nonisolated private final class CanonicalControlledProtocol: URLProtocol {
    static let fixture = CanonicalTransportState()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let url=request.url!, query=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems ?? []
            let (status,value)=try Self.fixture.reply(path:url.path,method:request.httpMethod ?? "GET",bytes:requestBytes(),query:query)
            let response=HTTPURLResponse(url:url,statusCode:status,httpVersion:nil,headerFields:["Content-Type":"application/json"])!
            client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
            client?.urlProtocol(self,didLoad:try JSONSerialization.data(withJSONObject:value));client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self,didFailWithError:error) }
    }
    private func requestBytes()->Data? {
        if let data=request.httpBody { return data }
        guard let stream=request.httpBodyStream else { return nil }
        stream.open();defer { stream.close() }
        var data=Data(), buffer=[UInt8](repeating:0,count:1024)
        while stream.hasBytesAvailable { let n=stream.read(&buffer,maxLength:buffer.count);if n<=0 { break };data.append(buffer,count:n) }
        return data
    }
    override func stopLoading() {}
}

@MainActor @Suite(.serialized) struct NativeCanonicalPlaceAskTests {
    private func makeSession(_ defaults:UserDefaults,_ vault:CanonicalRootVault)->NativeSession {
        let config=URLSessionConfiguration.ephemeral;config.protocolClasses=[CanonicalControlledProtocol.self]
        return NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:65031"],defaults:defaults,configuration:config,bundleConfiguration:["VisePandaNativeTaskContext":"service_task_v1"],vault:vault)
    }
    private func capture(_ scope:NativeDataScope)->NativeCanonicalPlaceAskCapture {
        let identity=try! NativePlaceActionIdentity(candidate:.init(provider:.amap,providerPoiId:"Exact-CASE",rawName:"Synthetic",matchedCanonicalPoiId:"44444444-4444-4444-8444-444444444444"))
        return .init(scope:scope,expectation:.init(tripId:"55555555-5555-4555-8555-555555555555",headVersion:0,selection:identity,mappingDigest:String(repeating:"a",count:64),contextDigest:String(repeating:"b",count:64),referenceId:nil,locale:"en"),title:"Controlled original",expiresAt:Date().addingTimeInterval(30),receivedUptime:ProcessInfo.processInfo.systemUptime,lifetime:30)
    }
    private func adopt(_ session:NativeSession,_ store:NativeAskStore) throws {
        session.prepareCanonicalPlaceAsk(capture(try #require(session.dataScope)))
        store.canonicalSceneChanged(active:true)
        store.adoptCanonicalPlaceAsk(navigationID:try #require(session.exploreAskHandoff?.id),locale:"en",session:session)
    }
    @Test func explicitOrdinaryTaskPortMatrixKeepsLegacyModesStrict() {
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v1/policy",method:"GET")=="api/chat/native/v1")
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v1/consent",method:"POST")=="api/chat/native/v1")
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v1/consent",method:"DELETE")=="api/chat/native/v1")
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v2/turns",method:"GET")=="api/chat/native/v2")
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v2/turns",method:"POST")=="api/chat/native/v2")
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v2/policy",method:"GET").isEmpty)
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v1/turns",method:"POST").isEmpty)
        #expect(NativeSession.askRequestPrefix(mode:.serviceTask,path:"api/chat/native/v3/turns",method:"GET").isEmpty)
        #expect(NativeSession.askRequestPrefix(mode:.taskContext,path:"api/chat/native/v1/policy",method:"GET")=="api/chat/native/v3")
        #expect(NativeAskMode.currentInput.version==1 && !NativeAskMode.currentInput.usesTask)
        #expect(NativeAskMode.taskContext.version==3 && NativeAskMode.taskContext.usesTask)
        #expect(NativeAskMode.serviceTask.version==2 && NativeAskMode.serviceTask.usesTask)
    }
    @Test func actualStoreExplicitAdoptUsesOnePostAndOriginalTaskReceipt() async throws {
        CanonicalControlledProtocol.fixture.reset()
        let name="canonical-root-"+UUID().uuidString,defaults=UserDefaults(suiteName:name)!
        defer { defaults.removePersistentDomain(forName:name) }
        let vault=CanonicalRootVault(),session=makeSession(defaults,vault),store=NativeAskStore(mode:.serviceTask)
        await session.login(email:"fixture@example.invalid",password:"synthetic-only")
        await store.reload(using:session)
        store.draft="  What time does it open?  "
        try adopt(session,store)
        #expect(CanonicalControlledProtocol.fixture.posts==0 && session.canonicalPlaceAskSelection != nil)
        await store.send(locale:"en",using:session)
        #expect(CanonicalControlledProtocol.fixture.posts==1)
        #expect(session.canonicalPlaceAskPending==nil && !session.canonicalPlaceAskRecoveryRequired)
        #expect(session.canonicalPlaceAskSelection==nil && store.draft.isEmpty)
        let bytes=try #require(CanonicalControlledProtocol.fixture.originalBytes)
        let value=try NativePlaceActionWire.object(bytes,maximum:24000),original=try #require(value["submission"] as? [String:Any])
        #expect(original["text"] as? String=="  What time does it open?  ")
        #expect(store.intent == .awaiting(try #require(original["turnId"] as? String)))
    }
    @Test func unknownSurvivesAuthLossRestartAndRecoversWithoutAnotherPost() async throws {
        CanonicalControlledProtocol.fixture.reset(unknown:true)
        let name="canonical-restart-"+UUID().uuidString,defaults=UserDefaults(suiteName:name)!
        defer { defaults.removePersistentDomain(forName:name) }
        let vault=CanonicalRootVault(),session=makeSession(defaults,vault),store=NativeAskStore(mode:.serviceTask)
        await session.login(email:"fixture@example.invalid",password:"synthetic-only");await store.reload(using:session)
        store.draft="Original question";try adopt(session,store);await store.send(locale:"en",using:session)
        let retained=try #require(session.canonicalPlaceAskPending)
        #expect(CanonicalControlledProtocol.fixture.posts==1 && store.draft=="Original question")
        await store.send(locale:"en",using:session)
        #expect(CanonicalControlledProtocol.fixture.posts==1)
        let actor=try session.communitySafetyActor()
        let snapshot=try #require(session.journalDataSource().snapshot(source:.ask,actor:actor))
        #expect(snapshot.record.operationID==retained.operationID && snapshot.record.originalOperationBytes==nil)
        #expect(try session.journalDataSource().physicallyAbsent(source:.ask,actor:actor)==false)
        CanonicalControlledProtocol.fixture.denyAuth(true);await session.validate()
        #expect(session.dataScope==nil && session.subject==nil && session.status=="storageError")
        #expect(vault.values.values.contains { (try? JSONDecoder().decode(NativeCredential.self,from:$0).canonicalPlaceAsk?.body)==retained.body })
        do { _=try await session.canonicalPlaceAskRequest(retained);Issue.record("auth-fenced POST permitted") } catch {}
        #expect(CanonicalControlledProtocol.fixture.posts==1)
        CanonicalControlledProtocol.fixture.denyAuth(false)
        let restored=makeSession(defaults,vault);await restored.restore()
        #expect(restored.dataScope != nil && restored.canonicalPlaceAskPending?.body==retained.body)
        let reader=NativeAskStore(mode:.serviceTask);await reader.reload(using:restored);reader.canonicalSceneChanged(active:true)
        await reader.recoverCanonicalPlaceAsk(using:restored)
        #expect(CanonicalControlledProtocol.fixture.posts==1 && CanonicalControlledProtocol.fixture.receiptReads==1)
        #expect(restored.canonicalPlaceAskPending==nil)
        await restored.logout();#expect(restored.dataScope==nil && !restored.canonicalPlaceAskRecoveryRequired)
    }
    @Test func failedRootWriteAndSceneChangePreventPost() async throws {
        CanonicalControlledProtocol.fixture.reset()
        let name="canonical-failwrite-"+UUID().uuidString,defaults=UserDefaults(suiteName:name)!
        defer { defaults.removePersistentDomain(forName:name) }
        let vault=CanonicalRootVault(),session=makeSession(defaults,vault),store=NativeAskStore(mode:.serviceTask)
        await session.login(email:"fixture@example.invalid",password:"synthetic-only");await store.reload(using:session)
        store.draft="Keep this draft";try adopt(session,store);store.canonicalSceneChanged(active:false)
        await store.send(locale:"en",using:session)
        #expect(CanonicalControlledProtocol.fixture.posts==0 && store.draft=="Keep this draft")
        session.discardCanonicalPlaceAskSelection();try adopt(session,store);vault.failWrite=true
        await store.send(locale:"en",using:session)
        #expect(CanonicalControlledProtocol.fixture.posts==0 && session.canonicalPlaceAskPending==nil)
    }
}
