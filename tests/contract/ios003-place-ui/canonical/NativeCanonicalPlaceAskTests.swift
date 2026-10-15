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
    func withdrawSelectedHistory() { lock.withLock { withdrawnHistory = true } }
    func selectedHistory(_ value: Data) { lock.withLock { selectedHistory = value; historyFails = false; withdrawnHistory = false } }
    func failHistory() { lock.withLock { historyFails = true } }
    private let releaseGate = DispatchSemaphore(value: 0)
    var held: Bool { lock.withLock { enteredHold } }
    func shortLivedCredentials() { lock.withLock { shortCredentials = true } }
    func holdNextRefresh() { lock.withLock { holdRefresh = true; enteredHold = false } }
    func holdNextPlaceAsk() { lock.withLock { holdAsk = true; enteredHold = false } }
    func releaseHeld() { releaseGate.signal() }
    func reset(unknown: Bool = false) { lock.withLock { body = nil; count = 0; reads = 0; deny = false; self.unknown = unknown; shortCredentials = false; holdRefresh = false; holdAsk = false; enteredHold = false; selectedHistory = nil; historyFails = false; withdrawnHistory = false
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
            let historical = selectedHistory.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
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
            if path == "/api/chat/native/v2/turns", method == "GET" {
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
        #expect(!store.canonicalSelectedCurrent(turn.id, scope: session.dataScope) && store.turns.isEmpty && store.canonicalSelectedReadUnavailable)
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

// Exact ordinary-auth PG fixture bytes; C0 transport use is not a real Auth claim.
nonisolated private enum CanonicalSQLHistory {
    static let sha256 = "d7d12809d3575c3846d72a6c141854f63b49269d7511142fa36f20b78bf1197a"
    static let data = Data(base64Encoded: "ewogICJub3ciOiAxNzkyMDU3NDI1MTU0LAogICJvd25lciI6ICI2OWI2NjMzYS1mMTAwLTRlYjAtOTUyMS04NDU0MzAzNGRmMDYiLAogICJsaW1pdCI6IDIwLAogICJyZXF1ZXN0Qnl0ZXMiOiAie1wic2NoZW1hVmVyc2lvblwiOlwiY2Fub25pY2FsLXBsYWNlLWFzay8xXCIsXCJzdWJtaXNzaW9uXCI6e1widGhyZWFkSWRcIjpcImZlMTEwNWFkLTcyMGMtNDcxYy04MjQwLTk4MDg5MzljZWNkMlwiLFwidHVybklkXCI6XCIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTRcIixcImlkZW1wb3RlbmN5S2V5XCI6XCIyNTFiNTcyMy01NWNhLTQ4MTEtOTYwMi01NjQ2ZWRlMjlkYzdcIixcInBvbGljeUlkXCI6XCIyMGJjMWRhMC0wYmY2LTRjNjctYWRhYi1hYTZkYWI4Y2YxZGZcIixcImxvY2FsZVwiOlwiZW5cIixcInRleHRcIjpcIldoYXQgdGltZSBkb2VzIGl0IG9wZW4/XCIsXCJzZXJ2aWNlVGFza1wiOntcImlkXCI6XCIzYmFmZTMwNy1iZTAwLTQyZjgtOTg2MS1iOTY2OWM2MTE2YWJcIixcInNjb3BlVmVyc2lvblwiOjEsXCJyZWxhdGlvbnNoaXBcIjpcIm5ld19nb2FsXCIsXCJwYXJlbnRUdXJuSWRcIjpudWxsfX0sXCJleHBlY3RhdGlvblwiOntcInRyaXBJZFwiOlwiNDY4Mzg4N2YtYzVhNC00NWM3LWE2MmItZDdlN2ZkZjIyYzk2XCIsXCJoZWFkVmVyc2lvblwiOjAsXCJjYW5vbmljYWxQb2lJZFwiOlwiN2U5YzRlMzYtNDY3MS00ZDkzLTk2M2MtNjBiZTg3YzMyMTQ1XCIsXCJwcm92aWRlclwiOlwiYW1hcFwiLFwicHJvdmlkZXJQb2lJZFwiOlwic2VsZi1vbmx5LTRiZTc4MzZjLTY4NzEtNDM5My05MjMwLWI5ZGQ4OTU3ZjgyOVwiLFwibWFwcGluZ0RpZ2VzdFwiOlwiYzAwYzZiNGI1OWUxNzQwZWQzNzI1NTFmMGQ2YTNmY2Y0MmI0YTAzYThlNTYxMzMyYTA0M2U5NWI2Y2FiYTA5OVwiLFwiY29udGV4dERpZ2VzdFwiOlwiYTk2YjRmMWM5ZGY5MTcxNTk5NjBkOTg0ZjJmNjc2NzkwOTc1ZTVmYWU3OTY3ZTY5MzM1MTg5MTU3MDg5Njg4ZVwiLFwicmVmZXJlbmNlSWRcIjpcImViNjVlMmM1LTc5ZDktNDA5OS04ZGZhLTE3OGQwZmZhN2FmOFwiLFwibG9jYWxlXCI6XCJlblwifX0iLAogICJyZXF1ZXN0IjogewogICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLWFzay8xIiwKICAgICJzdWJtaXNzaW9uIjogewogICAgICAidGhyZWFkSWQiOiAiZmUxMTA1YWQtNzIwYy00NzFjLTgyNDAtOTgwODkzOWNlY2QyIiwKICAgICAgInR1cm5JZCI6ICIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTQiLAogICAgICAiaWRlbXBvdGVuY3lLZXkiOiAiMjUxYjU3MjMtNTVjYS00ODExLTk2MDItNTY0NmVkZTI5ZGM3IiwKICAgICAgInBvbGljeUlkIjogIjIwYmMxZGEwLTBiZjYtNGM2Ny1hZGFiLWFhNmRhYjhjZjFkZiIsCiAgICAgICJsb2NhbGUiOiAiZW4iLAogICAgICAidGV4dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICJzZXJ2aWNlVGFzayI6IHsKICAgICAgICAiaWQiOiAiM2JhZmUzMDctYmUwMC00MmY4LTk4NjEtYjk2NjljNjExNmFiIiwKICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAicGFyZW50VHVybklkIjogbnVsbAogICAgICB9CiAgICB9LAogICAgImV4cGVjdGF0aW9uIjogewogICAgICAidHJpcElkIjogIjQ2ODM4ODdmLWM1YTQtNDVjNy1hNjJiLWQ3ZTdmZGYyMmM5NiIsCiAgICAgICJoZWFkVmVyc2lvbiI6IDAsCiAgICAgICJjYW5vbmljYWxQb2lJZCI6ICI3ZTljNGUzNi00NjcxLTRkOTMtOTYzYy02MGJlODdjMzIxNDUiLAogICAgICAicHJvdmlkZXIiOiAiYW1hcCIsCiAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS00YmU3ODM2Yy02ODcxLTQzOTMtOTIzMC1iOWRkODk1N2Y4MjkiLAogICAgICAibWFwcGluZ0RpZ2VzdCI6ICJjMDBjNmI0YjU5ZTE3NDBlZDM3MjU1MWYwZDZhM2ZjZjQyYjRhMDNhOGU1NjEzMzJhMDQzZTk1YjZjYWJhMDk5IiwKICAgICAgImNvbnRleHREaWdlc3QiOiAiYTk2YjRmMWM5ZGY5MTcxNTk5NjBkOTg0ZjJmNjc2NzkwOTc1ZTVmYWU3OTY3ZTY5MzM1MTg5MTU3MDg5Njg4ZSIsCiAgICAgICJyZWZlcmVuY2VJZCI6ICJlYjY1ZTJjNS03OWQ5LTQwOTktOGRmYS0xNzhkMGZmYTdhZjgiLAogICAgICAibG9jYWxlIjogImVuIgogICAgfQogIH0sCiAgImFjY2VwdGVkIjogewogICAgImtpbmQiOiAiYWNjZXB0ZWQiLAogICAgImJpbmRpbmciOiB7CiAgICAgICJnb2FsSWQiOiBudWxsLAogICAgICAidHVybklkIjogIjMzMjRjZDE0LTdjNTYtNDEyNC04MzFiLWNmZTk1MmEyODIxNCIsCiAgICAgICJleHBlY3RhdGlvbiI6IHsKICAgICAgICAibG9jYWxlIjogImVuIiwKICAgICAgICAidHJpcElkIjogIjQ2ODM4ODdmLWM1YTQtNDVjNy1hNjJiLWQ3ZTdmZGYyMmM5NiIsCiAgICAgICAgInByb3ZpZGVyIjogImFtYXAiLAogICAgICAgICJoZWFkVmVyc2lvbiI6IDAsCiAgICAgICAgInJlZmVyZW5jZUlkIjogImViNjVlMmM1LTc5ZDktNDA5OS04ZGZhLTE3OGQwZmZhN2FmOCIsCiAgICAgICAgImNvbnRleHREaWdlc3QiOiAiYTk2YjRmMWM5ZGY5MTcxNTk5NjBkOTg0ZjJmNjc2NzkwOTc1ZTVmYWU3OTY3ZTY5MzM1MTg5MTU3MDg5Njg4ZSIsCiAgICAgICAgIm1hcHBpbmdEaWdlc3QiOiAiYzAwYzZiNGI1OWUxNzQwZWQzNzI1NTFmMGQ2YTNmY2Y0MmI0YTAzYThlNTYxMzMyYTA0M2U5NWI2Y2FiYTA5OSIsCiAgICAgICAgInByb3ZpZGVyUG9pSWQiOiAic2VsZi1vbmx5LTRiZTc4MzZjLTY4NzEtNDM5My05MjMwLWI5ZGQ4OTU3ZjgyOSIsCiAgICAgICAgImNhbm9uaWNhbFBvaUlkIjogIjdlOWM0ZTM2LTQ2NzEtNGQ5My05NjNjLTYwYmU4N2MzMjE0NSIKICAgICAgfSwKICAgICAgImdvYWxWZXJzaW9uIjogbnVsbCwKICAgICAgInJlcXVlc3REaWdlc3QiOiAiYThiMzA1N2FkOWVjMjc1MzhkZTQzMGMyYTM4ZmYwMjkxMjFjZjQ3OWVmYmNiMDUxNzNlNGJiMDRhMTk3NDM5ZCIsCiAgICAgICJzZXJ2aWNlVGFza0lkIjogIjNiYWZlMzA3LWJlMDAtNDJmOC05ODYxLWI5NjY5YzYxMTZhYiIKICAgIH0sCiAgICAib3BlcmF0aW9uIjogewogICAgICAidHVybklkIjogIjMzMjRjZDE0LTdjNTYtNDEyNC04MzFiLWNmZTk1MmEyODIxNCIsCiAgICAgICJzY29wZUlkIjogImZlMTEwNWFkLTcyMGMtNDcxYy04MjQwLTk4MDg5MzljZWNkMiIsCiAgICAgICJtZXNzYWdlSWQiOiBudWxsLAogICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICJvcGVyYXRpb25JZCI6ICIyNTFiNTcyMy01NWNhLTQ4MTEtOTYwMi01NjQ2ZWRlMjlkYzciCiAgICB9LAogICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLWFzay8xIiwKICAgICJvcmlnaW5hbFJlY2VpcHQiOiB7CiAgICAgICJraW5kIjogImFjY2VwdGVkIiwKICAgICAgInJldXNlZCI6IGZhbHNlLAogICAgICAidHVybklkIjogIjMzMjRjZDE0LTdjNTYtNDEyNC04MzFiLWNmZTk1MmEyODIxNCIsCiAgICAgICJ2ZXJzaW9uIjogMiwKICAgICAgInBhcmVudFR1cm5JZCI6IG51bGwsCiAgICAgICJyZWxhdGlvbnNoaXAiOiAibmV3X2dvYWwiLAogICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgInNlcnZpY2VUYXNrSWQiOiAiM2JhZmUzMDctYmUwMC00MmY4LTk4NjEtYjk2NjljNjExNmFiIgogICAgfSwKICAgICJyZWFkeUZvclByb3ZpZGVyIjogZmFsc2UsCiAgICAiY3VycmVudEVsaWdpYmlsaXR5UmVxdWlyZXNSZWFkIjogdHJ1ZQogIH0sCiAgInNxbFJlYWQiOiB7CiAgICAia2luZCI6ICJ0ZXh0IiwKICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAibG9jYWxlIjogImVuIiwKICAgICJvdXRwdXQiOiAicmV2aWV3ZWQtYW5zd2VyLXYxIiwKICAgICJyZXN1bHQiOiB7CiAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgInR5cGUiOiAicmV2aWV3ZWRfYW5zd2VyIiwKICAgICAgImludGVudCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgImtub3dsZWRnZSI6IHsKICAgICAgICAic2NvcGUiOiB7CiAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAibG9jYWxlIjogImVuIgogICAgICAgIH0sCiAgICAgICAgImFuc3dlciI6IHsKICAgICAgICAgICJjbGFpbXMiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAiaWQiOiAib3BlbmluZ19ob3VycyIsCiAgICAgICAgICAgICAgInN0YXR1cyI6ICJjb3ZlcmVkIiwKICAgICAgICAgICAgICAiZmFjdElkcyI6IFsKICAgICAgICAgICAgICAgICI3NTFmZjk1OS0yZjU1LTQ1YmYtODNjNC0wZmJkZmJiOTBiNzMiCiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAicmVhc29ucyI6IFtdCiAgICAgICAgICAgIH0KICAgICAgICAgIF0sCiAgICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfMWM4NWRmNTM2MzI2NGRlY2EzOGQxNGIyZmVhMTJlNTciLAogICAgICAgICAgInF1ZXN0aW9uSWQiOiAicGxhY2Vfb3BlbmluZ19ob3VycyIsCiAgICAgICAgICAicXVlc3Rpb25WZXJzaW9uIjogMQogICAgICAgIH0sCiAgICAgICAgInN0YXR1cyI6ICJhdmFpbGFibGUiLAogICAgICAgICJwdXJwb3NlIjogInRyaXBfcGxhbm5pbmciLAogICAgICAgICJyZWNpcGllbnQiOiAiZmlyc3RfcGFydHkiLAogICAgICAgICJ0ZXJyaXRvcnkiOiAiQ04tbWFpbmxhbmQiLAogICAgICAgICJzdGF0ZW1lbnRzIjogWwogICAgICAgICAgewogICAgICAgICAgICAidGV4dCI6ICJTeW50aGV0aWMgR2FsbGVyeSBvcGVucyBkdXJpbmcgdGhlIHB1Ymxpc2hlZCBkYXRlZCB3aW5kb3cuIiwKICAgICAgICAgICAgInBsYWNlIjogewogICAgICAgICAgICAgICJuYW1lcyI6IHsKICAgICAgICAgICAgICAgICJlbiI6ICJGaXh0dXJlIEdhbGxlcnkgZmVhMTJlNTciLAogICAgICAgICAgICAgICAgInpoIjogIuagt+S+i+WxlemmhmZlYTEyZTU3IgogICAgICAgICAgICAgIH0KICAgICAgICAgICAgfSwKICAgICAgICAgICAgInNjb3BlIjogewogICAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgICAiY2l0aWVzIjogWwogICAgICAgICAgICAgICAgInNoYW5naGFpIgogICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgImF1ZGllbmNlIjogImludGVybmF0aW9uYWxfaW5kZXBlbmRlbnRfdHJhdmVsZXIiCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJ2YWx1ZSI6IHsKICAgICAgICAgICAgICAiZW5kc0F0IjogIjIwMjYtMTAtMTVUMDk6MDA6MDBaIiwKICAgICAgICAgICAgICAic3RhcnRzQXQiOiAiMjAyNi0xMC0xNVQwMTowMDowMFoiLAogICAgICAgICAgICAgICJ0aW1lWm9uZSI6ICJBc2lhL1NoYW5naGFpIgogICAgICAgICAgICB9LAogICAgICAgICAgICAiZmFjdElkIjogIjc1MWZmOTU5LTJmNTUtNDViZi04M2M0LTBmYmRmYmI5MGI3MyIsCiAgICAgICAgICAgICJzb3VyY2VzIjogWwogICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ1cmkiOiAidXJuOnZwajE1OnN5bnRoZXRpYzphZ2VudDAwNSIsCiAgICAgICAgICAgICAgICAibG9jYXRvciI6ICJMb2NhbCBjb250cm9sbGVkIHRlc3QiLAogICAgICAgICAgICAgICAgInB1Ymxpc2hlciI6ICJTeW50aGV0aWMgYXV0aG9yIiwKICAgICAgICAgICAgICAgICJzb3VyY2VLZXkiOiAiYWdlbnQwMDUtZGEyYzRhNTQtM2EzNi00YWFjLTlhZGItNjc3NzUyNzI4ZjQzIiwKICAgICAgICAgICAgICAgICJyZXZpc2lvbkxhYmVsIjogInYxIiwKICAgICAgICAgICAgICAgICJzb3VyY2VSZXZpc2lvbklkIjogImY1NjI2ZDZhLTRhM2EtNGYxNi05MTM4LWY5MDlmM2I3NGYyYyIKICAgICAgICAgICAgICB9CiAgICAgICAgICAgIF0sCiAgICAgICAgICAgICJ2ZXJzaW9uIjogMSwKICAgICAgICAgICAgImFzc2VydGlvbiI6IHsKICAgICAgICAgICAgICAib2JqZWN0SWQiOiAib3BlbmluZ19ob3VycyIsCiAgICAgICAgICAgICAgInByZWRpY2F0ZSI6ICJvcGVuc19kdXJpbmciLAogICAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV8xYzg1ZGY1MzYzMjY0ZGVjYTM4ZDE0YjJmZWExMmU1NyIsCiAgICAgICAgICAgICAgImNvbmRpdGlvbnMiOiBbCiAgICAgICAgICAgICAgICAiY3VycmVudF9kYXRlZF93aW5kb3ciCiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAiZXhjbHVzaW9ucyI6IFsKICAgICAgICAgICAgICAgICJub19ob2xpZGF5X2d1YXJhbnRlZSIKICAgICAgICAgICAgICBdCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJleHBpcmVzQXQiOiAiMjAyNi0xMC0xNlQwOTo0Mzo0NC45MzQrMDA6MDAiLAogICAgICAgICAgICAiY29uZGl0aW9ucyI6IFsKICAgICAgICAgICAgICAiQ3VycmVudCBkYXRlZCB3aW5kb3cgb25seSIKICAgICAgICAgICAgXSwKICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgIk5vIGhvbGlkYXkgZ3VhcmFudGVlIgogICAgICAgICAgICBdLAogICAgICAgICAgICAicmV2aWV3ZWRBdCI6ICIyMDI2LTEwLTE1VDA5OjQzOjQ0LjkyODg0NiswMDowMCIsCiAgICAgICAgICAgICJhc3NlcnRpb25JZCI6ICJmNDEyOGJkMC0xZDFhLTQ5OTEtOGVlNS1kMjEzMWVlNTNiNmIiLAogICAgICAgICAgICAicHVibGlzaGVkQXQiOiAiMjAyNi0xMC0xNVQwOTo0Mzo0NC45NDAwMjErMDA6MDAiLAogICAgICAgICAgICAiYXNzZXJ0aW9uUmV2aXNpb24iOiAxCiAgICAgICAgICB9CiAgICAgICAgXSwKICAgICAgICAiZXZhbHVhdGVkQXQiOiAiMjAyNi0xMC0xNVQwOTo0Mzo0NS4xMjEwOTcrMDA6MDAiLAogICAgICAgICJzY2hlbWFWZXJzaW9uIjogImtub3dsZWRnZS1hbnN3ZXIvMSIKICAgICAgfSwKICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICJwcm9qZWN0aW9uIjogImN1cnJlbnQiLAogICAgICAiY29tcGxldGVkQXQiOiAiMjAyNi0xMC0xNVQwOTo0Mzo0NS4wODY0NCswMDowMCIsCiAgICAgICJyZXF1ZXN0U2NvcGUiOiAic2luZ2xlIiwKICAgICAgInBsYWNlU3ViamVjdElkIjogImZpeHR1cmVfMWM4NWRmNTM2MzI2NGRlY2EzOGQxNGIyZmVhMTJlNTciLAogICAgICAib3JpZ2luYWxPdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgInBsYWNlUmVzb2x1dGlvbiI6ICJtYXRjaGVkIiwKICAgICAgInVuYW5zd2VyZWROZWVkcyI6IFtdCiAgICB9LAogICAgInR1cm5JZCI6ICIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTQiLAogICAgIm91dGNvbWUiOiAiYW5zd2VyZWQiLAogICAgInNjaGVtYVZlcnNpb24iOiAidGV4dC10dXJuLXYxIiwKICAgICJjYW5vbmljYWxQbGFjZVByb29mIjogewogICAgICAiYmFzaXMiOiB7CiAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfMWM4NWRmNTM2MzI2NGRlY2EzOGQxNGIyZmVhMTJlNTciLAogICAgICAgICJzb3VyY2VEaWdlc3QiOiAiNzliYTQ3YzBlMjkwNWQyNzlmNzcxNDE0ZjM5ZDM5ZDI4MGY5YTY1YjM1ODZlY2MzNGFhNWI5NDU3NjI1NjgxZCIKICAgICAgfSwKICAgICAgInNjb3BlSWQiOiAiZmUxMTA1YWQtNzIwYy00NzFjLTgyNDAtOTgwODkzOWNlY2QyIiwKICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAidHVybklkIjogIjMzMjRjZDE0LTdjNTYtNDEyNC04MzFiLWNmZTk1MmEyODIxNCIsCiAgICAgICAgInNjb3BlSWQiOiAiZmUxMTA1YWQtNzIwYy00NzFjLTgyNDAtOTgwODkzOWNlY2QyIiwKICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAic2NvcGVLaW5kIjogInRocmVhZCIsCiAgICAgICAgIm9wZXJhdGlvbklkIjogIjI1MWI1NzIzLTU1Y2EtNDgxMS05NjAyLTU2NDZlZGUyOWRjNyIKICAgICAgfSwKICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAiZXhwZWN0YXRpb24iOiB7CiAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgInRyaXBJZCI6ICI0NjgzODg3Zi1jNWE0LTQ1YzctYTYyYi1kN2U3ZmRmMjJjOTYiLAogICAgICAgICJwcm92aWRlciI6ICJhbWFwIiwKICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICJyZWZlcmVuY2VJZCI6ICJlYjY1ZTJjNS03OWQ5LTQwOTktOGRmYS0xNzhkMGZmYTdhZjgiLAogICAgICAgICJjb250ZXh0RGlnZXN0IjogImE5NmI0ZjFjOWRmOTE3MTU5OTYwZDk4NGYyZjY3Njc5MDk3NWU1ZmFlNzk2N2U2OTMzNTE4OTE1NzA4OTY4OGUiLAogICAgICAgICJtYXBwaW5nRGlnZXN0IjogImMwMGM2YjRiNTllMTc0MGVkMzcyNTUxZjBkNmEzZmNmNDJiNGEwM2E4ZTU2MTMzMmEwNDNlOTViNmNhYmEwOTkiLAogICAgICAgICJwcm92aWRlclBvaUlkIjogInNlbGYtb25seS00YmU3ODM2Yy02ODcxLTQzOTMtOTIzMC1iOWRkODk1N2Y4MjkiLAogICAgICAgICJjYW5vbmljYWxQb2lJZCI6ICI3ZTljNGUzNi00NjcxLTRkOTMtOTYzYy02MGJlODdjMzIxNDUiCiAgICAgIH0sCiAgICAgICJvcGVyYXRpb25JZCI6ICIyNTFiNTcyMy01NWNhLTQ4MTEtOTYwMi01NjQ2ZWRlMjlkYzciLAogICAgICAicmVxdWVzdERpZ2VzdCI6ICJhOGIzMDU3YWQ5ZWMyNzUzOGRlNDMwYzJhMzhmZjAyOTEyMWNmNDc5ZWZiY2IwNTE3M2U0YmIwNGExOTc0MzlkIiwKICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAib3JpZ2luYWxSZWNlaXB0IjogewogICAgICAgICJraW5kIjogImFjY2VwdGVkIiwKICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgInR1cm5JZCI6ICIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTQiLAogICAgICAgICJ2ZXJzaW9uIjogMiwKICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAicmVsYXRpb25zaGlwIjogIm5ld19nb2FsIiwKICAgICAgICAic2NvcGVWZXJzaW9uIjogMSwKICAgICAgICAic2VydmljZVRhc2tJZCI6ICIzYmFmZTMwNy1iZTAwLTQyZjgtOTg2MS1iOTY2OWM2MTE2YWIiCiAgICAgIH0KICAgIH0KICB9LAogICJzcWxUZXh0SGlzdG9yeSI6IHsKICAgICJraW5kIjogImhpc3RvcnkiLAogICAgInR1cm5zIjogWwogICAgICB7CiAgICAgICAgImlucHV0IjogIldoYXQgdGltZSBkb2VzIGl0IG9wZW4/IiwKICAgICAgICAibG9jYWxlIjogImVuIiwKICAgICAgICAib3V0cHV0IjogInJldmlld2VkLWFuc3dlci12MSIsCiAgICAgICAgInJlc3VsdCI6IHsKICAgICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAgICJ0eXBlIjogInJldmlld2VkX2Fuc3dlciIsCiAgICAgICAgICAiaW50ZW50IjogInBsYWNlX29wZW5pbmdfaG91cnMiLAogICAgICAgICAgImtub3dsZWRnZSI6IHsKICAgICAgICAgICAgInNjb3BlIjogewogICAgICAgICAgICAgICJjaXR5IjogInNoYW5naGFpIiwKICAgICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICAgImxvY2FsZSI6ICJlbiIKICAgICAgICAgICAgfSwKICAgICAgICAgICAgImFuc3dlciI6IHsKICAgICAgICAgICAgICAiY2xhaW1zIjogWwogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAiaWQiOiAib3BlbmluZ19ob3VycyIsCiAgICAgICAgICAgICAgICAgICJzdGF0dXMiOiAiY292ZXJlZCIsCiAgICAgICAgICAgICAgICAgICJmYWN0SWRzIjogWwogICAgICAgICAgICAgICAgICAgICI3NTFmZjk1OS0yZjU1LTQ1YmYtODNjNC0wZmJkZmJiOTBiNzMiCiAgICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAgICJyZWFzb25zIjogW10KICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICJvdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgICAgICAgICAic3ViamVjdElkIjogImZpeHR1cmVfMWM4NWRmNTM2MzI2NGRlY2EzOGQxNGIyZmVhMTJlNTciLAogICAgICAgICAgICAgICJxdWVzdGlvbklkIjogInBsYWNlX29wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICJxdWVzdGlvblZlcnNpb24iOiAxCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJzdGF0dXMiOiAiYXZhaWxhYmxlIiwKICAgICAgICAgICAgInB1cnBvc2UiOiAidHJpcF9wbGFubmluZyIsCiAgICAgICAgICAgICJyZWNpcGllbnQiOiAiZmlyc3RfcGFydHkiLAogICAgICAgICAgICAidGVycml0b3J5IjogIkNOLW1haW5sYW5kIiwKICAgICAgICAgICAgInN0YXRlbWVudHMiOiBbCiAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgInRleHQiOiAiU3ludGhldGljIEdhbGxlcnkgb3BlbnMgZHVyaW5nIHRoZSBwdWJsaXNoZWQgZGF0ZWQgd2luZG93LiIsCiAgICAgICAgICAgICAgICAicGxhY2UiOiB7CiAgICAgICAgICAgICAgICAgICJuYW1lcyI6IHsKICAgICAgICAgICAgICAgICAgICAiZW4iOiAiRml4dHVyZSBHYWxsZXJ5IGZlYTEyZTU3IiwKICAgICAgICAgICAgICAgICAgICAiemgiOiAi5qC35L6L5bGV6aaGZmVhMTJlNTciCiAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAic2NvcGUiOiB7CiAgICAgICAgICAgICAgICAgICJzY2VuZSI6ICJhdHRyYWN0aW9uIiwKICAgICAgICAgICAgICAgICAgImNpdGllcyI6IFsKICAgICAgICAgICAgICAgICAgICAic2hhbmdoYWkiCiAgICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAgICJhdWRpZW5jZSI6ICJpbnRlcm5hdGlvbmFsX2luZGVwZW5kZW50X3RyYXZlbGVyIgogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICJ2YWx1ZSI6IHsKICAgICAgICAgICAgICAgICAgImVuZHNBdCI6ICIyMDI2LTEwLTE1VDA5OjAwOjAwWiIsCiAgICAgICAgICAgICAgICAgICJzdGFydHNBdCI6ICIyMDI2LTEwLTE1VDAxOjAwOjAwWiIsCiAgICAgICAgICAgICAgICAgICJ0aW1lWm9uZSI6ICJBc2lhL1NoYW5naGFpIgogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICJmYWN0SWQiOiAiNzUxZmY5NTktMmY1NS00NWJmLTgzYzQtMGZiZGZiYjkwYjczIiwKICAgICAgICAgICAgICAgICJzb3VyY2VzIjogWwogICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgInVyaSI6ICJ1cm46dnBqMTU6c3ludGhldGljOmFnZW50MDA1IiwKICAgICAgICAgICAgICAgICAgICAibG9jYXRvciI6ICJMb2NhbCBjb250cm9sbGVkIHRlc3QiLAogICAgICAgICAgICAgICAgICAgICJwdWJsaXNoZXIiOiAiU3ludGhldGljIGF1dGhvciIsCiAgICAgICAgICAgICAgICAgICAgInNvdXJjZUtleSI6ICJhZ2VudDAwNS1kYTJjNGE1NC0zYTM2LTRhYWMtOWFkYi02Nzc3NTI3MjhmNDMiLAogICAgICAgICAgICAgICAgICAgICJyZXZpc2lvbkxhYmVsIjogInYxIiwKICAgICAgICAgICAgICAgICAgICAic291cmNlUmV2aXNpb25JZCI6ICJmNTYyNmQ2YS00YTNhLTRmMTYtOTEzOC1mOTA5ZjNiNzRmMmMiCiAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAidmVyc2lvbiI6IDEsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uIjogewogICAgICAgICAgICAgICAgICAib2JqZWN0SWQiOiAib3BlbmluZ19ob3VycyIsCiAgICAgICAgICAgICAgICAgICJwcmVkaWNhdGUiOiAib3BlbnNfZHVyaW5nIiwKICAgICAgICAgICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlXzFjODVkZjUzNjMyNjRkZWNhMzhkMTRiMmZlYTEyZTU3IiwKICAgICAgICAgICAgICAgICAgImNvbmRpdGlvbnMiOiBbCiAgICAgICAgICAgICAgICAgICAgImN1cnJlbnRfZGF0ZWRfd2luZG93IgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAiZXhjbHVzaW9ucyI6IFsKICAgICAgICAgICAgICAgICAgICAibm9faG9saWRheV9ndWFyYW50ZWUiCiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAiZXhwaXJlc0F0IjogIjIwMjYtMTAtMTZUMDk6NDM6NDQuOTM0KzAwOjAwIiwKICAgICAgICAgICAgICAgICJjb25kaXRpb25zIjogWwogICAgICAgICAgICAgICAgICAiQ3VycmVudCBkYXRlZCB3aW5kb3cgb25seSIKICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAiZXhjbHVzaW9ucyI6IFsKICAgICAgICAgICAgICAgICAgIk5vIGhvbGlkYXkgZ3VhcmFudGVlIgogICAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAgICJyZXZpZXdlZEF0IjogIjIwMjYtMTAtMTVUMDk6NDM6NDQuOTI4ODQ2KzAwOjAwIiwKICAgICAgICAgICAgICAgICJhc3NlcnRpb25JZCI6ICJmNDEyOGJkMC0xZDFhLTQ5OTEtOGVlNS1kMjEzMWVlNTNiNmIiLAogICAgICAgICAgICAgICAgInB1Ymxpc2hlZEF0IjogIjIwMjYtMTAtMTVUMDk6NDM6NDQuOTQwMDIxKzAwOjAwIiwKICAgICAgICAgICAgICAgICJhc3NlcnRpb25SZXZpc2lvbiI6IDEKICAgICAgICAgICAgICB9CiAgICAgICAgICAgIF0sCiAgICAgICAgICAgICJldmFsdWF0ZWRBdCI6ICIyMDI2LTEwLTE1VDA5OjQzOjQ1LjEzNjIwMiswMDowMCIsCiAgICAgICAgICAgICJzY2hlbWFWZXJzaW9uIjogImtub3dsZWRnZS1hbnN3ZXIvMSIKICAgICAgICAgIH0sCiAgICAgICAgICAicGxhY2VOYW1lIjogbnVsbCwKICAgICAgICAgICJwcm9qZWN0aW9uIjogImN1cnJlbnQiLAogICAgICAgICAgImNvbXBsZXRlZEF0IjogIjIwMjYtMTAtMTVUMDk6NDM6NDUuMDg2NDQrMDA6MDAiLAogICAgICAgICAgInJlcXVlc3RTY29wZSI6ICJzaW5nbGUiLAogICAgICAgICAgInBsYWNlU3ViamVjdElkIjogImZpeHR1cmVfMWM4NWRmNTM2MzI2NGRlY2EzOGQxNGIyZmVhMTJlNTciLAogICAgICAgICAgIm9yaWdpbmFsT3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAicGxhY2VSZXNvbHV0aW9uIjogIm1hdGNoZWQiLAogICAgICAgICAgInVuYW5zd2VyZWROZWVkcyI6IFtdCiAgICAgICAgfSwKICAgICAgICAic3RhdHVzIjogImNvbXBsZXRlZCIsCiAgICAgICAgInR1cm5JZCI6ICIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTQiLAogICAgICAgICJvdXRjb21lIjogImFuc3dlcmVkIiwKICAgICAgICAidGhyZWFkSWQiOiAiZmUxMTA1YWQtNzIwYy00NzFjLTgyNDAtOTgwODkzOWNlY2QyIiwKICAgICAgICAiY3JlYXRlZEF0IjogIjIwMjYtMTAtMTVUMDk6NDM6NDUuMDAyMjU2KzAwOjAwIiwKICAgICAgICAiY2Fub25pY2FsUGxhY2VQcm9vZiI6IHsKICAgICAgICAgICJiYXNpcyI6IHsKICAgICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV8xYzg1ZGY1MzYzMjY0ZGVjYTM4ZDE0YjJmZWExMmU1NyIsCiAgICAgICAgICAgICJzb3VyY2VEaWdlc3QiOiAiNzliYTQ3YzBlMjkwNWQyNzlmNzcxNDE0ZjM5ZDM5ZDI4MGY5YTY1YjM1ODZlY2MzNGFhNWI5NDU3NjI1NjgxZCIKICAgICAgICAgIH0sCiAgICAgICAgICAic2NvcGVJZCI6ICJmZTExMDVhZC03MjBjLTQ3MWMtODI0MC05ODA4OTM5Y2VjZDIiLAogICAgICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAgICAgInR1cm5JZCI6ICIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTQiLAogICAgICAgICAgICAic2NvcGVJZCI6ICJmZTExMDVhZC03MjBjLTQ3MWMtODI0MC05ODA4OTM5Y2VjZDIiLAogICAgICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgICAib3BlcmF0aW9uSWQiOiAiMjUxYjU3MjMtNTVjYS00ODExLTk2MDItNTY0NmVkZTI5ZGM3IgogICAgICAgICAgfSwKICAgICAgICAgICJzY29wZUtpbmQiOiAidGhyZWFkIiwKICAgICAgICAgICJleHBlY3RhdGlvbiI6IHsKICAgICAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgICAgICJ0cmlwSWQiOiAiNDY4Mzg4N2YtYzVhNC00NWM3LWE2MmItZDdlN2ZkZjIyYzk2IiwKICAgICAgICAgICAgInByb3ZpZGVyIjogImFtYXAiLAogICAgICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICAgICAicmVmZXJlbmNlSWQiOiAiZWI2NWUyYzUtNzlkOS00MDk5LThkZmEtMTc4ZDBmZmE3YWY4IiwKICAgICAgICAgICAgImNvbnRleHREaWdlc3QiOiAiYTk2YjRmMWM5ZGY5MTcxNTk5NjBkOTg0ZjJmNjc2NzkwOTc1ZTVmYWU3OTY3ZTY5MzM1MTg5MTU3MDg5Njg4ZSIsCiAgICAgICAgICAgICJtYXBwaW5nRGlnZXN0IjogImMwMGM2YjRiNTllMTc0MGVkMzcyNTUxZjBkNmEzZmNmNDJiNGEwM2E4ZTU2MTMzMmEwNDNlOTViNmNhYmEwOTkiLAogICAgICAgICAgICAicHJvdmlkZXJQb2lJZCI6ICJzZWxmLW9ubHktNGJlNzgzNmMtNjg3MS00MzkzLTkyMzAtYjlkZDg5NTdmODI5IiwKICAgICAgICAgICAgImNhbm9uaWNhbFBvaUlkIjogIjdlOWM0ZTM2LTQ2NzEtNGQ5My05NjNjLTYwYmU4N2MzMjE0NSIKICAgICAgICAgIH0sCiAgICAgICAgICAib3BlcmF0aW9uSWQiOiAiMjUxYjU3MjMtNTVjYS00ODExLTk2MDItNTY0NmVkZTI5ZGM3IiwKICAgICAgICAgICJyZXF1ZXN0RGlnZXN0IjogImE4YjMwNTdhZDllYzI3NTM4ZGU0MzBjMmEzOGZmMDI5MTIxY2Y0NzllZmJjYjA1MTczZTRiYjA0YTE5NzQzOWQiLAogICAgICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAgICAgIm9yaWdpbmFsUmVjZWlwdCI6IHsKICAgICAgICAgICAgImtpbmQiOiAiYWNjZXB0ZWQiLAogICAgICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgICAgICJ0dXJuSWQiOiAiMzMyNGNkMTQtN2M1Ni00MTI0LTgzMWItY2ZlOTUyYTI4MjE0IiwKICAgICAgICAgICAgInZlcnNpb24iOiAyLAogICAgICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAgICAgInJlbGF0aW9uc2hpcCI6ICJuZXdfZ29hbCIsCiAgICAgICAgICAgICJzY29wZVZlcnNpb24iOiAxLAogICAgICAgICAgICAic2VydmljZVRhc2tJZCI6ICIzYmFmZTMwNy1iZTAwLTQyZjgtOTg2MS1iOTY2OWM2MTE2YWIiCiAgICAgICAgICB9CiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfSwKICAic3FsVGFza0hpc3RvcnkiOiB7CiAgICAia2luZCI6ICJoaXN0b3J5IiwKICAgICJ0dXJucyI6IFsKICAgICAgewogICAgICAgICJpbnB1dCI6ICJXaGF0IHRpbWUgZG9lcyBpdCBvcGVuPyIsCiAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgIm91dHB1dCI6ICJyZXZpZXdlZC1hbnN3ZXItdjEiLAogICAgICAgICJyZXN1bHQiOiB7CiAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAidHlwZSI6ICJyZXZpZXdlZF9hbnN3ZXIiLAogICAgICAgICAgImludGVudCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICJrbm93bGVkZ2UiOiB7CiAgICAgICAgICAgICJzY29wZSI6IHsKICAgICAgICAgICAgICAiY2l0eSI6ICJzaGFuZ2hhaSIsCiAgICAgICAgICAgICAgInNjZW5lIjogImF0dHJhY3Rpb24iLAogICAgICAgICAgICAgICJsb2NhbGUiOiAiZW4iCiAgICAgICAgICAgIH0sCiAgICAgICAgICAgICJhbnN3ZXIiOiB7CiAgICAgICAgICAgICAgImNsYWltcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgImlkIjogIm9wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICAgICAic3RhdHVzIjogImNvdmVyZWQiLAogICAgICAgICAgICAgICAgICAiZmFjdElkcyI6IFsKICAgICAgICAgICAgICAgICAgICAiNzUxZmY5NTktMmY1NS00NWJmLTgzYzQtMGZiZGZiYjkwYjczIgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAicmVhc29ucyI6IFtdCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgICAgICAgInN1YmplY3RJZCI6ICJmaXh0dXJlXzFjODVkZjUzNjMyNjRkZWNhMzhkMTRiMmZlYTEyZTU3IiwKICAgICAgICAgICAgICAicXVlc3Rpb25JZCI6ICJwbGFjZV9vcGVuaW5nX2hvdXJzIiwKICAgICAgICAgICAgICAicXVlc3Rpb25WZXJzaW9uIjogMQogICAgICAgICAgICB9LAogICAgICAgICAgICAic3RhdHVzIjogImF2YWlsYWJsZSIsCiAgICAgICAgICAgICJwdXJwb3NlIjogInRyaXBfcGxhbm5pbmciLAogICAgICAgICAgICAicmVjaXBpZW50IjogImZpcnN0X3BhcnR5IiwKICAgICAgICAgICAgInRlcnJpdG9yeSI6ICJDTi1tYWlubGFuZCIsCiAgICAgICAgICAgICJzdGF0ZW1lbnRzIjogWwogICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ0ZXh0IjogIlN5bnRoZXRpYyBHYWxsZXJ5IG9wZW5zIGR1cmluZyB0aGUgcHVibGlzaGVkIGRhdGVkIHdpbmRvdy4iLAogICAgICAgICAgICAgICAgInBsYWNlIjogewogICAgICAgICAgICAgICAgICAibmFtZXMiOiB7CiAgICAgICAgICAgICAgICAgICAgImVuIjogIkZpeHR1cmUgR2FsbGVyeSBmZWExMmU1NyIsCiAgICAgICAgICAgICAgICAgICAgInpoIjogIuagt+S+i+WxlemmhmZlYTEyZTU3IgogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgInNjb3BlIjogewogICAgICAgICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICAgICAgICJjaXRpZXMiOiBbCiAgICAgICAgICAgICAgICAgICAgInNoYW5naGFpIgogICAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgICAiYXVkaWVuY2UiOiAiaW50ZXJuYXRpb25hbF9pbmRlcGVuZGVudF90cmF2ZWxlciIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAidmFsdWUiOiB7CiAgICAgICAgICAgICAgICAgICJlbmRzQXQiOiAiMjAyNi0xMC0xNVQwOTowMDowMFoiLAogICAgICAgICAgICAgICAgICAic3RhcnRzQXQiOiAiMjAyNi0xMC0xNVQwMTowMDowMFoiLAogICAgICAgICAgICAgICAgICAidGltZVpvbmUiOiAiQXNpYS9TaGFuZ2hhaSIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAiZmFjdElkIjogIjc1MWZmOTU5LTJmNTUtNDViZi04M2M0LTBmYmRmYmI5MGI3MyIsCiAgICAgICAgICAgICAgICAic291cmNlcyI6IFsKICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICJ1cmkiOiAidXJuOnZwajE1OnN5bnRoZXRpYzphZ2VudDAwNSIsCiAgICAgICAgICAgICAgICAgICAgImxvY2F0b3IiOiAiTG9jYWwgY29udHJvbGxlZCB0ZXN0IiwKICAgICAgICAgICAgICAgICAgICAicHVibGlzaGVyIjogIlN5bnRoZXRpYyBhdXRob3IiLAogICAgICAgICAgICAgICAgICAgICJzb3VyY2VLZXkiOiAiYWdlbnQwMDUtZGEyYzRhNTQtM2EzNi00YWFjLTlhZGItNjc3NzUyNzI4ZjQzIiwKICAgICAgICAgICAgICAgICAgICAicmV2aXNpb25MYWJlbCI6ICJ2MSIsCiAgICAgICAgICAgICAgICAgICAgInNvdXJjZVJldmlzaW9uSWQiOiAiZjU2MjZkNmEtNGEzYS00ZjE2LTkxMzgtZjkwOWYzYjc0ZjJjIgogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgInZlcnNpb24iOiAxLAogICAgICAgICAgICAgICAgImFzc2VydGlvbiI6IHsKICAgICAgICAgICAgICAgICAgIm9iamVjdElkIjogIm9wZW5pbmdfaG91cnMiLAogICAgICAgICAgICAgICAgICAicHJlZGljYXRlIjogIm9wZW5zX2R1cmluZyIsCiAgICAgICAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV8xYzg1ZGY1MzYzMjY0ZGVjYTM4ZDE0YjJmZWExMmU1NyIsCiAgICAgICAgICAgICAgICAgICJjb25kaXRpb25zIjogWwogICAgICAgICAgICAgICAgICAgICJjdXJyZW50X2RhdGVkX3dpbmRvdyIKICAgICAgICAgICAgICAgICAgXSwKICAgICAgICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgICAgICAgIm5vX2hvbGlkYXlfZ3VhcmFudGVlIgogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgImV4cGlyZXNBdCI6ICIyMDI2LTEwLTE2VDA5OjQzOjQ0LjkzNCswMDowMCIsCiAgICAgICAgICAgICAgICAiY29uZGl0aW9ucyI6IFsKICAgICAgICAgICAgICAgICAgIkN1cnJlbnQgZGF0ZWQgd2luZG93IG9ubHkiCiAgICAgICAgICAgICAgICBdLAogICAgICAgICAgICAgICAgImV4Y2x1c2lvbnMiOiBbCiAgICAgICAgICAgICAgICAgICJObyBob2xpZGF5IGd1YXJhbnRlZSIKICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAicmV2aWV3ZWRBdCI6ICIyMDI2LTEwLTE1VDA5OjQzOjQ0LjkyODg0NiswMDowMCIsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uSWQiOiAiZjQxMjhiZDAtMWQxYS00OTkxLThlZTUtZDIxMzFlZTUzYjZiIiwKICAgICAgICAgICAgICAgICJwdWJsaXNoZWRBdCI6ICIyMDI2LTEwLTE1VDA5OjQzOjQ0Ljk0MDAyMSswMDowMCIsCiAgICAgICAgICAgICAgICAiYXNzZXJ0aW9uUmV2aXNpb24iOiAxCiAgICAgICAgICAgICAgfQogICAgICAgICAgICBdLAogICAgICAgICAgICAiZXZhbHVhdGVkQXQiOiAiMjAyNi0xMC0xNVQwOTo0Mzo0NS4xNTIyMDYrMDA6MDAiLAogICAgICAgICAgICAic2NoZW1hVmVyc2lvbiI6ICJrbm93bGVkZ2UtYW5zd2VyLzEiCiAgICAgICAgICB9LAogICAgICAgICAgInBsYWNlTmFtZSI6IG51bGwsCiAgICAgICAgICAicHJvamVjdGlvbiI6ICJjdXJyZW50IiwKICAgICAgICAgICJjb21wbGV0ZWRBdCI6ICIyMDI2LTEwLTE1VDA5OjQzOjQ1LjA4NjQ0KzAwOjAwIiwKICAgICAgICAgICJyZXF1ZXN0U2NvcGUiOiAic2luZ2xlIiwKICAgICAgICAgICJwbGFjZVN1YmplY3RJZCI6ICJmaXh0dXJlXzFjODVkZjUzNjMyNjRkZWNhMzhkMTRiMmZlYTEyZTU3IiwKICAgICAgICAgICJvcmlnaW5hbE91dGNvbWUiOiAiYW5zd2VyZWQiLAogICAgICAgICAgInBsYWNlUmVzb2x1dGlvbiI6ICJtYXRjaGVkIiwKICAgICAgICAgICJ1bmFuc3dlcmVkTmVlZHMiOiBbXQogICAgICAgIH0sCiAgICAgICAgInN0YXR1cyI6ICJjb21wbGV0ZWQiLAogICAgICAgICJ0dXJuSWQiOiAiMzMyNGNkMTQtN2M1Ni00MTI0LTgzMWItY2ZlOTUyYTI4MjE0IiwKICAgICAgICAib3V0Y29tZSI6ICJhbnN3ZXJlZCIsCiAgICAgICAgInRocmVhZElkIjogImZlMTEwNWFkLTcyMGMtNDcxYy04MjQwLTk4MDg5MzljZWNkMiIsCiAgICAgICAgImNyZWF0ZWRBdCI6ICIyMDI2LTEwLTE1VDA5OjQzOjQ1LjAwMjI1NiswMDowMCIsCiAgICAgICAgInBhcmVudFR1cm5JZCI6IG51bGwsCiAgICAgICAgInJlbGF0aW9uc2hpcCI6ICJuZXdfZ29hbCIsCiAgICAgICAgInNjb3BlVmVyc2lvbiI6IDEsCiAgICAgICAgInNlcnZpY2VUYXNrSWQiOiAiM2JhZmUzMDctYmUwMC00MmY4LTk4NjEtYjk2NjljNjExNmFiIiwKICAgICAgICAiY2Fub25pY2FsUGxhY2VQcm9vZiI6IHsKICAgICAgICAgICJiYXNpcyI6IHsKICAgICAgICAgICAgImNpdHkiOiAic2hhbmdoYWkiLAogICAgICAgICAgICAic2NlbmUiOiAiYXR0cmFjdGlvbiIsCiAgICAgICAgICAgICJzdWJqZWN0SWQiOiAiZml4dHVyZV8xYzg1ZGY1MzYzMjY0ZGVjYTM4ZDE0YjJmZWExMmU1NyIsCiAgICAgICAgICAgICJzb3VyY2VEaWdlc3QiOiAiNzliYTQ3YzBlMjkwNWQyNzlmNzcxNDE0ZjM5ZDM5ZDI4MGY5YTY1YjM1ODZlY2MzNGFhNWI5NDU3NjI1NjgxZCIKICAgICAgICAgIH0sCiAgICAgICAgICAic2NvcGVJZCI6ICJmZTExMDVhZC03MjBjLTQ3MWMtODI0MC05ODA4OTM5Y2VjZDIiLAogICAgICAgICAgIm9wZXJhdGlvbiI6IHsKICAgICAgICAgICAgInR1cm5JZCI6ICIzMzI0Y2QxNC03YzU2LTQxMjQtODMxYi1jZmU5NTJhMjgyMTQiLAogICAgICAgICAgICAic2NvcGVJZCI6ICJmZTExMDVhZC03MjBjLTQ3MWMtODI0MC05ODA4OTM5Y2VjZDIiLAogICAgICAgICAgICAibWVzc2FnZUlkIjogbnVsbCwKICAgICAgICAgICAgInNjb3BlS2luZCI6ICJ0aHJlYWQiLAogICAgICAgICAgICAib3BlcmF0aW9uSWQiOiAiMjUxYjU3MjMtNTVjYS00ODExLTk2MDItNTY0NmVkZTI5ZGM3IgogICAgICAgICAgfSwKICAgICAgICAgICJzY29wZUtpbmQiOiAidGhyZWFkIiwKICAgICAgICAgICJleHBlY3RhdGlvbiI6IHsKICAgICAgICAgICAgImxvY2FsZSI6ICJlbiIsCiAgICAgICAgICAgICJ0cmlwSWQiOiAiNDY4Mzg4N2YtYzVhNC00NWM3LWE2MmItZDdlN2ZkZjIyYzk2IiwKICAgICAgICAgICAgInByb3ZpZGVyIjogImFtYXAiLAogICAgICAgICAgICAiaGVhZFZlcnNpb24iOiAwLAogICAgICAgICAgICAicmVmZXJlbmNlSWQiOiAiZWI2NWUyYzUtNzlkOS00MDk5LThkZmEtMTc4ZDBmZmE3YWY4IiwKICAgICAgICAgICAgImNvbnRleHREaWdlc3QiOiAiYTk2YjRmMWM5ZGY5MTcxNTk5NjBkOTg0ZjJmNjc2NzkwOTc1ZTVmYWU3OTY3ZTY5MzM1MTg5MTU3MDg5Njg4ZSIsCiAgICAgICAgICAgICJtYXBwaW5nRGlnZXN0IjogImMwMGM2YjRiNTllMTc0MGVkMzcyNTUxZjBkNmEzZmNmNDJiNGEwM2E4ZTU2MTMzMmEwNDNlOTViNmNhYmEwOTkiLAogICAgICAgICAgICAicHJvdmlkZXJQb2lJZCI6ICJzZWxmLW9ubHktNGJlNzgzNmMtNjg3MS00MzkzLTkyMzAtYjlkZDg5NTdmODI5IiwKICAgICAgICAgICAgImNhbm9uaWNhbFBvaUlkIjogIjdlOWM0ZTM2LTQ2NzEtNGQ5My05NjNjLTYwYmU4N2MzMjE0NSIKICAgICAgICAgIH0sCiAgICAgICAgICAib3BlcmF0aW9uSWQiOiAiMjUxYjU3MjMtNTVjYS00ODExLTk2MDItNTY0NmVkZTI5ZGM3IiwKICAgICAgICAgICJyZXF1ZXN0RGlnZXN0IjogImE4YjMwNTdhZDllYzI3NTM4ZGU0MzBjMmEzOGZmMDI5MTIxY2Y0NzllZmJjYjA1MTczZTRiYjA0YTE5NzQzOWQiLAogICAgICAgICAgInNjaGVtYVZlcnNpb24iOiAiY2Fub25pY2FsLXBsYWNlLXByb29mLzEiLAogICAgICAgICAgIm9yaWdpbmFsUmVjZWlwdCI6IHsKICAgICAgICAgICAgImtpbmQiOiAiYWNjZXB0ZWQiLAogICAgICAgICAgICAicmV1c2VkIjogZmFsc2UsCiAgICAgICAgICAgICJ0dXJuSWQiOiAiMzMyNGNkMTQtN2M1Ni00MTI0LTgzMWItY2ZlOTUyYTI4MjE0IiwKICAgICAgICAgICAgInZlcnNpb24iOiAyLAogICAgICAgICAgICAicGFyZW50VHVybklkIjogbnVsbCwKICAgICAgICAgICAgInJlbGF0aW9uc2hpcCI6ICJuZXdfZ29hbCIsCiAgICAgICAgICAgICJzY29wZVZlcnNpb24iOiAxLAogICAgICAgICAgICAic2VydmljZVRhc2tJZCI6ICIzYmFmZTMwNy1iZTAwLTQyZjgtOTg2MS1iOTY2OWM2MTE2YWIiCiAgICAgICAgICB9CiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfSwKICAid2l0aGRyYXduIjogewogICAgIm5vdyI6IDE3OTIwNTc0MjUyMDYsCiAgICAic3FsUmVhZCI6IHsKICAgICAgImtpbmQiOiAidW5hdmFpbGFibGUiCiAgICB9LAogICAgInNxbFRleHRIaXN0b3J5IjogewogICAgICAia2luZCI6ICJoaXN0b3J5IiwKICAgICAgInR1cm5zIjogW10KICAgIH0sCiAgICAic3FsVGFza0hpc3RvcnkiOiB7CiAgICAgICJraW5kIjogImhpc3RvcnkiLAogICAgICAidHVybnMiOiBbXQogICAgfQogIH0KfQo=")!
}
