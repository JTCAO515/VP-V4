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
    private var shortCredentials = false
    private var holdRefresh = false
    private var holdAsk = false
    private var enteredHold = false
    private var selectedHistory: Data?
    private var historyFails = false
    private var withdrawnHistory = false
    private var pendingHistory: Data?
    private var cancelledPending = false
    private var cancels = 0
    var cancellations: Int { lock.withLock { cancels } }
    func pendingHistory(_ value: Data) { lock.withLock { pendingHistory = value; cancelledPending = false } }
    func withdrawSelectedHistory() { lock.withLock { withdrawnHistory = true } }
    func selectedHistory(_ value: Data) { lock.withLock { selectedHistory = value; historyFails = false; withdrawnHistory = false } }
    func failHistory() { lock.withLock { historyFails = true } }
    private let releaseGate = DispatchSemaphore(value: 0)
    var held: Bool { lock.withLock { enteredHold } }
    func shortLivedCredentials() { lock.withLock { shortCredentials = true } }
    func holdNextRefresh() { lock.withLock { holdRefresh = true; enteredHold = false } }
    func holdNextPlaceAsk() { lock.withLock { holdAsk = true; enteredHold = false } }
    func releaseHeld() { releaseGate.signal() }
    func reset(unknown: Bool = false) { lock.withLock { body = nil; count = 0; reads = 0; deny = false; self.unknown = unknown; shortCredentials = false; holdRefresh = false; holdAsk = false; enteredHold = false; selectedHistory = nil; historyFails = false; withdrawnHistory = false; pendingHistory = nil; cancelledPending = false; cancels = 0
            while releaseGate.wait(timeout: .now()) == .success {} } }
    func denyAuth(_ value: Bool) { lock.withLock { deny = value } }
    var posts: Int { lock.withLock { count } }
    var receiptReads: Int { lock.withLock { reads } }
    var originalBytes: Data? { lock.withLock { body } }
    func reply(path: String, method: String, bytes: Data?, query: [URLQueryItem]) throws -> (Int, [String: Any]) {
        let shouldWait = lock.withLock {
            let action = bytes.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["action"] as? String
            if path.hasSuffix("/refresh") && holdRefresh { holdRefresh = false; enteredHold = true; return true }
            if path.hasSuffix("/place-actions") && action == "ask" && holdAsk { holdAsk = false; enteredHold = true; return true }
            return false
        }
        if shouldWait { _ = releaseGate.wait(timeout: .now() + 5) }
        return try lock.withLock {
            let historical = (pendingHistory ?? selectedHistory).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let owner = historical?["owner"] as? String ?? "11111111-1111-4111-8111-111111111111"
            if deny { return (401, ["error":["code":"UNAUTHENTICATED"]]) }
            if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
                let payload = try JSONSerialization.data(withJSONObject: ["sub":owner,"session_id":"22222222-2222-4222-8222-222222222222"]).base64EncodedString().replacingOccurrences(of:"=",with:"").replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_")
                return (200,["subject":owner,"accessToken":"synthetic." + payload + ".fixture","refreshToken":"synthetic-only","expiresAt":Date().timeIntervalSince1970 + (shortCredentials ? 5 : 3600),"mobileEpoch":3])
            }
            if path.hasSuffix("/profile") { return (200,["subject":owner,"displayName":"Controlled fixture"]) }
            if path == "/api/chat/native/v1/policy", method == "GET" {
                var policy = Self.policy
                if let request = historical?["request"] as? [String: Any], let input = request["submission"] as? [String: Any] { policy["id"] = input["policyId"] }
                return (200,["version":1,"kind":"policy","policy":policy])
            }
            if path.hasPrefix("/api/chat/native/v1/turns/"), path.hasSuffix("/cancel"), method == "POST", let pendingHistory {
                let fixture = try JSONSerialization.jsonObject(with: pendingHistory) as! [String: Any]
                let original = (fixture["history"] as! [String: Any])["turns"] as! [[String: Any]]
                guard let id = original.first?["turnId"] as? String, path == "/api/chat/native/v1/turns/" + id + "/cancel" else { return (400,["error":["code":"INVALID_INPUT"]]) }
                cancelledPending = true; cancels += 1
                return (200,["version":1,"kind":"cancelled"])
            }
            if path == "/api/chat/native/v2/turns", method == "GET" {
                if let pendingHistory {
                    let fixture = try JSONSerialization.jsonObject(with: pendingHistory) as! [String: Any]
                    var projection = fixture[cancelledPending ? "cancelled" : "history"] as! [String: Any]
                    projection["version"] = 2
                    return (200, projection)
                }
                if historyFails { return (503,["error":["code":"PROVIDER_UNAVAILABLE"]]) }
                if let selectedHistory {
                    let fixture = try JSONSerialization.jsonObject(with: selectedHistory) as! [String: Any]
                    let history = withdrawnHistory ? (fixture["withdrawn"] as! [String: Any])["sqlTaskHistory"] : fixture["sqlTaskHistory"]
                    var projection = history as! [String: Any]
                    projection["version"] = 2 // The original native-http.ts envelope, no fact/receipt edits.
                    return (200, projection)
                }
                return (200,["version":2,"kind":"history","turns":[]])
            }
            if path == "/api/chat/native/v1/consent", ["POST", "DELETE"].contains(method) { return (200,["version":1,"kind":method == "POST" ? "accepted" : "withdrawn"]) }
            if path.hasSuffix("/place-actions"), let bytes {
                let input = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
                let selection = input["selection"] as! [String: Any]
                let trip = String(path.split(separator: "/").dropLast().last!)
                let evaluated = ISO8601DateFormatter().string(from: Date())
                let expires = ISO8601DateFormatter().string(from: Date().addingTimeInterval(29))
                if input["action"] as? String == "context" {
                    return (200,["kind":"place_action_context","tripId":trip,"tripVersion":0,"selection":selection,"mappingDigest":String(repeating:"a",count:64),"contextDigest":String(repeating:"b",count:64),"snapshot":["version":0,"title":"Controlled Trip","days":[]],"displayTitle":"Controlled original","referenceId":NSNull(),"saved":NSNull(),"sourceCandidates":[],"sourceCandidatesStatus":"complete","evaluatedAt":evaluated,"expiresAt":expires])
                }
                return (200,["kind":"place_ask_context","tripId":trip,"tripVersion":0,"selection":selection,"mappingDigest":String(repeating:"a",count:64),"contextDigest":String(repeating:"b",count:64),"referenceId":NSNull(),"selectedSources":["artifact":NSNull(),"trip":["tripId":trip,"headVersion":0],"evidence":[]],"currentInput":selection,"readyForProvider":false,"purpose":"first_party_reference_only","expiresAt":expires,"handoff":NSNull()])
            }
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
    private func capture(_ scope:NativeDataScope, lifetime: TimeInterval = 30)->NativeCanonicalPlaceAskCapture {
        let identity=try! NativePlaceActionIdentity(candidate:.init(provider:.amap,providerPoiId:"Exact-CASE",rawName:"Synthetic",matchedCanonicalPoiId:"44444444-4444-4444-8444-444444444444"))
        return .init(scope:scope,expectation:.init(tripId:"55555555-5555-4555-8555-555555555555",headVersion:0,selection:identity,mappingDigest:String(repeating:"a",count:64),contextDigest:String(repeating:"b",count:64),referenceId:nil,locale:"en"),title:"Controlled original",expiresAt:Date().addingTimeInterval(lifetime),receivedUptime:ProcessInfo.processInfo.systemUptime,lifetime:lifetime)
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
        let originalTurn = try #require(original["turnId"] as? String)
        #expect(store.intent == .awaiting(originalTurn))
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
        let snapshotRead = try session.journalDataSource().snapshot(source: .ask, actor: actor)
        let snapshot = try #require(snapshotRead)
        #expect(snapshot.record.operationID==retained.operationID && snapshot.record.originalOperationBytes==nil)
        #expect(try session.journalDataSource().physicallyAbsent(source:.ask,actor:actor)==false)
        CanonicalControlledProtocol.fixture.denyAuth(true);await session.validate()
        #expect(session.dataScope==nil && session.subject==nil && session.status=="storageError")
        #expect(vault.values.values.contains { (try? JSONDecoder().decode(NativeCredential.self,from:$0).canonicalPlaceAsk?.body)==retained.body })
        do { _=try await session.canonicalPlaceAskRequest(retained, beforeSend: { true });Issue.record("auth-fenced POST permitted") } catch {}
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
    @Test func actualRefreshAwaitRechecksTTLAndSceneBeforeTransport() async throws {
        for mutation in ["ttl", "scene"] {
            let fixture = CanonicalControlledProtocol.fixture
            fixture.reset(); fixture.shortLivedCredentials()
            let name = "canonical-final-send-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
            defer { defaults.removePersistentDomain(forName: name) }
            let vault = CanonicalRootVault(), session = makeSession(defaults, vault), store = NativeAskStore(mode: .serviceTask)
            await session.login(email: "fixture@example.invalid", password: "synthetic-only"); await store.reload(using: session)
            let selected = capture(try #require(session.dataScope), lifetime: mutation == "ttl" ? 2 : 30)
            session.prepareCanonicalPlaceAsk(selected); store.canonicalSceneChanged(active: true)
            store.adoptCanonicalPlaceAsk(navigationID: try #require(session.exploreAskHandoff?.id), locale: "en", session: session)
            store.draft = "Do not rewrite this question"
            fixture.holdNextRefresh()
            let sending = Task { await store.send(locale: "en", using: session) }
            defer { sending.cancel(); fixture.releaseHeld() }
            for _ in 0..<200 { if fixture.held { break }; try await Task.sleep(for: .milliseconds(10)) }
            #expect(fixture.held)
            if mutation == "ttl" { try await Task.sleep(for: .milliseconds(2100)) }
            else { store.canonicalSceneChanged(active: false); session.invalidateCanonicalPlaceAskReference() }
            fixture.releaseHeld(); await sending.value
            #expect(fixture.posts == 0 && session.canonicalPlaceAskPending != nil)
            #expect(store.draft == "Do not rewrite this question")
        }
    }
    @Test func delayedRereadCannotReviveDiscardedReplacedOrSceneInvalidatedReference() async throws {
        for mutation in ["discard", "replace", "scene"] {
            let fixture = CanonicalControlledProtocol.fixture; fixture.reset()
            let name = "canonical-reread-cas-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
            defer { defaults.removePersistentDomain(forName: name) }
            let vault = CanonicalRootVault(), session = makeSession(defaults, vault)
            await session.login(email: "fixture@example.invalid", password: "synthetic-only")
            let original = capture(try #require(session.dataScope)); session.prepareCanonicalPlaceAsk(original)
            fixture.holdNextPlaceAsk()
            let reread = Task { try await session.recheckCanonicalPlaceAsk(original, locale: "en") }
            defer { reread.cancel(); fixture.releaseHeld() }
            for _ in 0..<200 { if fixture.held { break }; try await Task.sleep(for: .milliseconds(10)) }
            #expect(fixture.held)
            let oldGeneration = session.canonicalPlaceAskReferenceGeneration
            if mutation == "discard" { session.clearExploreAsk() }
            else if mutation == "replace" { session.prepareCanonicalPlaceAsk(capture(try #require(session.dataScope))) }
            else { session.invalidateCanonicalPlaceAskReference() }
            fixture.releaseHeld()
            do { _ = try await reread.value; Issue.record("stale reread returned after \(mutation)") } catch {}
            #expect(session.canonicalPlaceAskReferenceGeneration != oldGeneration)
            if mutation == "discard" { #expect(session.canonicalPlaceAskNavigation == nil) }
            #expect(fixture.posts == 0)
        }
    }
    @Test func actualSelectedHistoryHonorsOriginalProofTTLFailureAndScene() async throws {
        let fixture = CanonicalControlledProtocol.fixture; fixture.reset(); fixture.selectedHistory(CanonicalSQLHistory.data)
        #expect(CryptoDigest.bytes(CanonicalSQLHistory.data) == CanonicalSQLHistory.sha256)
        let name = "canonical-history-ttl-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = CanonicalRootVault(), session = makeSession(defaults, vault)
        var uptime = 100.0
        let store = NativeAskStore(mode: .serviceTask, canonicalUptime: { uptime })
        await session.login(email: "fixture@example.invalid", password: "synthetic-only")
        store.canonicalSceneChanged(active: true); await store.reload(using: session)
        let turn = try #require(store.turns.first(where: { $0.result != nil }))
        #expect(store.canonicalSelectedProofs[turn.id]?.matches(turn) == true)
        #expect(store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        uptime = 131
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        await store.reload(using: session)
        #expect(store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        fixture.withdrawSelectedHistory(); await store.reload(using: session)
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        #expect(store.turns.contains { $0.id == turn.id && $0.input == turn.input && $0.outcome == turn.outcome && $0.result?.knowledge == nil && $0.result?.projection == "unavailable" })
        fixture.selectedHistory(CanonicalSQLHistory.data); await store.reload(using: session)
        #expect(store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        fixture.failHistory(); await store.reload(using: session)
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope) && store.turns.isEmpty && store.canonicalSelectedReadUnavailable)
        fixture.selectedHistory(CanonicalSQLHistory.data); await store.reload(using: session)
        #expect(store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        store.canonicalSceneChanged(active: false)
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        store.canonicalSceneChanged(active: true)
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        await store.reload(using: session)
        #expect(store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        await session.logout()
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        #expect(fixture.posts == 0)
    }
    @Test func actualHistoryReferenceRereadsExactTupleWithoutAdoptingOrSending() async throws {
        let fixture = CanonicalControlledProtocol.fixture; fixture.reset(); fixture.selectedHistory(CanonicalSQLHistory.data)
        let name = "canonical-history-reread-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = CanonicalRootVault(), session = makeSession(defaults, vault), store = NativeAskStore(mode: .serviceTask)
        await session.login(email: "fixture@example.invalid", password: "synthetic-only")
        store.canonicalSceneChanged(active: true); await store.reload(using: session)
        let proof = try #require(store.canonicalSelectedProofs.values.first)
        store.draft = "My next question"
        let refreshed = try await session.recheckCanonicalPlaceAskHistory(proof, locale: "en")
        #expect(session.stageCanonicalPlaceAskHistoryRefresh(refreshed))
        #expect(session.canonicalPlaceAskNavigation?.expectation.selection == proof.expectation.selection)
        #expect(session.canonicalPlaceAskNavigation?.expectation.tripId == proof.expectation.tripId)
        #expect(session.canonicalPlaceAskSelection == nil && fixture.posts == 0 && store.draft == "My next question")
        session.clearExploreAsk()
        #expect(!session.stageCanonicalPlaceAskHistoryRefresh(refreshed))
    }
    @Test func actualWithdrawnPendingTaskRemainsVisibleAndOriginalCancelWorks() async throws {
        let fixture = CanonicalControlledProtocol.fixture; fixture.reset(); fixture.pendingHistory(CanonicalSQLPending.data)
        #expect(CryptoDigest.bytes(CanonicalSQLPending.data) == CanonicalSQLPending.sha256)
        let name = "canonical-pending-cancel-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = CanonicalRootVault(), session = makeSession(defaults, vault), store = NativeAskStore(mode: .serviceTask)
        await session.login(email: "fixture@example.invalid", password: "synthetic-only")
        store.canonicalSceneChanged(active: true); await store.reload(using: session)
        let turn = try #require(store.turns.first)
        #expect(turn.waiting && turn.output == nil && turn.result?.projection == "unavailable" && turn.result?.knowledge == nil)
        #expect(store.canonicalSelectedProofs[turn.id]?.matches(turn) == true)
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
        await store.cancel(turn, using: session)
        #expect(fixture.cancellations == 1 && fixture.posts == 0)
        #expect(store.turns.contains { $0.id == turn.id && $0.status == "cancelled" && $0.input == turn.input && $0.result?.knowledge == nil })
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope))
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


// Exact ordinary-auth PG 198c66 fixture bytes; controlled transport is not real Auth.
nonisolated private enum CanonicalSQLHistory {
    static let sha256 = "5923ce1e4e5a3dc9b56cd98a210c35ed82093df3d9bb5475cbf99a9504fef2ad"
    static let data = Data(base64Encoded: "ewogICJub3ciOiAxNzkyMDU4OTg5NzU3LAogICJvd25lciI6ICI5OWQ0ZGM5Yi00NjM2LTQxMTUtOTgwYi00ZTk1MGI4MWRiMWMiLAogICJsaW1pdCI6IDIwLAogICJyZXF1ZXN0Qnl0ZXMiOiAie1wic2NoZW1hVmVyc2lvblwiOlwiY2Fub25pY2FsLXBsYWNlLWFzay8xXCIsXCJzdWJtaXNzaW9uXCI6e1widGhyZWFkSWRcIjpcIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMlwiLFwidHVybklkXCI6XCIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGVcIixcImlkZW1wb3RlbmN5S2V5XCI6XCIzMTJhZGJkNC1jODg1LTRkZDctYmYyMS1kNTI1NTVmMjM0YzlcIixcInBvbGljeUlkXCI6XCI5MWRhZjdhYS05NWM1LTQxYzAtODIyZi01Y2FhYThhZTM0MTVcIixcImxvY2FsZVwiOlwiZW5cIixcInRleHRcIjpcIldoYXQgdGltZSBkb2VzIGl0IG9wZW4/XCIsXCJzZXJ2aWNlVGFza1wiOntcImlkXCI6XCI2MTZlZTI0Zi05ZmUxLTRiNTAtODcxOS03ODE5MDc3ZGVhNGZcIixcInNjb3BlVmVyc2lvblwiOjEsXCJyZWxhdGlvbnNoaXBcIjpcIm5ld19nb2FsXCIsXCJwYXJlbnRUdXJuSWRcIjpudWxsfX0sXCJleHBlY3RhdGlvblwiOntcInRyaXBJZFwiOlwiZjQ0OWNkMjMtNzc5Zi00NDhhLWE0OTktODk3YTQ3MjE0MjQ2XCIsXCJoZWFkVmVyc2lvblwiOjAsXCJjYW5vbmljYWxQb2lJZFwiOlwiYTg4NTI0NGUtMWFjNy00MmU3LThhNjQtMmMzYTE4M2I4OWVkXCIsXCJwcm92aWRlclwiOlwiYW1hcFwiLFwicHJvdmlkZXJQb2lJZFwiOlwic2VsZi1vbmx5LWFiMDkzODJiLWMxNDYtNGQ0Yy1hNTU0LWE0NmVkZmY3MzFlZlwiLFwibWFwcGluZ0RpZ2VzdFwiOlwiN2FiYjFhMGQxNTJkMDdmZTFjNTJjYzIyNmNmY2UwYzEyNzk4Njg5NDMyZjYwODE4NmU3OTJiYTdjZTQ2MTAyYVwiLFwiY29udGV4dERpZ2VzdFwiOlwiZmI2NjdmYTAzOWRkOTY3OWJkMjc5NzMyNjU3NDVmZWM4MDRlNjI0YTM3OTdjNjg4N2FlMGM2NGRlMzI1N2RjMVwiLFwicmVmZXJlbmNlSWRcIjpcIjFhOWRiMDYzLWNjYmYtNDQ4NS1hZDdiLTFmMWFmZmYwZjlmZFwiLFwibG9jYWxlXCI6XCJlblwifX0iLAogICJyZXF1ZXN0IjogewogICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLWFzay8xIiwKICAgICJzdWJtaXNzaW9uIjogewogICAgICAidGhyZWFkSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAiaWRlbXBvdGVuY3lLZXkiOiAiMzEyYWRiZDQtYzg4NS00ZGQ3LWJmMjEtZDUyNTU1ZjIzNGM5IiwKICAgICAgInBvbGljeUlkIjogIjkxZGFmN2FhLTk1YzUtNDFjMC04MjJmLTVjYWFhOGFlMzQxNSIsCiAgICAgICJsb2NhbGUiOiAiZW4iLAogICAgICAidGV4dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICJzZXJ2aWNlVGFzayI6IHsKICAgICAgICAiaWQiOiAiNjE2ZWUyNGYtOWZlMS00YjUwLTg3MTktNzgxOTA3N2RlYTRmIiwKICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAicGFyZW50VHVybklkIjogbnVsbAogICAgICB9CiAgICB9LAogICAgImV4cGVjdGF0aW9uIjogewogICAgICAidHJpcElkIjogImY0NDljZDIzLTc3OWYtNDQ4YS1hNDk5LTg5N2E0NzIxNDI0NiIsCiAgICAgICJoZWFkVmVyc2lvbiI6IDAsCiAgICAgICJjYW5vbmljYWxQb2lJZCI6ICJhODg1MjQ0ZS0xYWM3LTQyZTctOGE2NC0yYzNhMTgzYjg5ZWQiLAogICAgICAicHJvdmlkZXIiOiAiYW1hcCIsCiAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS1hYjA5MzgyYi1jMTQ2LTRkNGMtYTU1NC1hNDZlZGZmNzMxZWYiLAogICAgICAibWFwcGluZ0RpZ2VzdCI6ICI3YWJiMWEwZDE1MmQwN2ZlMWM1MmNjMjI2Y2ZjZTBjMTI3OTg2ODk0MzJmNjA4MTg2ZTc5MmJhN2NlNDYxMDJhIiwKICAgICAgImNvbnRleHREaWdlc3QiOiAiZmI2NjdmYTAzOWRkOTY3OWJkMjc5NzMyNjU3NDVmZWM4MDRlNjI0YTM3OTdjNjg4N2FlMGM2NGRlMzI1N2RjMSIsCiAgICAgICJyZWZlcmVuY2VJZCI6ICIxYTlkYjA2My1jY2JmLTQ0ODUtYWQ3Yi0xZjFhZmZmMGY5ZmQiLAogICAgICAibG9jYWxlIjogImVuIgogICAgfQogIH0sCiAgImFjY2VwdGVkIjogewogICAgImtpbmQiOiAiYWNjZXB0ZWQiLAogICAgImJpbmRpbmciOiB7CiAgICAgICJnb2FsSWQiOiBudWxsLAogICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICJleHBlY3RhdGlvbiI6IHsKICAgICAgICAibG9jYWxlIjogImVuIiwKICAgICAgICAidHJpcElkIjogImY0NDljZDIzLTc3OWYtNDQ4YS1hNDk5LTg5N2E0NzIxNDI0NiIsCiAgICAgICAgInByb3ZpZGVyIjogImFtYXAiLAogICAgICAgICJoZWFkVmVyc2lvbiI6IDAsCiAgICAgICAgInJlZmVyZW5jZUlkIjogIjFhOWRiMDYzLWNjYmYtNDQ4NS1hZDdiLTFmMWFmZmYwZjlmZCIsCiAgICAgICAgImNvbnRleHREaWdlc3QiOiAiZmI2NjdmYTAzOWRkOTY3OWJkMjc5NzMyNjU3NDVmZWM4MDRlNjI0YTM3OTdjNjg4N2FlMGM2NGRlMzI1N2RjMSIsCiAgICAgICAgIm1hcHBpbmdEaWdlc3QiOiAiN2FiYjFhMGQxNTJkMDdmZTFjNTJjYzIyNmNmY2UwYzEyNzk4Njg5NDMyZjYwODE4NmU3OTJiYTdjZTQ2MTAyYSIsCiAgICAgICAgInByb3ZpZGVyUG9pSWQiOiAic2VsZi1vbmx5LWFiMDkzODJiLWMxNDYtNGQ0Yy1hNTU0LWE0NmVkZmY3MzFlZiIsCiAgICAgICAgImNhbm9uaWNhbFBvaUlkIjogImE4ODUyNDRlLTFhYzctNDJlNy04YTY0LTJjM2ExODNiODllZCIKICAgICAgfSwKICAgICAgImdvYWxWZXJzaW9uIjogbnVsbCwKICAgICAgInJlcXVlc3REaWdlc3QiOiAiYmU5ZDBiOTU3MzIyY2VhODVjNzg0MDc3ZTYzMTY1NDE4NDgzYjE4ODZkMjM2M2NjYmUwNDcwOGNhMTY5ZjUwMSIsCiAgICAgICJzZXJ2aWNlVGFza0lkIjogIjYxNmVlMjRmLTlmZTEtNGI1MC04NzE5LTc4MTkwNzdkZWE0ZiIKICAgIH0sCiAgICAib3BlcmF0aW9uIjogewogICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICJzY29wZUlkIjogIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMiIsCiAgICAgICJtZXNzYWdlSWQiOiBudWxsLAogICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICJvcGVyYXRpb25JZCI6ICIzMTJhZGJkNC1jODg1LTRkZDctYmYyMS1kNTI1NTVmMjM0YzkiCiAgICB9LAogICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLWFzay8xIiwKICAgICJvcmlnaW5hbFJlY2VpcHQiOiB7CiAgICAgICJraW5kIjogImFjY2VwdGVkIiwKICAgICAgInJldXNlZCI6IGZhbHNlLAogICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICJ2ZXJzaW9uIjogMiwKICAgICAgInBhcmVudFR1cm5JZCI6IG51bGwsCiAgICAgICJyZWxhdGlvbnNoaXAiOiAibmV3X2dvYWwiLAogICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgInNlcnZpY2VUYXNrSWQiOiAiNjE2ZWUyNGYtOWZlMS00YjUwLTg3MTktNzgxOTA3N2RlYTRmIgogICAgfSwKICAgICJyZWFkeUZvclByb3ZpZGVyIjogZmFsc2UsCiAgICAiY3VycmVudEVsaWdpYmlsaXR5UmVxdWlyZXNSZWFkIjogdHJ1ZQogIH0sCiAgInNxbFJlYWQiOiB7CiAgICAia2luZCI6ICJ0ZXh0IiwKICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAibG9jYWxlIjogImVuIiwKICAgICJvdXRwdXQiOiAicmV2aWV3ZWQtYW5zd2VyLXYxIiwKICAgICJyZXN1bHQiOiB7CiAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgInR5cGUiOiAicmV2aWV3ZWRfYW5zd2VyIiwKICAgICAgImludGVudCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgImtub3dsZWRnZSI6IHsKICAgICAgICAic2NvcGUiOiB7CiAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAibG9jYWxlIjogImVuIgogICAgICAgIH0sCiAgICAgICAgImFuc3dlciI6IHsKICAgICAgICAgICJjbGFpbXMiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAiaWQiOiAib3BlbmluZ19ob3VycyIsCiAgICAgICAgICAgICAgInN0YXR1cyI6ICJjb3ZlcmVkIiwKICAgICAgICAgICAgICAiZmFjdElkcyI6IFsKICAgICAgICAgICAgICAgICI1NzQxMTM4NS1hYzdiLTQ4MWQtYTQ4ZS05MDI2ZTk4MGRiNTAiCiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAicmVhc29ucyI6IFtdCiAgICAgICAgICAgIH0KICAgICAgICAgIF0sCiAgICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfNDJmMjFlYTY3MzJlNGIxYjgzZjE4ZTk5Yjk2ZWYyM2EiLAogICAgICAgICAgInF1ZXN0aW9uSWQiOiAicGxhY2Vfb3BlbmluZ19ob3VycyIsCiAgICAgICAgICAicXVlc3Rpb25WZXJzaW9uIjogMQogICAgICAgIH0sCiAgICAgICAgInN0YXR1cyI6ICJhdmFpbGFibGUiLAogICAgICAgICJwdXJwb3NlIjogInRyaXBfcGxhbm5pbmciLAogICAgICAgICJyZWNpcGllbnQiOiAiZmlyc3RfcGFydHkiLAogICAgICAgICJ0ZXJyaXRvcnkiOiAiQ04tbWFpbmxhbmQiLAogICAgICAgICJzdGF0ZW1lbnRzIjogWwogICAgICAgICAgewogICAgICAgICAgICAidGV4dCI6ICJTeW50aGV0aWMgR2FsbGVyeSBvcGVucyBkdXJpbmcgdGhlIHB1Ymxpc2hlZCBkYXRlZCB3aW5kb3cuIiwKICAgICAgICAgICAgInBsYWNlIjogewogICAgICAgICAgICAgICJuYW1lcyI6IHsKICAgICAgICAgICAgICAgICJlbiI6ICJGaXh0dXJlIEdhbGxlcnkgYjk2ZWYyM2EiLAogICAgICAgICAgICAgICAgInpoIjogIuagt+S+i+WxlemmhmI5NmVmMjNhIgogICAgICAgICAgICAgIH0KICAgICAgICAgICAgfSwKICAgICAgICAgICAgInNjb3BlIjogewogICAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgICAiY2l0aWVzIjogWwogICAgICAgICAgICAgICAgInNoYW5naGFpIgogICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgImF1ZGllbmNlIjogImludGVybmF0aW9uYWxfaW5kZXBlbmRlbnRfdHJhdmVsZXIiCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJ2YWx1ZSI6IHsKICAgICAgICAgICAgICAiZW5kc0F0IjogIjIwMjYtMTAtMTVUMDk6MDA6MDBaIiwKICAgICAgICAgICAgICAic3RhcnRzQXQiOiAiMjAyNi0xMC0xNVQwMTowMDowMFoiLAogICAgICAgICAgICAgICJ0aW1lWm9uZSI6ICJBc2lhL1NoYW5naGFpIgogICAgICAgICAgICB9LAogICAgICAgICAgICAiZmFjdElkIjogIjU3NDExMzg1LWFjN2ItNDgxZC1hNDhlLTkwMjZlOTgwZGI1MCIsCiAgICAgICAgICAgICJzb3VyY2VzIjogWwogICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ1cmkiOiAidXJuOnZwajE1OnN5bnRoZXRpYzphZ2VudDAwNSIsCiAgICAgICAgICAgICAgICAibG9jYXRvciI6ICJMb2NhbCBjb250cm9sbGVkIHRlc3QiLAogICAgICAgICAgICAgICAgInB1Ymxpc2hlciI6ICJTeW50aGV0aWMgYXV0aG9yIiwKICAgICAgICAgICAgICAgICJzb3VyY2VLZXkiOiAiYWdlbnQwMDUtOWJmNDliNTMtMzQ1NS00N2U5LWI1YWEtMWI2N2E5ZWRmOGFiIiwKICAgICAgICAgICAgICAgICJyZXZpc2lvbkxhYmVsIjogInYxIiwKICAgICAgICAgICAgICAgICJzb3VyY2VSZXZpc2lvbklkIjogIjFjOWQ0MTU3LWQ1ZDMtNDU0Zi1iNDM4LWQ1MGFlYmIyNWQ3ZSIKICAgICAgICAgICAgICB9CiAgICAgICAgICAgIF0sCiAgICAgICAgICAgICJ2ZXJzaW9uIjogMSwKICAgICAgICAgICAgImFzc2VydGlvbiI6IHsKICAgICAgICAgICAgICAib2JqZWN0SWQiOiAib3BlbmluZ19ob3VycyIsCiAgICAgICAgICAgICAgInByZWRpY2F0ZSI6ICJvcGVuc19kdXJpbmciLAogICAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV80MmYyMWVhNjczMmU0YjFiODNmMThlOTliOTZlZjIzYSIsCiAgICAgICAgICAgICAgImNvbmRpdGlvbnMiOiBbCiAgICAgICAgICAgICAgICAiY3VycmVudF9kYXRlZF93aW5kb3ciCiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAiZXhjbHVzaW9ucyI6IFsKICAgICAgICAgICAgICAgICJub19ob2xpZGF5X2d1YXJhbnRlZSIKICAgICAgICAgICAgICBdCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJleHBpcmVzQXQiOiAiMjAyNi0xMC0xNlQxMDowOTo0OS41NjIrMDA6MDAiLAogICAgICAgICAgICAiY29uZGl0aW9ucyI6IFsKICAgICAgICAgICAgICAiQ3VycmVudCBkYXRlZCB3aW5kb3cgb25seSIKICAgICAgICAgICAgXSwKICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgIk5vIGhvbGlkYXkgZ3VhcmFudGVlIgogICAgICAgICAgICBdLAogICAgICAgICAgICAicmV2aWV3ZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjU1OTI3NCswMDowMCIsCiAgICAgICAgICAgICJhc3NlcnRpb25JZCI6ICIwZmNiOTQ4MC02OTVmLTQ0NGQtODI5ZC0wYTQyMmRkNGQ4OGIiLAogICAgICAgICAgICAicHVibGlzaGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS41NjY5MDgrMDA6MDAiLAogICAgICAgICAgICAiYXNzZXJ0aW9uUmV2aXNpb24iOiAxCiAgICAgICAgICB9CiAgICAgICAgXSwKICAgICAgICAiZXZhbHVhdGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS43MjU3MDYrMDA6MDAiLAogICAgICAgICJzY2hlbWFWZXJzaW9uIjogImtub3dsZWRnZS1hbnN3ZXIvMSIKICAgICAgfSwKICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICJwcm9qZWN0aW9uIjogImN1cnJlbnQiLAogICAgICAiY29tcGxldGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS42OTQxNTYrMDA6MDAiLAogICAgICAicmVxdWVzdFNjb3BlIjogInNpbmdsZSIsCiAgICAgICJwbGFjZVN1YmplY3RJZCI6ICJmaXh0dXJlXzQyZjIxZWE2NzMyZTRiMWI4M2YxOGU5OWI5NmVmMjNhIiwKICAgICAgIm9yaWdpbmFsT3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICJwbGFjZVJlc29sdXRpb24iOiAibWF0Y2hlZCIsCiAgICAgICJ1bmFuc3dlcmVkTmVlZHMiOiBbXQogICAgfSwKICAgICJ0dXJuSWQiOiAiMDgxMzQwNzktNzA4NS00YWFhLThiNWMtMWI5ZGY4MTI3MThlIiwKICAgICJvdXRjb21lIjogImFuc3dlcmVkIiwKICAgICJzY2hlbWFWZXJzaW9uIjogInRleHQtdHVybi12MSIsCiAgICAiY2Fub25pY2FsUGxhY2VQcm9vZiI6IHsKICAgICAgImJhc2lzIjogewogICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlXzQyZjIxZWE2NzMyZTRiMWI4M2YxOGU5OWI5NmVmMjNhIiwKICAgICAgICAic291cmNlRGlnZXN0IjogIjE1YzEwMDEyM2RlN2NiNGQxNmYxZTZlOWNmMjAwZGNiOTAxYjZjYjk1Y2I4YmIwZmUzZTY2ZDg4OTQ4M2RjOGMiCiAgICAgIH0sCiAgICAgICJzY29wZUlkIjogIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMiIsCiAgICAgICJvcGVyYXRpb24iOiB7CiAgICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAgICJzY29wZUlkIjogIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMiIsCiAgICAgICAgIm1lc3NhZ2VJZCI6IG51bGwsCiAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICJvcGVyYXRpb25JZCI6ICIzMTJhZGJkNC1jODg1LTRkZDctYmYyMS1kNTI1NTVmMjM0YzkiCiAgICAgIH0sCiAgICAgICJzY29wZUtpbmQiOiAidGhyZWFkIiwKICAgICAgImV4cGVjdGF0aW9uIjogewogICAgICAgICJsb2NhbGUiOiAiZW4iLAogICAgICAgICJ0cmlwSWQiOiAiZjQ0OWNkMjMtNzc5Zi00NDhhLWE0OTktODk3YTQ3MjE0MjQ2IiwKICAgICAgICAicHJvdmlkZXIiOiAiYW1hcCIsCiAgICAgICAgImhlYWRWZXJzaW9uIjogMCwKICAgICAgICAicmVmZXJlbmNlSWQiOiAiMWE5ZGIwNjMtY2NiZi00NDg1LWFkN2ItMWYxYWZmZjBmOWZkIiwKICAgICAgICAiY29udGV4dERpZ2VzdCI6ICJmYjY2N2ZhMDM5ZGQ5Njc5YmQyNzk3MzI2NTc0NWZlYzgwNGU2MjRhMzc5N2M2ODg3YWUwYzY0ZGUzMjU3ZGMxIiwKICAgICAgICAibWFwcGluZ0RpZ2VzdCI6ICI3YWJiMWEwZDE1MmQwN2ZlMWM1MmNjMjI2Y2ZjZTBjMTI3OTg2ODk0MzJmNjA4MTg2ZTc5MmJhN2NlNDYxMDJhIiwKICAgICAgICAicHJvdmlkZXJQb2lJZCI6ICJzZWxmLW9ubHktYWIwOTM4MmItYzE0Ni00ZDRjLWE1NTQtYTQ2ZWRmZjczMWVmIiwKICAgICAgICAiY2Fub25pY2FsUG9pSWQiOiAiYTg4NTI0NGUtMWFjNy00MmU3LThhNjQtMmMzYTE4M2I4OWVkIgogICAgICB9LAogICAgICAib3BlcmF0aW9uSWQiOiAiMzEyYWRiZDQtYzg4NS00ZGQ3LWJmMjEtZDUyNTU1ZjIzNGM5IiwKICAgICAgInJlcXVlc3REaWdlc3QiOiAiYmU5ZDBiOTU3MzIyY2VhODVjNzg0MDc3ZTYzMTY1NDE4NDgzYjE4ODZkMjM2M2NjYmUwNDcwOGNhMTY5ZjUwMSIsCiAgICAgICJzY2hlbWFWZXJzaW9uIjogImNhbm9uaWNhbC1wbGFjZS1wcm9vZi8xIiwKICAgICAgIm9yaWdpbmFsUmVjZWlwdCI6IHsKICAgICAgICAia2luZCI6ICJhY2NlcHRlZCIsCiAgICAgICAgInJldXNlZCI6IGZhbHNlLAogICAgICAgICJ0dXJuSWQiOiAiMDgxMzQwNzktNzA4NS00YWFhLThiNWMtMWI5ZGY4MTI3MThlIiwKICAgICAgICAidmVyc2lvbiI6IDIsCiAgICAgICAgInBhcmVudFR1cm5JZCI6IG51bGwsCiAgICAgICAgInJlbGF0aW9uc2hpcCI6ICJuZXdfZ29hbCIsCiAgICAgICAgInNjb3BlVmVyc2lvbiI6IDEsCiAgICAgICAgInNlcnZpY2VUYXNrSWQiOiAiNjE2ZWUyNGYtOWZlMS00YjUwLTg3MTktNzgxOTA3N2RlYTRmIgogICAgICB9CiAgICB9CiAgfSwKICAic3FsVGV4dEhpc3RvcnkiOiB7CiAgICAia2luZCI6ICJoaXN0b3J5IiwKICAgICJ0dXJucyI6IFsKICAgICAgewogICAgICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgIm91dHB1dCI6ICJyZXZpZXdlZC1hbnN3ZXItdjEiLAogICAgICAgICJyZXN1bHQiOiB7CiAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAidHlwZSI6ICJyZXZpZXdlZF9hbnN3ZXIiLAogICAgICAgICAgImludGVudCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICJrbm93bGVkZ2UiOiB7CiAgICAgICAgICAgICJzY29wZSI6IHsKICAgICAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAgICAgInNjZW5lIjogImF0dHJhY3Rpb24iLAogICAgICAgICAgICAgICJsb2NhbGUiOiAiZW4iCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJhbnN3ZXIiOiB7CiAgICAgICAgICAgICAgImNsYWltcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgImlkIjogIm9wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICAgICAic3RhdHVzIjogImNvdmVyZWQiLAogICAgICAgICAgICAgICAgICAiZmFjdElkcyI6IFsKICAgICAgICAgICAgICAgICAgICAiNTc0MTEzODUtYWM3Yi00ODFkLWE0OGUtOTAyNmU5ODBkYjUwIgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAicmVhc29ucyI6IFtdCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlXzQyZjIxZWE2NzMyZTRiMWI4M2YxOGU5OWI5NmVmMjNhIiwKICAgICAgICAgICAgICAicXVlc3Rpb25JZCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICAgICAicXVlc3Rpb25WZXJzaW9uIjogMQogICAgICAgICAgICB9LAogICAgICAgICAgICAic3RhdHVzIjogImF2YWlsYWJsZSIsCiAgICAgICAgICAgICJwdXJwb3NlIjogInRyaXBfcGxhbm5pbmciLAogICAgICAgICAgICAicmVjaXBpZW50IjogImZpcnN0X3BhcnR5IiwKICAgICAgICAgICAgInRlcnJpdG9yeSI6ICJDTi1tYWlubGFuZCIsCiAgICAgICAgICAgICJzdGF0ZW1lbnRzIjogWwogICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ0ZXh0IjogIlN5bnRoZXRpYyBHYWxsZXJ5IG9wZW5zIGR1cmluZyB0aGUgcHVibGlzaGVkIGRhdGVkIHdpbmRvdy4iLAogICAgICAgICAgICAgICAgInBsYWNlIjogewogICAgICAgICAgICAgICAgICAibmFtZXMiOiB7CiAgICAgICAgICAgICAgICAgICAgImVuIjogIkZpeHR1cmUgR2FsbGVyeSBiOTZlZjIzYSIsCiAgICAgICAgICAgICAgICAgICAgInpoIjogIuagt+S+i+WxlemmhmI5NmVmMjNhIgogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgInNjb3BlIjogewogICAgICAgICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICAgICAgICJjaXRpZXMiOiBbCiAgICAgICAgICAgICAgICAgICAgInNoYW5naGFpIgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAiYXVkaWVuY2UiOiAiaW50ZXJuYXRpb25hbF9pbmRlcGVuZGVudF90cmF2ZWxlciIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAidmFsdWUiOiB7CiAgICAgICAgICAgICAgICAgICJlbmRzQXQiOiAiMjAyNi0xMC0xNVQwOTowMDowMFoiLAogICAgICAgICAgICAgICAgICAic3RhcnRzQXQiOiAiMjAyNi0xMC0xNVQwMTowMDowMFoiLAogICAgICAgICAgICAgICAgICAidGltZVpvbmUiOiAiQXNpYS9TaGFuZ2hhaSIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAiZmFjdElkIjogIjU3NDExMzg1LWFjN2ItNDgxZC1hNDhlLTkwMjZlOTgwZGI1MCIsCiAgICAgICAgICAgICAgICAic291cmNlcyI6IFsKICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICJ1cmkiOiAidXJuOnZwajE1OnN5bnRoZXRpYzphZ2VudDAwNSIsCiAgICAgICAgICAgICAgICAgICAgImxvY2F0b3IiOiAiTG9jYWwgY29udHJvbGxlZCB0ZXN0IiwKICAgICAgICAgICAgICAgICAgICAicHVibGlzaGVyIjogIlN5bnRoZXRpYyBhdXRob3IiLAogICAgICAgICAgICAgICAgICAgICJzb3VyY2VLZXkiOiAiYWdlbnQwMDUtOWJmNDliNTMtMzQ1NS00N2U5LWI1YWEtMWI2N2E5ZWRmOGFiIiwKICAgICAgICAgICAgICAgICAgICAicmV2aXNpb25MYWJlbCI6ICJ2MSIsCiAgICAgICAgICAgICAgICAgICAgInNvdXJjZVJldmlzaW9uSWQiOiAiMWM5ZDQxNTctZDVkMy00NTRmLWI0MzgtZDUwYWViYjI1ZDdlIgogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgInZlcnNpb24iOiAxLAogICAgICAgICAgICAgICAgImFzc2VydGlvbiI6IHsKICAgICAgICAgICAgICAgICAgIm9iamVjdElkIjogIm9wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICAgICAicHJlZGljYXRlIjogIm9wZW5zX2R1cmluZyIsCiAgICAgICAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV80MmYyMWVhNjczMmU0YjFiODNmMThlOTliOTZlZjIzYSIsCiAgICAgICAgICAgICAgICAgICJjb25kaXRpb25zIjogWwogICAgICAgICAgICAgICAgICAgICJjdXJyZW50X2RhdGVkX3dpbmRvdyIKICAgICAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgICAgICAgIm5vX2hvbGlkYXlfZ3VhcmFudGVlIgogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgImV4cGlyZXNBdCI6ICIyMDI2LTEwLTE2VDEwOjA5OjQ5LjU2MiswMDowMCIsCiAgICAgICAgICAgICAgICAiY29uZGl0aW9ucyI6IFsKICAgICAgICAgICAgICAgICAgIkN1cnJlbnQgZGF0ZWQgd2luZG93IG9ubHkiCiAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgICAgICJObyBob2xpZGF5IGd1YXJhbnRlZSIKICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAicmV2aWV3ZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjU1OTI3NCswMDowMCIsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uSWQiOiAiMGZjYjk0ODAtNjk1Zi00NDRkLTgyOWQtMGE0MjJkZDRkODhiIiwKICAgICAgICAgICAgICAgICJwdWJsaXNoZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjU2NjkwOCswMDowMCIsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uUmV2aXNpb24iOiAxCiAgICAgICAgICAgICAgfQogICAgICAgICAgICBdLAogICAgICAgICAgICAiZXZhbHVhdGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS43NDA1KzAwOjAwIiwKICAgICAgICAgICAgInNjaGVtYVZlcnNpb24iOiAia25vd2xlZGdlLWFuc3dlci8xIgogICAgICAgICAgfSwKICAgICAgICAgICJwbGFjZU5hbWUiOiBudWxsLAogICAgICAgICAgInByb2plY3Rpb24iOiAiY3VycmVudCIsCiAgICAgICAgICAiY29tcGxldGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS42OTQxNTYrMDA6MDAiLAogICAgICAgICAgInJlcXVlc3RTY29wZSI6ICJzaW5nbGUiLAogICAgICAgICAgInBsYWNlU3ViamVjdElkIjogImZpeHR1cmVfNDJmMjFlYTY3MzJlNGIxYjgzZjE4ZTk5Yjk2ZWYyM2EiLAogICAgICAgICAgIm9yaWdpbmFsT3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAicGxhY2VSZXNvbHV0aW9uIjogIm1hdGNoZWQiLAogICAgICAgICAgInVuYW5zd2VyZWROZWVkcyI6IFtdCiAgICAgICAgfSwKICAgICAgICAic3RhdHVzIjogImNvbXBsZXRlZCIsCiAgICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAgICJvdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgICAidGhyZWFkSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAiY3JlYXRlZEF0IjogIjIwMjYtMTAtMTVUMTA6MDk6NDkuNjE3NjM0KzAwOjAwIiwKICAgICAgICAiY2Fub25pY2FsUGxhY2VQcm9vZiI6IHsKICAgICAgICAgICJiYXNpcyI6IHsKICAgICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV80MmYyMWVhNjczMmU0YjFiODNmMThlOTliOTZlZjIzYSIsCiAgICAgICAgICAgICJzb3VyY2VEaWdlc3QiOiAiMTVjMTAwMTIzZGU3Y2I0ZDE2ZjFlNmU5Y2YyMDBkY2I5MDFiNmNiOTVjYjhiYjBmZTNlNjZkODg5NDgzZGM4YyIKICAgICAgICAgIH0sCiAgICAgICAgICAic2NvcGVJZCI6ICI3NWZjMTRlZi1iZmIwLTQxZDEtOGMzMi02Mzg0MmY2M2FjZTIiLAogICAgICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAgICAgICAic2NvcGVJZCI6ICI3NWZjMTRlZi1iZmIwLTQxZDEtOGMzMi02Mzg0MmY2M2FjZTIiLAogICAgICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgICAib3BlcmF0aW9uSWQiOiAiMzEyYWRiZDQtYzg4NS00ZGQ3LWJmMjEtZDUyNTU1ZjIzNGM5IgogICAgICAgICAgfSwKICAgICAgICAgICJzY29wZUtpbmQiOiAidGhyZWFkIiwKICAgICAgICAgICJleHBlY3RhdGlvbiI6IHsKICAgICAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgICAgICJ0cmlwSWQiOiAiZjQ0OWNkMjMtNzc5Zi00NDhhLWE0OTktODk3YTQ3MjE0MjQ2IiwKICAgICAgICAgICAgInByb3ZpZGVyIjogImFtYXAiLAogICAgICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICAgICAicmVmZXJlbmNlSWQiOiAiMWE5ZGIwNjMtY2NiZi00NDg1LWFkN2ItMWYxYWZmZjBmOWZkIiwKICAgICAgICAgICAgImNvbnRleHREaWdlc3QiOiAiZmI2NjdmYTAzOWRkOTY3OWJkMjc5NzMyNjU3NDVmZWM4MDRlNjI0YTM3OTdjNjg4N2FlMGM2NGRlMzI1N2RjMSIsCiAgICAgICAgICAgICJtYXBwaW5nRGlnZXN0IjogIjdhYmIxYTBkMTUyZDA3ZmUxYzUyY2MyMjZjZmNlMGMxMjc5ODY4OTQzMmY2MDgxODZlNzkyYmE3Y2U0NjEwMmEiLAogICAgICAgICAgICAicHJvdmlkZXJQb2lJZCI6ICJzZWxmLW9ubHktYWIwOTM4MmItYzE0Ni00ZDRjLWE1NTQtYTQ2ZWRmZjczMWVmIiwKICAgICAgICAgICAgImNhbm9uaWNhbFBvaUlkIjogImE4ODUyNDRlLTFhYzctNDJlNy04YTY0LTJjM2ExODNiODllZCIKICAgICAgICAgIH0sCiAgICAgICAgICAib3BlcmF0aW9uSWQiOiAiMzEyYWRiZDQtYzg4NS00ZGQ3LWJmMjEtZDUyNTU1ZjIzNGM5IiwKICAgICAgICAgICJyZXF1ZXN0RGlnZXN0IjogImJlOWQwYjk1NzMyMmNlYTg1Yzc4NDA3N2U2MzE2NTQxODQ4M2IxODg2ZDIzNjNjY2JlMDQ3MDhjYTE2OWY1MDEiLAogICAgICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAgICAgIm9yaWdpbmFsUmVjZWlwdCI6IHsKICAgICAgICAgICAgImtpbmQiOiAiYWNjZXB0ZWQiLAogICAgICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgICAgICJ0dXJuSWQiOiAiMDgxMzQwNzktNzA4NS00YWFhLThiNWMtMWI5ZGY4MTI3MThlIiwKICAgICAgICAgICAgInZlcnNpb24iOiAyLAogICAgICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAgICAgInJlbGF0aW9uc2hpcCI6ICJuZXdfZ29hbCIsCiAgICAgICAgICAgICJzY29wZVZlcnNpb24iOiAxLAogICAgICAgICAgICAic2VydmljZVRhc2tJZCI6ICI2MTZlZTI0Zi05ZmUxLTRiNTAtODcxOS03ODE5MDc3ZGVhNGYiCiAgICAgICAgICB9CiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfSwKICAic3FsVGFza0hpc3RvcnkiOiB7CiAgICAia2luZCI6ICJoaXN0b3J5IiwKICAgICJ0dXJucyI6IFsKICAgICAgewogICAgICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgIm91dHB1dCI6ICJyZXZpZXdlZC1hbnN3ZXItdjEiLAogICAgICAgICJyZXN1bHQiOiB7CiAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAidHlwZSI6ICJyZXZpZXdlZF9hbnN3ZXIiLAogICAgICAgICAgImludGVudCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICJrbm93bGVkZ2UiOiB7CiAgICAgICAgICAgICJzY29wZSI6IHsKICAgICAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAgICAgInNjZW5lIjogImF0dHJhY3Rpb24iLAogICAgICAgICAgICAgICJsb2NhbGUiOiAiZW4iCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJhbnN3ZXIiOiB7CiAgICAgICAgICAgICAgImNsYWltcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgImlkIjogIm9wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICAgICAic3RhdHVzIjogImNvdmVyZWQiLAogICAgICAgICAgICAgICAgICAiZmFjdElkcyI6IFsKICAgICAgICAgICAgICAgICAgICAiNTc0MTEzODUtYWM3Yi00ODFkLWE0OGUtOTAyNmU5ODBkYjUwIgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAicmVhc29ucyI6IFtdCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlXzQyZjIxZWE2NzMyZTRiMWI4M2YxOGU5OWI5NmVmMjNhIiwKICAgICAgICAgICAgICAicXVlc3Rpb25JZCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICAgICAicXVlc3Rpb25WZXJzaW9uIjogMQogICAgICAgICAgICB9LAogICAgICAgICAgICAic3RhdHVzIjogImF2YWlsYWJsZSIsCiAgICAgICAgICAgICJwdXJwb3NlIjogInRyaXBfcGxhbm5pbmciLAogICAgICAgICAgICAicmVjaXBpZW50IjogImZpcnN0X3BhcnR5IiwKICAgICAgICAgICAgInRlcnJpdG9yeSI6ICJDTi1tYWlubGFuZCIsCiAgICAgICAgICAgICJzdGF0ZW1lbnRzIjogWwogICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ0ZXh0IjogIlN5bnRoZXRpYyBHYWxsZXJ5IG9wZW5zIGR1cmluZyB0aGUgcHVibGlzaGVkIGRhdGVkIHdpbmRvdy4iLAogICAgICAgICAgICAgICAgInBsYWNlIjogewogICAgICAgICAgICAgICAgICAibmFtZXMiOiB7CiAgICAgICAgICAgICAgICAgICAgImVuIjogIkZpeHR1cmUgR2FsbGVyeSBiOTZlZjIzYSIsCiAgICAgICAgICAgICAgICAgICAgInpoIjogIuagt+S+i+WxlemmhmI5NmVmMjNhIgogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgInNjb3BlIjogewogICAgICAgICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICAgICAgICJjaXRpZXMiOiBbCiAgICAgICAgICAgICAgICAgICAgInNoYW5naGFpIgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAiYXVkaWVuY2UiOiAiaW50ZXJuYXRpb25hbF9pbmRlcGVuZGVudF90cmF2ZWxlciIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAidmFsdWUiOiB7CiAgICAgICAgICAgICAgICAgICJlbmRzQXQiOiAiMjAyNi0xMC0xNVQwOTowMDowMFoiLAogICAgICAgICAgICAgICAgICAic3RhcnRzQXQiOiAiMjAyNi0xMC0xNVQwMTowMDowMFoiLAogICAgICAgICAgICAgICAgICAidGltZVpvbmUiOiAiQXNpYS9TaGFuZ2hhaSIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAiZmFjdElkIjogIjU3NDExMzg1LWFjN2ItNDgxZC1hNDhlLTkwMjZlOTgwZGI1MCIsCiAgICAgICAgICAgICAgICAic291cmNlcyI6IFsKICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICJ1cmkiOiAidXJuOnZwajE1OnN5bnRoZXRpYzphZ2VudDAwNSIsCiAgICAgICAgICAgICAgICAgICAgImxvY2F0b3IiOiAiTG9jYWwgY29udHJvbGxlZCB0ZXN0IiwKICAgICAgICAgICAgICAgICAgICAicHVibGlzaGVyIjogIlN5bnRoZXRpYyBhdXRob3IiLAogICAgICAgICAgICAgICAgICAgICJzb3VyY2VLZXkiOiAiYWdlbnQwMDUtOWJmNDliNTMtMzQ1NS00N2U5LWI1YWEtMWI2N2E5ZWRmOGFiIiwKICAgICAgICAgICAgICAgICAgICAicmV2aXNpb25MYWJlbCI6ICJ2MSIsCiAgICAgICAgICAgICAgICAgICAgInNvdXJjZVJldmlzaW9uSWQiOiAiMWM5ZDQxNTctZDVkMy00NTRmLWI0MzgtZDUwYWViYjI1ZDdlIgogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgInZlcnNpb24iOiAxLAogICAgICAgICAgICAgICAgImFzc2VydGlvbiI6IHsKICAgICAgICAgICAgICAgICAgIm9iamVjdElkIjogIm9wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICAgICAicHJlZGljYXRlIjogIm9wZW5zX2R1cmluZyIsCiAgICAgICAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV80MmYyMWVhNjczMmU0YjFiODNmMThlOTliOTZlZjIzYSIsCiAgICAgICAgICAgICAgICAgICJjb25kaXRpb25zIjogWwogICAgICAgICAgICAgICAgICAgICJjdXJyZW50X2RhdGVkX3dpbmRvdyIKICAgICAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgICAgICAgIm5vX2hvbGlkYXlfZ3VhcmFudGVlIgogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgImV4cGlyZXNBdCI6ICIyMDI2LTEwLTE2VDEwOjA5OjQ5LjU2MiswMDowMCIsCiAgICAgICAgICAgICAgICAiY29uZGl0aW9ucyI6IFsKICAgICAgICAgICAgICAgICAgIkN1cnJlbnQgZGF0ZWQgd2luZG93IG9ubHkiCiAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgICAgICJObyBob2xpZGF5IGd1YXJhbnRlZSIKICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAicmV2aWV3ZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjU1OTI3NCswMDowMCIsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uSWQiOiAiMGZjYjk0ODAtNjk1Zi00NDRkLTgyOWQtMGE0MjJkZDRkODhiIiwKICAgICAgICAgICAgICAgICJwdWJsaXNoZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjU2NjkwOCswMDowMCIsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uUmV2aXNpb24iOiAxCiAgICAgICAgICAgICAgfQogICAgICAgICAgICBdLAogICAgICAgICAgICAiZXZhbHVhdGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS43NTUyNTMrMDA6MDAiLAogICAgICAgICAgICAic2NoZW1hVmVyc2lvbiI6ICJrbm93bGVkZ2UtYW5zd2VyLzEiCiAgICAgICAgICB9LAogICAgICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICAgICAicHJvamVjdGlvbiI6ICJjdXJyZW50IiwKICAgICAgICAgICJjb21wbGV0ZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjY5NDE1NiswMDowMCIsCiAgICAgICAgICAicmVxdWVzdFNjb3BlIjogInNpbmdsZSIsCiAgICAgICAgICAicGxhY2VTdWJqZWN0SWQiOiAiZml4dHVyZV80MmYyMWVhNjczMmU0YjFiODNmMThlOTliOTZlZjIzYSIsCiAgICAgICAgICAib3JpZ2luYWxPdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgICAgICJwbGFjZVJlc29sdXRpb24iOiAibWF0Y2hlZCIsCiAgICAgICAgICAidW5hbnN3ZXJlZE5lZWRzIjogW10KICAgICAgICB9LAogICAgICAgICJzdGF0dXMiOiAiY29tcGxldGVkIiwKICAgICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICAgIm91dGNvbWUiOiAiYW5zd2VyZWQiLAogICAgICAgICJ0aHJlYWRJZCI6ICI3NWZjMTRlZi1iZmIwLTQxZDEtOGMzMi02Mzg0MmY2M2FjZTIiLAogICAgICAgICJjcmVhdGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS42MTc2MzQrMDA6MDAiLAogICAgICAgICJwYXJlbnRUdXJuSWQiOiBudWxsLAogICAgICAgICJyZWxhdGlvbnNoaXAiOiAibmV3X2dvYWwiLAogICAgICAgICJzY29wZVZlcnNpb24iOiAxLAogICAgICAgICJzZXJ2aWNlVGFza0lkIjogIjYxNmVlMjRmLTlmZTEtNGI1MC04NzE5LTc4MTkwNzdkZWE0ZiIsCiAgICAgICAgImNhbm9uaWNhbFBsYWNlUHJvb2YiOiB7CiAgICAgICAgICAiYmFzaXMiOiB7CiAgICAgICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAgICAgInNjZW5lIjogImF0dHJhY3Rpb24iLAogICAgICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfNDJmMjFlYTY3MzJlNGIxYjgzZjE4ZTk5Yjk2ZWYyM2EiLAogICAgICAgICAgICAic291cmNlRGlnZXN0IjogIjE1YzEwMDEyM2RlN2NiNGQxNmYxZTZlOWNmMjAwZGNiOTAxYjZjYjk1Y2I4YmIwZmUzZTY2ZDg4OTQ4M2RjOGMiCiAgICAgICAgICB9LAogICAgICAgICAgInNjb3BlSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICJvcGVyYXRpb24iOiB7CiAgICAgICAgICAgICJ0dXJuSWQiOiAiMDgxMzQwNzktNzA4NS00YWFhLThiNWMtMWI5ZGY4MTI3MThlIiwKICAgICAgICAgICAgInNjb3BlSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICAgIm1lc3NhZ2VJZCI6IG51bGwsCiAgICAgICAgICAgICJzY29wZUtpbmQiOiAidGhyZWFkIiwKICAgICAgICAgICAgIm9wZXJhdGlvbklkIjogIjMxMmFkYmQ0LWM4ODUtNGRkNy1iZjIxLWQ1MjU1NWYyMzRjOSIKICAgICAgICAgIH0sCiAgICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgICAiZXhwZWN0YXRpb24iOiB7CiAgICAgICAgICAgICJsb2NhbGUiOiAiZW4iLAogICAgICAgICAgICAidHJpcElkIjogImY0NDljZDIzLTc3OWYtNDQ4YS1hNDk5LTg5N2E0NzIxNDI0NiIsCiAgICAgICAgICAgICJwcm92aWRlciI6ICJhbWFwIiwKICAgICAgICAgICAgImhlYWRWZXJzaW9uIjogMCwKICAgICAgICAgICAgInJlZmVyZW5jZUlkIjogIjFhOWRiMDYzLWNjYmYtNDQ4NS1hZDdiLTFmMWFmZmYwZjlmZCIsCiAgICAgICAgICAgICJjb250ZXh0RGlnZXN0IjogImZiNjY3ZmEwMzlkZDk2NzliZDI3OTczMjY1NzQ1ZmVjODA0ZTYyNGEzNzk3YzY4ODdhZTBjNjRkZTMyNTdkYzEiLAogICAgICAgICAgICAibWFwcGluZ0RpZ2VzdCI6ICI3YWJiMWEwZDE1MmQwN2ZlMWM1MmNjMjI2Y2ZjZTBjMTI3OTg2ODk0MzJmNjA4MTg2ZTc5MmJhN2NlNDYxMDJhIiwKICAgICAgICAgICAgInByb3ZpZGVyUG9pSWQiOiAic2VsZi1vbmx5LWFiMDkzODJiLWMxNDYtNGQ0Yy1hNTU0LWE0NmVkZmY3MzFlZiIsCiAgICAgICAgICAgICJjYW5vbmljYWxQb2lJZCI6ICJhODg1MjQ0ZS0xYWM3LTQyZTctOGE2NC0yYzNhMTgzYjg5ZWQiCiAgICAgICAgICB9LAogICAgICAgICAgIm9wZXJhdGlvbklkIjogIjMxMmFkYmQ0LWM4ODUtNGRkNy1iZjIxLWQ1MjU1NWYyMzRjOSIsCiAgICAgICAgICAicmVxdWVzdERpZ2VzdCI6ICJiZTlkMGI5NTczMjJjZWE4NWM3ODQwNzdlNjMxNjU0MTg0ODNiMTg4NmQyMzYzY2NiZTA0NzA4Y2ExNjlmNTAxIiwKICAgICAgICAgICJzY2hlbWFWZXJzaW9uIjogImNhbm9uaWNhbC1wbGFjZS1wcm9vZi8xIiwKICAgICAgICAgICJvcmlnaW5hbFJlY2VpcHQiOiB7CiAgICAgICAgICAgICJraW5kIjogImFjY2VwdGVkIiwKICAgICAgICAgICAgInJldXNlZCI6IGZhbHNlLAogICAgICAgICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICAgICAgICJ2ZXJzaW9uIjogMiwKICAgICAgICAgICAgInBhcmVudFR1cm5JZCI6IG51bGwsCiAgICAgICAgICAgICJyZWxhdGlvbnNoaXAiOiAibmV3X2dvYWwiLAogICAgICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAgICAgInNlcnZpY2VUYXNrSWQiOiAiNjE2ZWUyNGYtOWZlMS00YjUwLTg3MTktNzgxOTA3N2RlYTRmIgogICAgICAgICAgfQogICAgICAgIH0KICAgICAgfQogICAgXQogIH0sCiAgIndpdGhkcmF3biI6IHsKICAgICJub3ciOiAxNzkyMDU4OTg5ODA0LAogICAgInNxbFJlYWQiOiB7CiAgICAgICJraW5kIjogInRleHQiLAogICAgICAiaW5wdXQiOiAiV2hhdCB0aW1lIGRvZXMgaXQgb3Blbj8iLAogICAgICAibG9jYWxlIjogImVuIiwKICAgICAgIm91dHB1dCI6ICJyZXZpZXdlZC1hbnN3ZXItdjEiLAogICAgICAicmVzdWx0IjogewogICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAidHlwZSI6ICJyZXZpZXdlZF9hbnN3ZXIiLAogICAgICAgICJpbnRlbnQiOiAicGxhY2Vfb3BlbmluZ19ob3VycyIsCiAgICAgICAgImtub3dsZWRnZSI6IG51bGwsCiAgICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICAgInByb2plY3Rpb24iOiAidW5hdmFpbGFibGUiLAogICAgICAgICJjb21wbGV0ZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjY5NDE1NiswMDowMCIsCiAgICAgICAgInJlcXVlc3RTY29wZSI6ICJzaW5nbGUiLAogICAgICAgICJwbGFjZVN1YmplY3RJZCI6ICJmaXh0dXJlXzQyZjIxZWE2NzMyZTRiMWI4M2YxOGU5OWI5NmVmMjNhIiwKICAgICAgICAib3JpZ2luYWxPdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgICAicGxhY2VSZXNvbHV0aW9uIjogIm1hdGNoZWQiLAogICAgICAgICJ1bmFuc3dlcmVkTmVlZHMiOiBbXQogICAgICB9LAogICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICJvdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgInNjaGVtYVZlcnNpb24iOiAidGV4dC10dXJuLXYxIiwKICAgICAgImNhbm9uaWNhbFBsYWNlUHJvb2YiOiB7CiAgICAgICAgImJhc2lzIjogewogICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgInNjZW5lIjogImF0dHJhY3Rpb24iLAogICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlXzQyZjIxZWE2NzMyZTRiMWI4M2YxOGU5OWI5NmVmMjNhIiwKICAgICAgICAgICJzb3VyY2VEaWdlc3QiOiAiMTVjMTAwMTIzZGU3Y2I0ZDE2ZjFlNmU5Y2YyMDBkY2I5MDFiNmNiOTVjYjhiYjBmZTNlNjZkODg5NDgzZGM4YyIKICAgICAgICB9LAogICAgICAgICJzY29wZUlkIjogIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMiIsCiAgICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAgICJ0dXJuSWQiOiAiMDgxMzQwNzktNzA4NS00YWFhLThiNWMtMWI5ZGY4MTI3MThlIiwKICAgICAgICAgICJzY29wZUlkIjogIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMiIsCiAgICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAgICJzY29wZUtpbmQiOiAidGhyZWFkIiwKICAgICAgICAgICJvcGVyYXRpb25JZCI6ICIzMTJhZGJkNC1jODg1LTRkZDctYmYyMS1kNTI1NTVmMjM0YzkiCiAgICAgICAgfSwKICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgImV4cGVjdGF0aW9uIjogewogICAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgICAidHJpcElkIjogImY0NDljZDIzLTc3OWYtNDQ4YS1hNDk5LTg5N2E0NzIxNDI0NiIsCiAgICAgICAgICAicHJvdmlkZXIiOiAiYW1hcCIsCiAgICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICAgInJlZmVyZW5jZUlkIjogIjFhOWRiMDYzLWNjYmYtNDQ4NS1hZDdiLTFmMWFmZmYwZjlmZCIsCiAgICAgICAgICAiY29udGV4dERpZ2VzdCI6ICJmYjY2N2ZhMDM5ZGQ5Njc5YmQyNzk3MzI2NTc0NWZlYzgwNGU2MjRhMzc5N2M2ODg3YWUwYzY0ZGUzMjU3ZGMxIiwKICAgICAgICAgICJtYXBwaW5nRGlnZXN0IjogIjdhYmIxYTBkMTUyZDA3ZmUxYzUyY2MyMjZjZmNlMGMxMjc5ODY4OTQzMmY2MDgxODZlNzkyYmE3Y2U0NjEwMmEiLAogICAgICAgICAgInByb3ZpZGVyUG9pSWQiOiAic2VsZi1vbmx5LWFiMDkzODJiLWMxNDYtNGQ0Yy1hNTU0LWE0NmVkZmY3MzFlZiIsCiAgICAgICAgICAiY2Fub25pY2FsUG9pSWQiOiAiYTg4NTI0NGUtMWFjNy00MmU3LThhNjQtMmMzYTE4M2I4OWVkIgogICAgICAgIH0sCiAgICAgICAgIm9wZXJhdGlvbklkIjogIjMxMmFkYmQ0LWM4ODUtNGRkNy1iZjIxLWQ1MjU1NWYyMzRjOSIsCiAgICAgICAgInJlcXVlc3REaWdlc3QiOiAiYmU5ZDBiOTU3MzIyY2VhODVjNzg0MDc3ZTYzMTY1NDE4NDgzYjE4ODZkMjM2M2NjYmUwNDcwOGNhMTY5ZjUwMSIsCiAgICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAgICJvcmlnaW5hbFJlY2VpcHQiOiB7CiAgICAgICAgICAia2luZCI6ICJhY2NlcHRlZCIsCiAgICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICAgICAidmVyc2lvbiI6IDIsCiAgICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAgICJyZWxhdGlvbnNoaXAiOiAibmV3X2dvYWwiLAogICAgICAgICAgInNjb3BlVmVyc2lvbiI6IDEsCiAgICAgICAgICAic2VydmljZVRhc2tJZCI6ICI2MTZlZTI0Zi05ZmUxLTRiNTAtODcxOS03ODE5MDc3ZGVhNGYiCiAgICAgICAgfQogICAgICB9CiAgICB9LAogICAgInNxbFRleHRIaXN0b3J5IjogewogICAgICAia2luZCI6ICJoaXN0b3J5IiwKICAgICAgInR1cm5zIjogWwogICAgICAgIHsKICAgICAgICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICAgICAibG9jYWxlIjogImVuIiwKICAgICAgICAgICJvdXRwdXQiOiAicmV2aWV3ZWQtYW5zd2VyLXYxIiwKICAgICAgICAgICJyZXN1bHQiOiB7CiAgICAgICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAgICAgInR5cGUiOiAicmV2aWV3ZWRfYW5zd2VyIiwKICAgICAgICAgICAgImludGVudCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICAgImtub3dsZWRnZSI6IG51bGwsCiAgICAgICAgICAgICJwbGFjZU5hbWUiOiBudWxsLAogICAgICAgICAgICAicHJvamVjdGlvbiI6ICJ1bmF2YWlsYWJsZSIsCiAgICAgICAgICAgICJjb21wbGV0ZWRBdCI6ICIyMDI2LTEwLTE1VDEwOjA5OjQ5LjY5NDE1NiswMDowMCIsCiAgICAgICAgICAgICJyZXF1ZXN0U2NvcGUiOiAic2luZ2xlIiwKICAgICAgICAgICAgInBsYWNlU3ViamVjdElkIjogImZpeHR1cmVfNDJmMjFlYTY3MzJlNGIxYjgzZjE4ZTk5Yjk2ZWYyM2EiLAogICAgICAgICAgICAib3JpZ2luYWxPdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgICAgICAgInBsYWNlUmVzb2x1dGlvbiI6ICJtYXRjaGVkIiwKICAgICAgICAgICAgInVuYW5zd2VyZWROZWVkcyI6IFtdCiAgICAgICAgICB9LAogICAgICAgICAgInN0YXR1cyI6ICJjb21wbGV0ZWQiLAogICAgICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAgICAgIm91dGNvbWUiOiAiYW5zd2VyZWQiLAogICAgICAgICAgInRocmVhZElkIjogIjc1ZmMxNGVmLWJmYjAtNDFkMS04YzMyLTYzODQyZjYzYWNlMiIsCiAgICAgICAgICAiY3JlYXRlZEF0IjogIjIwMjYtMTAtMTVUMTA6MDk6NDkuNjE3NjM0KzAwOjAwIiwKICAgICAgICAgICJjYW5vbmljYWxQbGFjZVByb29mIjogewogICAgICAgICAgICAiYmFzaXMiOiB7CiAgICAgICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfNDJmMjFlYTY3MzJlNGIxYjgzZjE4ZTk5Yjk2ZWYyM2EiLAogICAgICAgICAgICAgICJzb3VyY2VEaWdlc3QiOiAiMTVjMTAwMTIzZGU3Y2I0ZDE2ZjFlNmU5Y2YyMDBkY2I5MDFiNmNiOTVjYjhiYjBmZTNlNjZkODg5NDgzZGM4YyIKICAgICAgICAgICAgfSwKICAgICAgICAgICAgInNjb3BlSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAgICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICAgICAgICAgInNjb3BlSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgICAgICAgIm9wZXJhdGlvbklkIjogIjMxMmFkYmQ0LWM4ODUtNGRkNy1iZjIxLWQ1MjU1NWYyMzRjOSIKICAgICAgICAgICAgfSwKICAgICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgICAiZXhwZWN0YXRpb24iOiB7CiAgICAgICAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgICAgICAgInRyaXBJZCI6ICJmNDQ5Y2QyMy03NzlmLTQ0OGEtYTQ5OS04OTdhNDcyMTQyNDYiLAogICAgICAgICAgICAgICJwcm92aWRlciI6ICJhbWFwIiwKICAgICAgICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICAgICAgICJyZWZlcmVuY2VJZCI6ICIxYTlkYjA2My1jY2JmLTQ0ODUtYWQ3Yi0xZjFhZmZmMGY5ZmQiLAogICAgICAgICAgICAgICJjb250ZXh0RGlnZXN0IjogImZiNjY3ZmEwMzlkZDk2NzliZDI3OTczMjY1NzQ1ZmVjODA0ZTYyNGEzNzk3YzY4ODdhZTBjNjRkZTMyNTdkYzEiLAogICAgICAgICAgICAgICJtYXBwaW5nRGlnZXN0IjogIjdhYmIxYTBkMTUyZDA3ZmUxYzUyY2MyMjZjZmNlMGMxMjc5ODY4OTQzMmY2MDgxODZlNzkyYmE3Y2U0NjEwMmEiLAogICAgICAgICAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS1hYjA5MzgyYi1jMTQ2LTRkNGMtYTU1NC1hNDZlZGZmNzMxZWYiLAogICAgICAgICAgICAgICJjYW5vbmljYWxQb2lJZCI6ICJhODg1MjQ0ZS0xYWM3LTQyZTctOGE2NC0yYzNhMTgzYjg5ZWQiCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJvcGVyYXRpb25JZCI6ICIzMTJhZGJkNC1jODg1LTRkZDctYmYyMS1kNTI1NTVmMjM0YzkiLAogICAgICAgICAgICAicmVxdWVzdERpZ2VzdCI6ICJiZTlkMGI5NTczMjJjZWE4NWM3ODQwNzdlNjMxNjU0MTg0ODNiMTg4NmQyMzYzY2NiZTA0NzA4Y2ExNjlmNTAxIiwKICAgICAgICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAgICAgICAib3JpZ2luYWxSZWNlaXB0IjogewogICAgICAgICAgICAgICJraW5kIjogImFjY2VwdGVkIiwKICAgICAgICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAgICAgICAgICJ2ZXJzaW9uIjogMiwKICAgICAgICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAgICAgICAic2VydmljZVRhc2tJZCI6ICI2MTZlZTI0Zi05ZmUxLTRiNTAtODcxOS03ODE5MDc3ZGVhNGYiCiAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICB9CiAgICAgIF0KICAgIH0sCiAgICAic3FsVGFza0hpc3RvcnkiOiB7CiAgICAgICJraW5kIjogImhpc3RvcnkiLAogICAgICAidHVybnMiOiBbCiAgICAgICAgewogICAgICAgICAgImlucHV0IjogIldoYXQgdGltZSBkb2VzIGl0IG9wZW4/IiwKICAgICAgICAgICJsb2NhbGUiOiAiZW4iLAogICAgICAgICAgIm91dHB1dCI6ICJyZXZpZXdlZC1hbnN3ZXItdjEiLAogICAgICAgICAgInJlc3VsdCI6IHsKICAgICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgICAidHlwZSI6ICJyZXZpZXdlZF9hbnN3ZXIiLAogICAgICAgICAgICAiaW50ZW50IjogInBsYWNlX29wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAia25vd2xlZGdlIjogbnVsbCwKICAgICAgICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICAgICAgICJwcm9qZWN0aW9uIjogInVuYXZhaWxhYmxlIiwKICAgICAgICAgICAgImNvbXBsZXRlZEF0IjogIjIwMjYtMTAtMTVUMTA6MDk6NDkuNjk0MTU2KzAwOjAwIiwKICAgICAgICAgICAgInJlcXVlc3RTY29wZSI6ICJzaW5nbGUiLAogICAgICAgICAgICAicGxhY2VTdWJqZWN0SWQiOiAiZml4dHVyZV80MmYyMWVhNjczMmU0YjFiODNmMThlOTliOTZlZjIzYSIsCiAgICAgICAgICAgICJvcmlnaW5hbE91dGNvbWUiOiAiYW5zd2VyZWQiLAogICAgICAgICAgICAicGxhY2VSZXNvbHV0aW9uIjogIm1hdGNoZWQiLAogICAgICAgICAgICAidW5hbnN3ZXJlZE5lZWRzIjogW10KICAgICAgICAgIH0sCiAgICAgICAgICAic3RhdHVzIjogImNvbXBsZXRlZCIsCiAgICAgICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAidGhyZWFkSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICJjcmVhdGVkQXQiOiAiMjAyNi0xMC0xNVQxMDowOTo0OS42MTc2MzQrMDA6MDAiLAogICAgICAgICAgInBhcmVudFR1cm5JZCI6IG51bGwsCiAgICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAgICJzY29wZVZlcnNpb24iOiAxLAogICAgICAgICAgInNlcnZpY2VUYXNrSWQiOiAiNjE2ZWUyNGYtOWZlMS00YjUwLTg3MTktNzgxOTA3N2RlYTRmIiwKICAgICAgICAgICJjYW5vbmljYWxQbGFjZVByb29mIjogewogICAgICAgICAgICAiYmFzaXMiOiB7CiAgICAgICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfNDJmMjFlYTY3MzJlNGIxYjgzZjE4ZTk5Yjk2ZWYyM2EiLAogICAgICAgICAgICAgICJzb3VyY2VEaWdlc3QiOiAiMTVjMTAwMTIzZGU3Y2I0ZDE2ZjFlNmU5Y2YyMDBkY2I5MDFiNmNiOTVjYjhiYjBmZTNlNjZkODg5NDgzZGM4YyIKICAgICAgICAgICAgfSwKICAgICAgICAgICAgInNjb3BlSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAgICAgICAidHVybklkIjogIjA4MTM0MDc5LTcwODUtNGFhYS04YjVjLTFiOWRmODEyNzE4ZSIsCiAgICAgICAgICAgICAgInNjb3BlSWQiOiAiNzVmYzE0ZWYtYmZiMC00MWQxLThjMzItNjM4NDJmNjNhY2UyIiwKICAgICAgICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgICAgICAgIm9wZXJhdGlvbklkIjogIjMxMmFkYmQ0LWM4ODUtNGRkNy1iZjIxLWQ1MjU1NWYyMzRjOSIKICAgICAgICAgICAgfSwKICAgICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgICAiZXhwZWN0YXRpb24iOiB7CiAgICAgICAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgICAgICAgInRyaXBJZCI6ICJmNDQ5Y2QyMy03NzlmLTQ0OGEtYTQ5OS04OTdhNDcyMTQyNDYiLAogICAgICAgICAgICAgICJwcm92aWRlciI6ICJhbWFwIiwKICAgICAgICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICAgICAgICJyZWZlcmVuY2VJZCI6ICIxYTlkYjA2My1jY2JmLTQ0ODUtYWQ3Yi0xZjFhZmZmMGY5ZmQiLAogICAgICAgICAgICAgICJjb250ZXh0RGlnZXN0IjogImZiNjY3ZmEwMzlkZDk2NzliZDI3OTczMjY1NzQ1ZmVjODA0ZTYyNGEzNzk3YzY4ODdhZTBjNjRkZTMyNTdkYzEiLAogICAgICAgICAgICAgICJtYXBwaW5nRGlnZXN0IjogIjdhYmIxYTBkMTUyZDA3ZmUxYzUyY2MyMjZjZmNlMGMxMjc5ODY4OTQzMmY2MDgxODZlNzkyYmE3Y2U0NjEwMmEiLAogICAgICAgICAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS1hYjA5MzgyYi1jMTQ2LTRkNGMtYTU1NC1hNDZlZGZmNzMxZWYiLAogICAgICAgICAgICAgICJjYW5vbmljYWxQb2lJZCI6ICJhODg1MjQ0ZS0xYWM3LTQyZTctOGE2NC0yYzNhMTgzYjg5ZWQiCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJvcGVyYXRpb25JZCI6ICIzMTJhZGJkNC1jODg1LTRkZDctYmYyMS1kNTI1NTVmMjM0YzkiLAogICAgICAgICAgICAicmVxdWVzdERpZ2VzdCI6ICJiZTlkMGI5NTczMjJjZWE4NWM3ODQwNzdlNjMxNjU0MTg0ODNiMTg4NmQyMzYzY2NiZTA0NzA4Y2ExNjlmNTAxIiwKICAgICAgICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAgICAgICAib3JpZ2luYWxSZWNlaXB0IjogewogICAgICAgICAgICAgICJraW5kIjogImFjY2VwdGVkIiwKICAgICAgICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgICAgICAgInR1cm5JZCI6ICIwODEzNDA3OS03MDg1LTRhYWEtOGI1Yy0xYjlkZjgxMjcxOGUiLAogICAgICAgICAgICAgICJ2ZXJzaW9uIjogMiwKICAgICAgICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAgICAgICAic2VydmljZVRhc2tJZCI6ICI2MTZlZTI0Zi05ZmUxLTRiNTAtODcxOS03ODE5MDc3ZGVhNGYiCiAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICB9CiAgICAgIF0KICAgIH0KICB9Cn0K")!
}

// Exact ordinary-auth PG 198c66 fixture bytes; controlled transport is not real Auth.
nonisolated private enum CanonicalSQLPending {
    static let sha256 = "9ec1703a4fb904ea8930590792385264699691cfa5245766eda1df61921d8d17"
    static let data = Data(base64Encoded: "ewogICJvd25lciI6ICJmMWY0OWYwOS05Yzc1LTQ0YjMtYmI3Mi1jN2ZkZTVmNjQ2MDEiLAogICJub3ciOiAxNzkyMDU4OTkxNzU5LAogICJoaXN0b3J5IjogewogICAgImtpbmQiOiAiaGlzdG9yeSIsCiAgICAidHVybnMiOiBbCiAgICAgIHsKICAgICAgICAiaW5wdXQiOiAiV2hhdCB0aW1lIGRvZXMgaXQgb3Blbj8iLAogICAgICAgICJsb2NhbGUiOiAiZW4iLAogICAgICAgICJvdXRwdXQiOiBudWxsLAogICAgICAgICJyZXN1bHQiOiB7CiAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAidHlwZSI6ICJyZXZpZXdlZF9hbnN3ZXIiLAogICAgICAgICAgImludGVudCI6IG51bGwsCiAgICAgICAgICAia25vd2xlZGdlIjogbnVsbCwKICAgICAgICAgICJwbGFjZU5hbWUiOiBudWxsLAogICAgICAgICAgInByb2plY3Rpb24iOiAidW5hdmFpbGFibGUiLAogICAgICAgICAgImNvbXBsZXRlZEF0IjogbnVsbCwKICAgICAgICAgICJyZXF1ZXN0U2NvcGUiOiBudWxsLAogICAgICAgICAgInBsYWNlU3ViamVjdElkIjogbnVsbCwKICAgICAgICAgICJvcmlnaW5hbE91dGNvbWUiOiBudWxsLAogICAgICAgICAgInBsYWNlUmVzb2x1dGlvbiI6IG51bGwsCiAgICAgICAgICAidW5hbnN3ZXJlZE5lZWRzIjogbnVsbAogICAgICAgIH0sCiAgICAgICAgInN0YXR1cyI6ICJhY2NlcHRlZCIsCiAgICAgICAgInR1cm5JZCI6ICIyNjA1NGNlZS02OTliLTQ0MDYtYmI1Mi00NzljYTRjZWE2NGEiLAogICAgICAgICJvdXRjb21lIjogbnVsbCwKICAgICAgICAidGhyZWFkSWQiOiAiNTdlNTc2YjMtZjFiZC00ZjMzLThkMDAtNTBlN2E4YjgwZmY2IiwKICAgICAgICAiY3JlYXRlZEF0IjogIjIwMjYtMTAtMTVUMTA6MDk6NTEuNjkzNjkxKzAwOjAwIiwKICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAic2VydmljZVRhc2tJZCI6ICJjYjkxMjc5Ni0wMWI3LTQ5MjktOGE1Zi0xNTdiNzVjZmNkYTQiLAogICAgICAgICJjYW5vbmljYWxQbGFjZVByb29mIjogewogICAgICAgICAgImJhc2lzIjogewogICAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlX2IyYTBjOGJiNDBmNzQyYzdiOTA1OTM1YTljMzhlNjI0IiwKICAgICAgICAgICAgInNvdXJjZURpZ2VzdCI6ICI1NDQyODZhODdjNDZjODVlYWY4YzQwMzE2MjM5OTMxNjdiMTZmOTk4YTYwNDY1MjJlYWYyYWYwOWE4NmE3NjY1IgogICAgICAgICAgfSwKICAgICAgICAgICJzY29wZUlkIjogIjU3ZTU3NmIzLWYxYmQtNGYzMy04ZDAwLTUwZTdhOGI4MGZmNiIsCiAgICAgICAgICAib3BlcmF0aW9uIjogewogICAgICAgICAgICAidHVybklkIjogIjI2MDU0Y2VlLTY5OWItNDQwNi1iYjUyLTQ3OWNhNGNlYTY0YSIsCiAgICAgICAgICAgICJzY29wZUlkIjogIjU3ZTU3NmIzLWYxYmQtNGYzMy04ZDAwLTUwZTdhOGI4MGZmNiIsCiAgICAgICAgICAgICJtZXNzYWdlSWQiOiBudWxsLAogICAgICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgICAgICJvcGVyYXRpb25JZCI6ICJmNGVmZTdjOC0wZWQzLTRkMTQtYmJjOC1lNzU4YzExYmM0NjIiCiAgICAgICAgICB9LAogICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgImV4cGVjdGF0aW9uIjogewogICAgICAgICAgICAibG9jYWxlIjogImVuIiwKICAgICAgICAgICAgInRyaXBJZCI6ICIwYWFkNGVhNS03Y2E1LTRlZjItYjA2NC1mYmE0OTI5NTc2MTQiLAogICAgICAgICAgICAicHJvdmlkZXIiOiAiYW1hcCIsCiAgICAgICAgICAgICJoZWFkVmVyc2lvbiI6IDAsCiAgICAgICAgICAgICJyZWZlcmVuY2VJZCI6ICJkYmQzYjJiYy01NmM5LTRlOTUtYWE3YS1mNzQwMmIxYWRiN2UiLAogICAgICAgICAgICAiY29udGV4dERpZ2VzdCI6ICI0YTAzNjIwM2I5MTZjOWIxNmVkNTExZWFkN2E1MWQxZDBiNjNhYjk2MjhkYzdiNTU0YWIwMTQxOGVmODViZDIyIiwKICAgICAgICAgICAgIm1hcHBpbmdEaWdlc3QiOiAiY2RjMGJiNGFiZTQxNWU1OGJmZjYzM2RlYWY1NTQ5YTE4YzYzNTA0NTFjNDI1YTZjOWU1ZTU3Y2M5NjJlODBhZiIsCiAgICAgICAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS0zODA1OWUzZC00ZDJhLTQ4ZjktYTQzOC1hYzQyM2QzYjViMGIiLAogICAgICAgICAgICAiY2Fub25pY2FsUG9pSWQiOiAiYjExNjBmZTgtMzFiZS00MThmLWI4YmYtOTM2ZTg2N2FjOTI1IgogICAgICAgICAgfSwKICAgICAgICAgICJvcGVyYXRpb25JZCI6ICJmNGVmZTdjOC0wZWQzLTRkMTQtYmJjOC1lNzU4YzExYmM0NjIiLAogICAgICAgICAgInJlcXVlc3REaWdlc3QiOiAiNmYwZjZjMTY2YWZhYzgxYzkyMGQyNjA5ZTJkMmUzMTE4M2IzY2M0MzNhMGYyYmViZmJkZjViNGFiYzI3ZDBjNiIsCiAgICAgICAgICAic2NoZW1hVmVyc2lvbiI6ICJjYW5vbmljYWwtcGxhY2UtcHJvb2YvMSIsCiAgICAgICAgICAib3JpZ2luYWxSZWNlaXB0IjogewogICAgICAgICAgICAia2luZCI6ICJhY2NlcHRlZCIsCiAgICAgICAgICAgICJyZXVzZWQiOiBmYWxzZSwKICAgICAgICAgICAgInR1cm5JZCI6ICIyNjA1NGNlZS02OTliLTQ0MDYtYmI1Mi00NzljYTRjZWE2NGEiLAogICAgICAgICAgICAidmVyc2lvbiI6IDIsCiAgICAgICAgICAgICJwYXJlbnRUdXJuSWQiOiBudWxsLAogICAgICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAgICAgInNjb3BlVmVyc2lvbiI6IDEsCiAgICAgICAgICAgICJzZXJ2aWNlVGFza0lkIjogImNiOTEyNzk2LTAxYjctNDkyOS04YTVmLTE1N2I3NWNmY2RhNCIKICAgICAgICAgIH0KICAgICAgICB9CiAgICAgIH0KICAgIF0KICB9LAogICJjYW5jZWxsZWQiOiB7CiAgICAia2luZCI6ICJoaXN0b3J5IiwKICAgICJ0dXJucyI6IFsKICAgICAgewogICAgICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgIm91dHB1dCI6IG51bGwsCiAgICAgICAgInJlc3VsdCI6IHsKICAgICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAgICJ0eXBlIjogInJldmlld2VkX2Fuc3dlciIsCiAgICAgICAgICAiaW50ZW50IjogbnVsbCwKICAgICAgICAgICJrbm93bGVkZ2UiOiBudWxsLAogICAgICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICAgICAicHJvamVjdGlvbiI6ICJ1bmF2YWlsYWJsZSIsCiAgICAgICAgICAiY29tcGxldGVkQXQiOiBudWxsLAogICAgICAgICAgInJlcXVlc3RTY29wZSI6IG51bGwsCiAgICAgICAgICAicGxhY2VTdWJqZWN0SWQiOiBudWxsLAogICAgICAgICAgIm9yaWdpbmFsT3V0Y29tZSI6IG51bGwsCiAgICAgICAgICAicGxhY2VSZXNvbHV0aW9uIjogbnVsbCwKICAgICAgICAgICJ1bmFuc3dlcmVkTmVlZHMiOiBudWxsCiAgICAgICAgfSwKICAgICAgICAic3RhdHVzIjogImNhbmNlbGxlZCIsCiAgICAgICAgInR1cm5JZCI6ICIyNjA1NGNlZS02OTliLTQ0MDYtYmI1Mi00NzljYTRjZWE2NGEiLAogICAgICAgICJvdXRjb21lIjogbnVsbCwKICAgICAgICAidGhyZWFkSWQiOiAiNTdlNTc2YjMtZjFiZC00ZjMzLThkMDAtNTBlN2E4YjgwZmY2IiwKICAgICAgICAiY3JlYXRlZEF0IjogIjIwMjYtMTAtMTVUMTA6MDk6NTEuNjkzNjkxKzAwOjAwIiwKICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAic2VydmljZVRhc2tJZCI6ICJjYjkxMjc5Ni0wMWI3LTQ5MjktOGE1Zi0xNTdiNzVjZmNkYTQiLAogICAgICAgICJjYW5vbmljYWxQbGFjZVByb29mIjogewogICAgICAgICAgImJhc2lzIjogewogICAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlX2IyYTBjOGJiNDBmNzQyYzdiOTA1OTM1YTljMzhlNjI0IiwKICAgICAgICAgICAgInNvdXJjZURpZ2VzdCI6ICI1NDQyODZhODdjNDZjODVlYWY4YzQwMzE2MjM5OTMxNjdiMTZmOTk4YTYwNDY1MjJlYWYyYWYwOWE4NmE3NjY1IgogICAgICAgICAgfSwKICAgICAgICAgICJzY29wZUlkIjogIjU3ZTU3NmIzLWYxYmQtNGYzMy04ZDAwLTUwZTdhOGI4MGZmNiIsCiAgICAgICAgICAib3BlcmF0aW9uIjogewogICAgICAgICAgICAidHVybklkIjogIjI2MDU0Y2VlLTY5OWItNDQwNi1iYjUyLTQ3OWNhNGNlYTY0YSIsCiAgICAgICAgICAgICJzY29wZUlkIjogIjU3ZTU3NmIzLWYxYmQtNGYzMy04ZDAwLTUwZTdhOGI4MGZmNiIsCiAgICAgICAgICAgICJtZXNzYWdlSWQiOiBudWxsLAogICAgICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgICAgICJvcGVyYXRpb25JZCI6ICJmNGVmZTdjOC0wZWQzLTRkMTQtYmJjOC1lNzU4YzExYmM0NjIiCiAgICAgICAgICB9LAogICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgImV4cGVjdGF0aW9uIjogewogICAgICAgICAgICAibG9jYWxlIjogImVuIiwKICAgICAgICAgICAgInRyaXBJZCI6ICIwYWFkNGVhNS03Y2E1LTRlZjItYjA2NC1mYmE0OTI5NTc2MTQiLAogICAgICAgICAgICAicHJvdmlkZXIiOiAiYW1hcCIsCiAgICAgICAgICAgICJoZWFkVmVyc2lvbiI6IDAsCiAgICAgICAgICAgICJyZWZlcmVuY2VJZCI6ICJkYmQzYjJiYy01NmM5LTRlOTUtYWE3YS1mNzQwMmIxYWRiN2UiLAogICAgICAgICAgICAiY29udGV4dERpZ2VzdCI6ICI0YTAzNjIwM2I5MTZjOWIxNmVkNTExZWFkN2E1MWQxZDBiNjNhYjk2MjhkYzdiNTU0YWIwMTQxOGVmODViZDIyIiwKICAgICAgICAgICAgIm1hcHBpbmdEaWdlc3QiOiAiY2RjMGJiNGFiZTQxNWU1OGJmZjYzM2RlYWY1NTQ5YTE4YzYzNTA0NTFjNDI1YTZjOWU1ZTU3Y2M5NjJlODBhZiIsCiAgICAgICAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS0zODA1OWUzZC00ZDJhLTQ4ZjktYTQzOC1hYzQyM2QzYjViMGIiLAogICAgICAgICAgICAiY2Fub25pY2FsUG9pSWQiOiAiYjExNjBmZTgtMzFiZS00MThmLWI4YmYtOTM2ZTg2N2FjOTI1IgogICAgICAgICAgfSwKICAgICAgICAgICJvcGVyYXRpb25JZCI6ICJmNGVmZTdjOC0wZWQzLTRkMTQtYmJjOC1lNzU4YzExYmM0NjIiLAogICAgICAgICAgInJlcXVlc3REaWdlc3QiOiAiNmYwZjZjMTY2YWZhYzgxYzkyMGQyNjA5ZTJkMmUzMTE4M2IzY2M0MzNhMGYyYmViZmJkZjViNGFiYzI3ZDBjNiIsCiAgICAgICAgICAic2NoZW1hVmVyc2lvbiI6ICJjYW5vbmljYWwtcGxhY2UtcHJvb2YvMSIsCiAgICAgICAgICAib3JpZ2luYWxSZWNlaXB0IjogewogICAgICAgICAgICAia2luZCI6ICJhY2NlcHRlZCIsCiAgICAgICAgICAgICJyZXVzZWQiOiBmYWxzZSwKICAgICAgICAgICAgInR1cm5JZCI6ICIyNjA1NGNlZS02OTliLTQ0MDYtYmI1Mi00NzljYTRjZWE2NGEiLAogICAgICAgICAgICAidmVyc2lvbiI6IDIsCiAgICAgICAgICAgICJwYXJlbnRUdXJuSWQiOiBudWxsLAogICAgICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAgICAgInNjb3BlVmVyc2lvbiI6IDEsCiAgICAgICAgICAgICJzZXJ2aWNlVGFza0lkIjogImNiOTEyNzk2LTAxYjctNDkyOS04YTVmLTE1N2I3NWNmY2RhNCIKICAgICAgICAgIH0KICAgICAgICB9CiAgICAgIH0KICAgIF0KICB9Cn0K")!
}
