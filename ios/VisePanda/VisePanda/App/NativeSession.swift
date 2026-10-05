import Foundation
import Observation
import Security

// Reject before URLSession can send a second request with credentials or a refresh body.
nonisolated final class NativeRedirectBlocker: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct NativeCredential: Codable {
    let subject: String
    var accessToken: String
    var refreshToken: String
    var expiresAt: Double
    var attemptId: String
    var mobileEpoch: Int?
    var pendingAsk: NativePendingAsk? = nil
}

@MainActor
@Observable
final class NativeSession {
    private(set) var subject: String?
    private(set) var mobileEpoch: Int?
    private(set) var displayName: String?
    private(set) var busy = false
    private(set) var status = "signedOut"
    private(set) var failureCode: String?
    private(set) var dataGeneration = 0
    private var assistantNavigation: NativeAssistantNavigation?
    let memoryPreferences=NativeMemoryPreferencesStore()
    let notifications = NativeNotificationCoordinator()
    let voiceAudio = NativeVoiceAudioController()
    let placeGuide = NativePlaceGuideStore()
    let entryResume: NativeEntryResumeCoordinator
    let offlineTrips=NativeOfflineTripStore()
    let deviceMaterials: NativeDeviceMaterials
    private(set) var exploreAskHandoff:NativeExploreAskHandoff?
    private var deviceMaterialSignOutFence = false
    private var credential: NativeCredential?
    private let endpoint: URL?
    let askMode: NativeAskMode
    private let transport: URLSession
    private let defaults: UserDefaults
    private let vault: any NativeCredentialVault
    private let storageKey: String
    private let keychainService = "com.visepanda.native.local-session.v2"

    init(arguments: [String] = ProcessInfo.processInfo.arguments, defaults: UserDefaults = .standard, configuration: URLSessionConfiguration = .ephemeral, bundleConfiguration: [String: String] = Bundle.main.infoDictionary?.compactMapValues { $0 as? String } ?? [:], vault: any NativeCredentialVault = NativeKeychainVault(), deviceMaterials: NativeDeviceMaterials? = nil, entryResume: NativeEntryResumeCoordinator? = nil) {
        endpoint = Self.resolveEndpoint(arguments: arguments, bundleConfiguration: bundleConfiguration)
        let installed = bundleConfiguration["VisePandaNativeTaskContext", default: ""]
        if !installed.isEmpty { askMode = NativeAskMode(rawValue: installed) ?? .unavailable }
        else if endpoint?.scheme == "http", arguments.contains("-VisePandaAssistantConversation") { askMode = .assistant }
        else if endpoint?.scheme == "http", arguments.contains("-VisePandaGroundedMode") { askMode = .grounded }
        else if endpoint?.scheme == "http", arguments.contains("-VisePandaTaskContext") { askMode = .taskContext }
        else { askMode = .currentInput }
        self.defaults = defaults
        self.vault = vault
        self.deviceMaterials = deviceMaterials ?? NativeDeviceMaterials()
        self.entryResume = entryResume ?? NativeEntryResumeCoordinator()
        storageKey = "native.v2.activeSubject.\(endpoint?.absoluteString ?? "disabled")"
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        transport = URLSession(configuration: configuration, delegate: NativeRedirectBlocker(), delegateQueue: nil)
        // Endpoint-scoped record contains the signing-out owner only, never credentials.
        // Any surviving/corrupt intent is a fence until deliberate login clears it.
        deviceMaterialSignOutFence = defaults.object(forKey: storageKey + ".signOutIntent") != nil
        if deviceMaterialSignOutFence { status = "signingOut" }
    }

    func prepareExploreAsk(_ handoff:NativeExploreAskHandoff) {
        guard handoff.scope==dataScope,handoff.valid else{return};exploreAskHandoff=handoff
    }
    func clearExploreAsk(){exploreAskHandoff=nil}

    // Navigation pointers only; no conversation, result or Memory content cache.
    func assistantNavigationSelection() -> NativeAssistantNavigation? {
        guard let value=assistantNavigation,value.scope==dataScope else{return nil};return value
    }
    func retainAssistantNavigation(_ value:NativeAssistantNavigation) {
        guard value.scope==dataScope else{return};assistantNavigation=value
    }

    /// Remote destinations come only from the installed build, never launch arguments or user input.
    static func resolveEndpoint(arguments: [String], bundleConfiguration: [String: String]) -> URL? {
        if let raw = bundleConfiguration["VisePandaStagingAPIOrigin"], !raw.isEmpty {
            guard bundleConfiguration["VisePandaNativeEnvironment"] == "staging",
                  let url = URL(string: raw), url.scheme == "https", url.port == nil,
                  url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
                  url.path.isEmpty || url.path == "/",
                  let host = url.host,
                  (host == "staging.go2china.space" || host.range(of: #"^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$"#, options: .regularExpression) != nil)
            else { return nil }
            return URL(string: "https://" + host)
        }
        // An incomplete build configuration must not fall back to a local credential destination.
        guard bundleConfiguration["VisePandaNativeEnvironment", default: ""].isEmpty else { return nil }
        guard let index = arguments.firstIndex(of: "-VisePandaNativeAPI"), arguments.indices.contains(index + 1),
              let url = URL(string: arguments[index + 1]), url.scheme == "http",
              ["localhost", "127.0.0.1"].contains(url.host ?? ""), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }

    var enabled: Bool { endpoint != nil }

    /// Last verified Keychain identity, for keeping hidden unsent drafts during a
    /// temporary authentication network failure. It never authorizes a request.
    var retainedDataScope: NativeDataScope? {
        guard let credential, let epoch = credential.mobileEpoch else { return nil }
        return NativeDataScope(endpoint: endpoint?.absoluteString ?? "disabled", subject: credential.subject, mobileEpoch: epoch, generation: dataGeneration)
    }

    /// Changes on denial/account clearing even if the same owner later signs in again.
    var dataScope: NativeDataScope? {
        guard !deviceMaterialSignOutFence, status == "active", let subject, let mobileEpoch,
              let retained = retainedDataScope, retained.subject == subject, retained.mobileEpoch == mobileEpoch else { return nil }
        return retained
    }

    /// Reading the durable request does not authorize sending it. The Ask store
    /// must independently refresh and match the current consent/notice first.
    func retainedPendingAsk() throws -> NativePendingAsk? {
        guard dataScope != nil, let credential else { throw NativeDataError.sessionUnavailable }
        guard let pending = credential.pendingAsk else { return nil }
        guard pending.valid, pending.mobileEpoch == credential.mobileEpoch else { throw NativeDataError.invalidResponse }
        return pending
    }

    func retainPendingAsk(_ request: NativeTextSubmission, policy: NativeTextPolicy, mode: NativeAskMode) throws -> NativePendingAsk {
        guard dataScope != nil, mode == askMode, policy.valid, policy.consentState == .accepted,
              request.policyId == policy.id, var updated = credential, let epoch = updated.mobileEpoch else { throw NativeDataError.sessionUnavailable }
        let pending = NativePendingAsk(schemaVersion: 1, mobileEpoch: epoch, mode: mode,
                                       noticeVersion: policy.noticeVersion, noticeHash: policy.noticeHash, request: request)
        guard pending.valid else { throw NativeDataError.invalidResponse }
        if let existing = updated.pendingAsk {
            guard existing == pending else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        updated.pendingAsk = pending
        try save(updated) // Synchronous Keychain success must precede any POST.
        credential = updated
        return pending
    }

    func acknowledgePendingAsk(matching request: NativeTextSubmission) throws {
        guard dataScope != nil, var updated = credential, var pending = updated.pendingAsk,
              pending.request == request else { throw NativeDataError.staleSessionResponse }
        pending.acknowledged = true
        updated.pendingAsk = pending
        try save(updated)
        credential = updated
    }

    func clearPendingAsk(matching request: NativeTextSubmission) throws {
        guard dataScope != nil, var updated = credential else { throw NativeDataError.sessionUnavailable }
        guard let existing = updated.pendingAsk else { return }
        guard existing.request == request else { throw NativeDataError.staleSessionResponse }
        updated.pendingAsk = nil
        try save(updated)
        credential = updated
    }

    var communityExperienceAccess: NativeExperienceAccess {
        .init(current: { try? self.communitySafetyActor() }, request: { try await self.communityExperienceRequest(body: $0, actor: $1) },
              read: { try self.communityExperienceRecovery(actor: $0) }, retain: { try self.rememberCommunityExperience(body: $0, actor: $1) },
              complete: { try self.completeCommunityExperience($0, actor: $1) })
    }
    private func communityExperienceJournal() -> NativeExperienceJournal {
        .init(vault: vault, validate: { bytes in
            let input = try NativeExperienceInput(body: bytes)
            guard input.mutation != nil else { throw NativeDataError.invalidResponse }
        })
    }
    func communityExperienceRecovery(actor: NativeCommunitySafetyActor) throws -> NativeExperiencePending? {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try communityExperienceJournal().read(actor)
    }
    func rememberCommunityExperience(body: Data, actor: NativeCommunitySafetyActor) throws -> NativeExperiencePending {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try communityExperienceJournal().retain(body, actor: actor)
    }
    func completeCommunityExperience(_ pending: NativeExperiencePending, actor: NativeCommunitySafetyActor) throws {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        try communityExperienceJournal().complete(pending, actor: actor)
    }
    func communityExperienceRequest(body: Data, actor: NativeCommunitySafetyActor) async throws -> Data {
        guard body.count <= 49_152, !busy, try communitySafetyActor() == actor else { throw NativeDataError.sessionUnavailable }
        let input = try NativeExperienceInput(body: body)
        if let command = input.mutation ?? input.recovery {
            guard try communityExperienceRecovery(actor: actor)?.body == command.body else { throw NativeDataError.sessionUnavailable }
        }
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communitySafetyActor() == actor, let credential, let endpoint else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/community/publication/native/v1"))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(actor.scope.subject, forHTTPHeaderField: "x-community-publication-expected-actor")
        request.setValue(actor.sessionID, forHTTPHeaderField: "x-community-publication-expected-session")
        let started = ProcessInfo.processInfo.systemUptime
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? 1_000_000 : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communitySafetyActor() == actor, !Task.isCancelled,
                  ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communitySafetyActor() == actor, !Task.isCancelled, ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        if http.statusCode != 200 {
            let v = try? NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["error"])
            let code = v?["error"] as? String ?? "PUBLICATION_UNAVAILABLE"
            if http.statusCode == 401 { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        let outcome = try NativeExperienceOutcome.decode(bytes, actor: actor)
        guard try outcome.matches(input) else { throw NativeDataError.invalidResponse }
        return bytes
    }

    func dataCoverageRecovery(actor: NativeCommunitySafetyActor) throws -> NativeDataCoveragePending? {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeDataCoverageJournal(vault: vault, validate: { body in
            let command = try NativeDataCoverageCommand(body: body)
            guard command.action == .delete, command.phase == .execute, command.matches(actor) else { throw NativeDataError.invalidResponse }
        }).read(actor)
    }
    func rememberDataCoverage(body: Data, actor: NativeCommunitySafetyActor) throws -> NativeDataCoveragePending {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeDataCoverageJournal(vault: vault, validate: { body in
            let command = try NativeDataCoverageCommand(body: body)
            guard command.action == .delete, command.phase == .execute, command.matches(actor) else { throw NativeDataError.invalidResponse }
        }).retain(body, actor: actor)
    }
    func completeDataCoverage(_ pending: NativeDataCoveragePending, actor: NativeCommunitySafetyActor) throws {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        try NativeDataCoverageJournal(vault: vault, validate: { body in
            let command = try NativeDataCoverageCommand(body: body)
            guard command.action == .delete, command.phase == .execute, command.matches(actor) else { throw NativeDataError.invalidResponse }
        }).complete(pending, actor: actor)
    }
    func dataCoverageRequest(method: String, body: Data? = nil, actor: NativeCommunitySafetyActor) async throws -> Data {
        guard !busy, ["GET", "POST"].contains(method), (method == "GET") == (body == nil), try communitySafetyActor() == actor else { throw NativeDataError.sessionUnavailable }
        let command: NativeDataCoverageCommand?
        if let body {
            command = try NativeDataCoverageCommand(body: body)
            guard command?.matches(actor) == true else { throw NativeDataError.staleSessionResponse }
            if let command, command.action == .delete, command.phase != .preview {
                guard let pending = try dataCoverageRecovery(actor: actor) else { throw NativeDataError.sessionUnavailable }
                let original = try NativeDataCoverageCommand(body: pending.body)
                guard original.commandBytes == command.commandBytes, original.operationID == command.operationID,
                      original.moduleID == command.moduleID, original.moduleVersion == command.moduleVersion,
                      original.tripID == command.tripID, original.action == command.action,
                      command.phase == .recover || command.body == original.body else { throw NativeDataError.staleSessionResponse }
            }
        } else { command = nil }
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communitySafetyActor() == actor, let credential, let endpoint else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/privacy/native/v1/coverage"))
        request.httpMethod = method; request.httpBody = body; request.httpShouldHandleCookies = false; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        let start = ProcessInfo.processInfo.systemUptime
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? (method == "GET" ? 65_536 : 1_000_000) : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communitySafetyActor() == actor, !Task.isCancelled,
                  ProcessInfo.processInfo.systemUptime - start < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communitySafetyActor() == actor, !Task.isCancelled, ProcessInfo.processInfo.systemUptime - start < 30 else { throw NativeDataError.staleSessionResponse }
        guard http.statusCode == 200 else {
            let code = (try? JSONDecoder().decode(NativeDataFailure.self, from: bytes).error.code) ?? "COVERAGE_UNAVAILABLE"
            if http.statusCode == 401, code != "REAUTHENTICATION_REQUIRED" { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        if let command { _ = try NativeDataCoverageReceipt(bytes: bytes, actor: actor, command: command) }
        else { _ = try NativeDataCoverageCatalog(bytes: bytes, actor: actor) }
        return bytes
    }

    func coverageProgressStore() -> NativeCoverageProgressStore {
        NativeCoverageProgressStore(vault: vault)
    }
    func coverageProgressRequest(body: Data, actor: NativeCommunitySafetyActor) async throws -> Data {
        guard !busy, try communitySafetyActor() == actor, !Task.isCancelled else { throw NativeDataError.sessionUnavailable }
        let command = try NativeCoverageProgressCommand(body: body)
        if command.action == "erase" || command.action == "recover" {
            let journal = NativeCoverageProgressJournal(vault: vault, validateErase: NativeCoverageProgressCommand.validateErase)
            guard try journal.read(actor)?.body == (command.mutationBytes ?? body) else { throw NativeDataError.staleSessionResponse }
        }
        let started = ProcessInfo.processInfo.systemUptime
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communitySafetyActor() == actor, let endpoint, let credential, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/privacy/native/v1/coverage-progress"))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? 1_000_000 : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communitySafetyActor() == actor, !Task.isCancelled,
                  ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communitySafetyActor() == actor, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        guard http.statusCode == 200 else {
            let code = (try? JSONDecoder().decode(NativeDataFailure.self, from: bytes).error.code) ?? "COVERAGE_PROGRESS_UNAVAILABLE"
            if http.statusCode == 401, code != "REAUTHENTICATION_REQUIRED" { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        try NativeCoverageProgressWire.actor(NativeCoverageProgressWire.root(bytes), actor)
        return bytes
    }

    func notificationDataStore(scope: NativeNotificationDataScope) -> NativeNotificationDataStore {
        NativeNotificationDataStore(scope: scope, vault: vault)
    }
    func notificationDataRequest(body: Data, actor: NativeCommunitySafetyActor) async throws -> Data {
        guard !busy, try communitySafetyActor() == actor, !Task.isCancelled else { throw NativeDataError.sessionUnavailable }
        let command = try NativeNotificationDataCommand(body: body)
        if command.action == "erase" || command.action == "recover" {
            guard let pending = try NativeNotificationDataJournal(vault: vault).read(actor),
                  pending.body == (command.mutationBytes ?? command.body) else { throw NativeDataError.staleSessionResponse }
        }
        let started = ProcessInfo.processInfo.systemUptime
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communitySafetyActor() == actor, let credential, let endpoint, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/privacy/native/v1/notification-data"))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? 1_000_000 : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communitySafetyActor() == actor, !Task.isCancelled,
                  ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communitySafetyActor() == actor, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        guard http.statusCode == 200 else {
            let code = (try? JSONDecoder().decode(NativeDataFailure.self, from: bytes).error.code) ?? "NOTIFICATION_DATA_UNAVAILABLE"
            if http.statusCode == 401, code != "REAUTHENTICATION_REQUIRED" { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        let value = try NativeNotificationDataWire.root(bytes)
        guard value["schemaVersion"] as? String == NativeNotificationDataWire.schema,
              value["ownerId"] as? String == actor.scope.subject.lowercased(), value["sessionId"] as? String == actor.sessionID,
              try NativeCommunityWire.integer(value["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(value["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
        return bytes
    }

    func materialReferenceStore(scope: NativeMaterialReferenceScope) -> NativeMaterialReferenceStore {
        NativeMaterialReferenceStore(scope: scope, vault: vault)
    }
    func materialReferenceRequest(body: Data, actor: NativeCommunitySafetyActor) async throws -> Data {
        guard !busy, try communitySafetyActor() == actor, !Task.isCancelled else { throw NativeDataError.sessionUnavailable }
        let command = try NativeMaterialReferenceCommand(body: body)
        if command.action == "erase" || command.action == "recover" {
            guard let pending = try NativeMaterialReferenceJournal(vault: vault).read(actor),
                  pending.body == (command.mutationBytes ?? command.body) else { throw NativeDataError.staleSessionResponse }
        }
        let started = ProcessInfo.processInfo.systemUptime
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communitySafetyActor() == actor, let credential, let endpoint, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/privacy/native/v1/material-references"))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? 1_000_000 : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communitySafetyActor() == actor, !Task.isCancelled,
                  ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communitySafetyActor() == actor, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        guard http.statusCode == 200 else {
            let code = (try? JSONDecoder().decode(NativeDataFailure.self, from: bytes).error.code) ?? "MATERIAL_UNAVAILABLE"
            if http.statusCode == 401, code != "REAUTHENTICATION_REQUIRED" { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        // The owned store independently validates the closed list/preview/bundle/
        // receipt shape, source binding, exact byte digest and selected scope.
        let value = try NativeMaterialReferenceWire.root(bytes)
        guard value["schemaVersion"] as? String == NativeMaterialReferenceWire.schema,
              value["ownerId"] as? String == actor.scope.subject.lowercased(), value["sessionId"] as? String == actor.sessionID,
              try NativeCommunityWire.integer(value["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(value["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
        return bytes
    }

    func communitySafetyActor() throws -> NativeCommunitySafetyActor {
        guard let scope = dataScope, let credential, credential.expiresAt > Date().timeIntervalSince1970 else { throw NativeDataError.sessionUnavailable }
        return .init(scope: scope, sessionID: try serviceCaseExportSessionId(actor: scope))
    }
    private func communitySafetyJournal() -> NativeCommunitySafetyJournal {
        NativeCommunitySafetyJournal(vault: vault, validate: { _ = try NativeCommunitySafetyCommand(body: $0) })
    }
    func communitySafetyRecovery(actor: NativeCommunitySafetyActor) throws -> NativeCommunitySafetyPending? {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try communitySafetyJournal().read(actor.scope, sessionID: actor.sessionID)
    }
    func rememberCommunitySafety(body: Data, actor: NativeCommunitySafetyActor) throws -> NativeCommunitySafetyPending {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try communitySafetyJournal().retain(body: body, scope: actor.scope, sessionID: actor.sessionID)
    }
    func completeCommunitySafety(_ pending: NativeCommunitySafetyPending, actor: NativeCommunitySafetyActor) throws {
        guard try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        try communitySafetyJournal().complete(pending, scope: actor.scope, sessionID: actor.sessionID)
    }
    func communitySafetyRequest(body: Data, actor: NativeCommunitySafetyActor) async throws -> Data {
        guard body.count <= 49_152, !busy, try communitySafetyActor() == actor else { throw NativeDataError.sessionUnavailable }
        let input = try NativeCommunitySafetyInput(body: body)
        if let command = input.mutation {
            guard try communitySafetyRecovery(actor: actor)?.body == command.body else { throw NativeDataError.sessionUnavailable }
        }
        if let command = input.recovery {
            guard try communitySafetyRecovery(actor: actor)?.body == command.body else { throw NativeDataError.sessionUnavailable }
        }
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communitySafetyActor() == actor, let credential, let endpoint else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/community/safety/native/v1"))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(actor.scope.subject, forHTTPHeaderField: "x-community-safety-expected-actor")
        request.setValue(actor.sessionID, forHTTPHeaderField: "x-community-safety-expected-session")
        let started = ProcessInfo.processInfo.systemUptime
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? 1_000_000 : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communitySafetyActor() == actor, !Task.isCancelled,
                  ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communitySafetyActor() == actor, !Task.isCancelled,
              ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
        if http.statusCode != 200 {
            let value = try? NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["error"])
            let code = value?["error"] as? String ?? "SAFETY_UNAVAILABLE"
            if http.statusCode == 401 { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        let outcome = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor)
        guard try input.matches(outcome) else { throw NativeDataError.invalidResponse }
        return bytes
    }

    func communityActor() throws -> NativeCommunityActor {
        guard let scope = dataScope else { throw NativeDataError.sessionUnavailable }
        return .init(scope: scope, sessionID: try serviceCaseExportSessionId(actor: scope))
    }
    func communityRecovery(actor: NativeCommunityActor) throws -> NativeCommunityPending? {
        guard try communityActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeCommunityJournal(vault: vault).read(actor.scope, sessionID: actor.sessionID)
    }
    func rememberCommunity(body: Data, actor: NativeCommunityActor) throws -> NativeCommunityPending {
        guard try communityActor() == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeCommunityJournal(vault: vault).retain(body: body, scope: actor.scope, sessionID: actor.sessionID)
    }
    func completeCommunity(_ pending: NativeCommunityPending, actor: NativeCommunityActor) throws {
        guard try communityActor() == actor else { throw NativeDataError.staleSessionResponse }
        try NativeCommunityJournal(vault: vault).complete(pending, scope: actor.scope, sessionID: actor.sessionID)
    }
    func communityRequest(body: Data, actor: NativeCommunityActor) async throws -> Data {
        guard body.count <= NativeCommunityWire.maximumTransportBytes, !busy, try communityActor() == actor else { throw NativeDataError.sessionUnavailable }
        let input = try NativeCommunityInput(body: body)
        if let command = input.mutation {
            guard try communityRecovery(actor: actor)?.body == command.body else { throw NativeDataError.sessionUnavailable }
        }
        if let original = input.recovery {
            guard try communityRecovery(actor: actor)?.body == original.body else { throw NativeDataError.sessionUnavailable }
        }
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 { await validate() }
        guard try communityActor() == actor, let credential, let endpoint else { throw NativeDataError.staleSessionResponse }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/community/native/v1"))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false; request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(actor.scope.subject, forHTTPHeaderField: "x-community-expected-actor")
        request.setValue(actor.sessionID, forHTTPHeaderField: "x-community-expected-session")
        let started = ProcessInfo.processInfo.systemUptime
        let (stream, response) = try await transport.bytes(for: request)
        defer { stream.task.cancel() }
        guard let http = response as? HTTPURLResponse, try communityActor() == actor else { throw NativeDataError.staleSessionResponse }
        let cap = http.statusCode == 200 ? 1_000_000 : 4096
        guard http.expectedContentLength <= Int64(cap) else { throw NativeDataError.invalidResponse }
        var bytes = Data()
        for try await byte in stream {
            guard bytes.count < cap, try communityActor() == actor, !Task.isCancelled, ProcessInfo.processInfo.systemUptime - started < 30 else { throw NativeDataError.staleSessionResponse }
            bytes.append(byte)
        }
        guard try communityActor() == actor else { throw NativeDataError.staleSessionResponse }
        if http.statusCode != 200 {
            let error = try? NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["error"])
            let code = error?["error"] as? String ?? "COMMUNITY_UNAVAILABLE"
            if http.statusCode == 401 { handle(SessionError.denied) }
            throw NativeDataError.server(code: code)
        }
        _ = try NativeCommunityOutcome.decode(bytes, actor: actor)
        return bytes
    }

    func serviceCaseRequest(body: Data) async throws -> Data {
        try await dataRequest(prefix: "api/service-cases/native/v1", path: "api/service-cases/native/v1", method: "POST", body: body)
    }

    func travelerBriefRequest(body: Data, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor, body.count <= 64_000 else { throw NativeDataError.staleSessionResponse }
        let path = "api/service-cases/native/brief/v1"
        let bytes = try await dataRequest(prefix: path, path: path, method: "POST", body: body)
        guard dataScope == actor, bytes.count <= 524_288 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }
    func travelerBriefRecovery(actor: NativeDataScope) throws -> NativeTravelerBriefPending? {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeTravelerBriefJournal(vault: vault).read(actor)
    }
    func rememberTravelerBrief(_ command: NativeTravelerBriefCommand, actor: NativeDataScope) throws -> NativeTravelerBriefPending {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeTravelerBriefJournal(vault: vault).retain(command, actor: actor)
    }
    func completeTravelerBrief(_ pending: NativeTravelerBriefPending, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativeTravelerBriefJournal(vault: vault).complete(pending, actor: actor)
    }

    func serviceOperationRequest(body: Data, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        let result = try await dataRequest(prefix: "api/service-cases/native/operations/v1", path: "api/service-cases/native/operations/v1", method: "POST", body: body)
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }; return result
    }
    /// A correlation identity only. HTTP must still verify signed credentials and the live session.
    func serviceCaseExportSessionId(actor: NativeDataScope) throws -> String {
        guard dataScope == actor, let credential, credential.subject == actor.subject,
              credential.mobileEpoch == actor.mobileEpoch, credential.accessToken.utf8.count <= 65_536 else { throw NativeDataError.sessionUnavailable }
        let parts = credential.accessToken.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { throw NativeDataError.sessionUnavailable }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let bytes = Data(base64Encoded: payload), let claims = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              claims["sub"] as? String == actor.subject, let id = claims["session_id"] as? String,
              UUID(uuidString: id) != nil else { throw NativeDataError.sessionUnavailable }
        return id.lowercased()
    }
    func serviceCaseDataRequest(body: Data, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        let result = try await dataRequest(prefix: "api/service-cases/native/data/v1", path: "api/service-cases/native/data/v1", method: "POST", body: body)
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }; return result
    }
    func serviceOperationRecovery(actor: NativeDataScope) throws -> NativeServiceOperationPending? {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeServiceOperationJournal(vault: vault).read(actor)
    }
    func rememberServiceOperation(_ command: NativeServiceOperationCommand, actor: NativeDataScope) throws -> NativeServiceOperationPending {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeServiceOperationJournal(vault: vault).retain(command, scope: actor)
    }
    func completeServiceOperation(_ value: NativeServiceOperationPending, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativeServiceOperationJournal(vault: vault).complete(value, scope: actor)
    }

    func pdfIntakeRequest(tripID: String, action: String, body: Data? = nil, operationID: String? = nil, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor, NativePDFWire.uuid(tripID), ["preview", "proposal", "operation", "cancel"].contains(action),
              action == "operation" ? operationID.map(NativePDFWire.uuid) == true && body == nil : operationID == nil && body != nil else { throw NativeDataError.staleSessionResponse }
        let generation = dataGeneration
        let base = "api/trips/native/v2/\(tripID)/pdf-intake"
        let result = try await dataRequest(prefix: base, path: base + "/" + action, method: action == "operation" ? "GET" : "POST", body: body,
            queryItems: operationID.map { [URLQueryItem(name: "operationId", value: $0)] } ?? [])
        guard dataScope == actor, dataGeneration == generation, result.count <= 128_000 else { throw NativeDataError.staleSessionResponse }
        return result
    }
    func pdfIntakeRecovery(actor: NativeDataScope) throws -> NativePDFJournal? {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        return try NativePDFJournalVault(vault: vault).read(actor)
    }
    func rememberPDFIntake(_ journal: NativePDFJournal, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativePDFJournalVault(vault: vault).remember(journal, actor: actor)
    }
    func completePDFIntake(_ journal: NativePDFJournal, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativePDFJournalVault(vault: vault).complete(journal, actor: actor)
    }

    func storeKitRequest(method: String, body: Data? = nil) async throws -> Data {
        try await dataRequest(prefix: "api/storekit/native/v1", path: "api/storekit/native/v1", method: method, body: body)
    }

    /// The Trip consumer receives response bytes, never the Keychain credential.
    private var tripSupportConfirmVaultService: String { keychainService + ".trip-support-confirm." + (endpoint?.absoluteString ?? "disabled") }
    func tripSupportConfirmationRecovery() throws -> NativeTripSupportConfirmJournal? {
        guard let actor=dataScope else { throw NativeDataError.sessionUnavailable }
        let (status,bytes)=vault.read(service:tripSupportConfirmVaultService,owner:actor.subject)
        if status==errSecItemNotFound { return nil }
        guard status==errSecSuccess,let bytes,bytes.count<=100_000 else { throw NativeDataError.sessionUnavailable }
        let journal=try JSONDecoder().decode(NativeTripSupportConfirmJournal.self,from:bytes)
        guard journal.matches(actor) else { throw NativeDataError.staleSessionResponse }
        _=try journal.request()
        return journal
    }
    func rememberTripSupportConfirmation(_ request:NativeSupportedTripConfirmRequest,tripID:String,actor:NativeDataScope) throws -> NativeTripSupportConfirmJournal {
        guard request.valid,NativeMemoryWire.uuid(tripID),dataScope==actor else { throw NativeDataError.sessionUnavailable }
        let journal=NativeTripSupportConfirmJournal(endpoint:actor.endpoint,owner:actor.subject,epoch:actor.mobileEpoch,tripID:tripID,body:try JSONEncoder().encode(request))
        if let existing=try tripSupportConfirmationRecovery() {
            guard existing.tripID==tripID,try existing.request()==request else { throw NativeDataError.server(code:"SUPPORT_CONFIRM_RECOVERY_REQUIRED") }
            return existing // Preserve the first original request bytes, not a reserialization.
        }
        let bytes=try JSONEncoder().encode(journal)
        guard bytes.count<=100_000,vault.write(bytes,service:tripSupportConfirmVaultService,owner:actor.subject)==errSecSuccess else { throw NativeDataError.sessionUnavailable }
        return journal
    }
    func tripSupportConfirm(_ journal:NativeTripSupportConfirmJournal,actor:NativeDataScope) async throws -> Data {
        guard journal.matches(actor),dataScope==actor,let existing=try tripSupportConfirmationRecovery(),existing.body==journal.body,existing.tripID==journal.tripID else { throw NativeDataError.sessionUnavailable }
        _=try journal.request()
        return try await tripSupportPost(action:"confirm",tripID:journal.tripID,body:journal.body,actor:actor)
    }
    func completeTripSupportConfirmation(_ journal:NativeTripSupportConfirmJournal,receipt:NativeSupportedTripConfirmReceipt,actor:NativeDataScope) throws {
        guard dataScope==actor,journal.matches(actor),let existing=try tripSupportConfirmationRecovery(),existing.body==journal.body,existing.tripID==journal.tripID else { throw NativeDataError.staleSessionResponse }
        let request=try journal.request()
        guard receipt.tripId==journal.tripID,receipt.proposalId==request.proposalId,receipt.resultingVersion==request.expectedBaseVersion+1,
              Set(receipt.supports.map(\.receiptId))==Set(request.supportSelection.map(\.receiptId)) else { throw NativeDataError.invalidResponse }
        let status=vault.remove(service:tripSupportConfirmVaultService,owner:actor.subject)
        guard status==errSecSuccess || status==errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }

    func planFeasibility(_ target:NativePlanFeasibilityTarget,body:Data) async throws -> Data {
        guard target.valid,dataScope==target.actor,body.count<=24000 else{throw NativeDataError.invalidResponse}
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(target.tripId)/feasibility",method:"POST",body:body)
        guard dataScope==target.actor,bytes.count<=262_144 else{throw NativeDataError.staleSessionResponse}
        return bytes
    }

    func tripSupportContext(target:NativeTripSupportTarget,proposal:NativeTripPending.Proposal) async throws -> Data {
        guard target.valid,dataScope==target.actor,NativeMemoryWire.uuid(proposal.id),proposal.revision>0,proposal.baseTripVersion==target.tripVersion,!proposal.stale else { throw NativeDataError.invalidResponse }
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(target.tripID)/support/context",method:"GET",queryItems:[.init(name:"expectedTripVersion",value:String(target.tripVersion)),.init(name:"proposalId",value:proposal.id),.init(name:"expectedProposalRevision",value:String(proposal.revision)),.init(name:"dayId",value:target.dayID),.init(name:"itemId",value:target.itemID)])
        guard dataScope==target.actor,bytes.count<=262_144 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }

    func tripSupportConfirmationRead(_ journal:NativeTripSupportConfirmJournal,actor:NativeDataScope) async throws -> Data {
        guard journal.matches(actor),dataScope==actor else { throw NativeDataError.sessionUnavailable }
        _=try journal.request()
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(journal.tripID)/support/confirmation-receipt",method:"POST",body:journal.body)
        guard dataScope==actor,bytes.count<=131_072 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }
    func tripSupportCandidates(target:NativeTripSupportTarget,placeReferenceID:String,city:String,scene:String,locale:String,cursor:NativeTripSupportCandidates.Cursor?=nil) async throws -> Data {
        guard target.valid,dataScope==target.actor,NativeMemoryWire.uuid(placeReferenceID),["shanghai","beijing","guangzhou","chongqing"].contains(city),
              ["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"].contains(scene),["zh","en"].contains(locale),
              cursor.map({NativeQualifiedDelegationRPC.digest($0.contextDigest) && NativeMemoryWire.uuid($0.afterMappingId)}) ?? true else { throw NativeDataError.invalidResponse }
        var query=[URLQueryItem(name:"expectedTripVersion",value:String(target.tripVersion)),.init(name:"placeReferenceId",value:placeReferenceID),.init(name:"city",value:city),.init(name:"scene",value:scene),.init(name:"locale",value:locale),.init(name:"limit",value:"50")]
        if let cursor { query += [.init(name:"contextDigest",value:cursor.contextDigest),.init(name:"afterMappingId",value:cursor.afterMappingId)] }
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(target.tripID)/support/candidates",method:"GET",queryItems:query)
        guard dataScope==target.actor,bytes.count<=512_000 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }

    func tripSupportPrepare(_ request: NativeTripSupportPrepareRequest, target: NativeTripSupportTarget, proposal: NativeTripPending.Proposal) async throws -> Data {
        guard request.valid, target.valid, dataScope==target.actor, request.dayId==target.dayID, request.itemId==target.itemID,
              request.expectedBaseVersion==target.tripVersion, request.proposalId==proposal.id, request.expectedProposalRevision==proposal.revision, request.expectedProposalDigest==proposal.digest else { throw NativeDataError.invalidResponse }
        return try await tripSupportPost(action:"prepare",tripID:target.tripID,body:JSONEncoder().encode(request),actor:target.actor)
    }
    func tripSupportRenew(_ request: NativeTripSupportRenewRequest, target: NativeTripSupportTarget) async throws -> Data {
        guard request.valid, target.valid, dataScope==target.actor, request.tripVersion==target.tripVersion, request.dayId==target.dayID, request.itemId==target.itemID else { throw NativeDataError.invalidResponse }
        return try await tripSupportPost(action:"renew",tripID:target.tripID,body:JSONEncoder().encode(request),actor:target.actor)
    }
    func tripSupportRevoke(_ receipt: NativePreparedTripSupport, actor: NativeDataScope) async throws -> Data {
        guard dataScope==actor, NativeMemoryWire.uuid(receipt.receiptId), receipt.version>0 else { throw NativeDataError.sessionUnavailable }
        struct Revoke:Encodable { let receiptId:String;let expectedVersion:Int }
        let bytes=try await tripRequest(path:"api/trips/native/v2/support/preparations/revoke",method:"POST",body:JSONEncoder().encode(Revoke(receiptId:receipt.receiptId,expectedVersion:receipt.version)))
        guard dataScope==actor,bytes.count<=4096 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }
    private func tripSupportPost(action:String,tripID:String,body:Data,actor:NativeDataScope) async throws -> Data {
        guard ["prepare","renew","confirm"].contains(action), NativeMemoryWire.uuid(tripID),dataScope==actor,body.count<=65_536 else { throw NativeDataError.invalidResponse }
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(tripID)/support/\(action)",method:"POST",body:body)
        guard dataScope==actor,bytes.count<=131_072 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }

    func tripSupportRead(_ target: NativeTripSupportTarget) async throws -> Data {
        guard target.valid, dataScope==target.actor else { throw NativeDataError.sessionUnavailable }
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(target.tripID)/support",method:"GET",queryItems:[
            .init(name:"expectedTripVersion",value:String(target.tripVersion)),.init(name:"dayId",value:target.dayID),.init(name:"itemId",value:target.itemID)])
        guard dataScope==target.actor, bytes.count<=131_072 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }

    private var materialDeleteRequestService:String { keychainService+".device-delete-request."+(endpoint?.absoluteString ?? "disabled") }
    private var materialDeleteReceiptService:String { keychainService+".device-delete-receipt."+(endpoint?.absoluteString ?? "disabled") }
    func pendingDeviceMaterialDeletion() throws -> NativeDeviceMaterialDeleteRequest? {
        guard let actor=dataScope else{throw NativeDataError.sessionUnavailable}
        let (status,bytes)=vault.read(service:materialDeleteRequestService,owner:actor.subject)
        if status==errSecItemNotFound{return nil}
        guard status==errSecSuccess,let bytes else{throw NativeDataError.sessionUnavailable}
        let request=try NativeDeviceMaterialDeleteRequest.decode(bytes)
        guard request.namespace.matches(actor) else{throw NativeDataError.staleSessionResponse}
        return request
    }
    func lastDeviceMaterialDeletionReceipt() throws -> NativeDeviceMaterialDeleteReceipt? {
        guard let actor=dataScope else{throw NativeDataError.sessionUnavailable}
        let (status,bytes)=vault.read(service:materialDeleteReceiptService,owner:actor.subject)
        if status==errSecItemNotFound{return nil}
        guard status==errSecSuccess,let bytes else{throw NativeDataError.sessionUnavailable}
        return try NativeDeviceMaterialDeleteReceipt.decode(bytes,actor:actor)
    }
    func previewDeviceMaterialDeletion() throws -> [NativeScreenshotInbox.FileSelection] {
        guard let actor=dataScope,prepareDeviceMaterials(),try pendingDeviceMaterialDeletion()==nil else{throw NativeDataError.sessionUnavailable}
        return try deviceMaterials.deletionSelections(scope:actor)
    }
    func rememberDeviceMaterialDeletion(_ request:NativeDeviceMaterialDeleteRequest) throws {
        guard request.valid,let actor=dataScope,request.namespace.matches(actor),prepareDeviceMaterials() else{throw NativeDataError.sessionUnavailable}
        if let existing=try pendingDeviceMaterialDeletion(){
            guard existing==request else{throw NativeDataError.server(code:"DEVICE_DELETE_RECOVERY_REQUIRED")}
            return
        }
        if let receipt=try lastDeviceMaterialDeletionReceipt(),receipt.matches(request){return}
        try deviceMaterials.validateDeletion(request.files,scope:actor)
        let bytes=try JSONEncoder().encode(request)
        guard bytes.count<=NativeDeviceMaterialDeleteRequest.maximumBytes,vault.write(bytes,service:materialDeleteRequestService,owner:actor.subject)==errSecSuccess else{throw NativeDataError.sessionUnavailable}
    }
    func executeDeviceMaterialDeletion(_ request:NativeDeviceMaterialDeleteRequest) throws -> NativeDeviceMaterialDeleteReceipt {
        guard request.valid,let actor=dataScope,request.namespace.matches(actor),prepareDeviceMaterials() else{throw NativeDataError.sessionUnavailable}
        let pending=try pendingDeviceMaterialDeletion()
        if let receipt=try lastDeviceMaterialDeletionReceipt(),receipt.matches(request){
            if let pending{guard pending==request else{throw NativeDataError.server(code:"DEVICE_DELETE_RECOVERY_REQUIRED")};try removeDeviceMaterialDeleteRequest(owner:actor.subject)}
            return receipt // Replay proves the earlier request only; never delete a newly imported copy.
        }
        guard pending==request else{throw NativeDataError.server(code:"DEVICE_DELETE_RECOVERY_REQUIRED")}
        try deviceMaterials.executeDeletion(request.files,scope:actor)
        guard dataScope==actor else{throw NativeDataError.staleSessionResponse}
        let receipt=NativeDeviceMaterialDeleteReceipt(request:request)
        let bytes=try JSONEncoder().encode(receipt)
        guard bytes.count<=8192,vault.write(bytes,service:materialDeleteReceiptService,owner:actor.subject)==errSecSuccess else{throw NativeDataError.sessionUnavailable}
        try removeDeviceMaterialDeleteRequest(owner:actor.subject)
        return receipt
    }
    private func removeDeviceMaterialDeleteRequest(owner:String) throws {
        let status=vault.remove(service:materialDeleteRequestService,owner:owner)
        guard status==errSecSuccess || status==errSecItemNotFound else{throw NativeDataError.sessionUnavailable}
    }

    private var readinessSaveService:String{keychainService+".readiness-save."+(endpoint?.absoluteString ?? "disabled")}
    func readinessSaveRecovery()throws->NativeReadinessPendingSave? {
        guard let actor=dataScope else{throw NativeDataError.sessionUnavailable}
        let (status,bytes)=vault.read(service:readinessSaveService,owner:actor.subject)
        if status==errSecItemNotFound{return nil}
        guard status==errSecSuccess,let bytes,bytes.count<=32000 else{throw NativeDataError.sessionUnavailable}
        let pending=try JSONDecoder().decode(NativeReadinessPendingSave.self,from:bytes);guard pending.matches(actor) else{throw NativeDataError.staleSessionResponse};_=try pending.parsed();return pending
    }
    func rememberReadinessSave(_ pending:NativeReadinessPendingSave)throws {
        guard let actor=dataScope,pending.matches(actor) else{throw NativeDataError.sessionUnavailable};_=try pending.parsed()
        if let existing=try readinessSaveRecovery(){guard existing.body==pending.body,existing.tripId==pending.tripId,existing.taskId==pending.taskId else{throw NativeDataError.server(code:"READINESS_SAVE_RECOVERY_REQUIRED")};return}
        let bytes=try JSONEncoder().encode(pending);guard bytes.count<=32000,vault.write(bytes,service:readinessSaveService,owner:actor.subject)==errSecSuccess else{throw NativeDataError.sessionUnavailable}
    }
    func removeReadinessSave(_ pending:NativeReadinessPendingSave)throws {
        guard let actor=dataScope,pending.matches(actor),let existing=try readinessSaveRecovery(),existing.body==pending.body,existing.tripId==pending.tripId,existing.taskId==pending.taskId else{throw NativeDataError.staleSessionResponse}
        let status=vault.remove(service:readinessSaveService,owner:actor.subject);guard status==errSecSuccess || status==errSecItemNotFound else{throw NativeDataError.sessionUnavailable}
    }
    func readinessTaskDiscovery(tripId:String)async throws->Data {
        guard NativeMemoryWire.uuid(tripId) else{throw NativeDataError.invalidResponse}
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(tripId)/readiness/task",method:"GET")
        guard bytes.count<=256000 else{throw NativeDataError.invalidResponse};return bytes
    }
    func readinessActions(tripId:String,body:Data)async throws->Data {
        guard NativeMemoryWire.uuid(tripId),body.count<=16000 else{throw NativeDataError.invalidResponse}
        let bytes=try await tripRequest(path:"api/trips/native/v2/\(tripId)/readiness/actions",method:"POST",body:body)
        guard bytes.count<=256000 else{throw NativeDataError.invalidResponse};return bytes
    }

    func tripRequest(path: String, method: String, body: Data? = nil, queryItems: [URLQueryItem] = []) async throws -> Data {
        try await dataRequest(prefix: "api/trips/native/v2", path: path, method: method, body: body, queryItems: queryItems)
    }

    func notificationRecovery() throws -> NativeNotificationPending? {
        guard let scope = dataScope else { throw NativeDataError.sessionUnavailable }
        return try NativeNotificationJournal(vault: vault).read(scope)
    }
    func notificationDeviceBinding() throws -> NativeNotificationDeviceBinding? {
        guard let scope = dataScope else { throw NativeDataError.sessionUnavailable }
        return try NativeNotificationJournal(vault: vault).binding(scope)
    }
    func retainNotification(_ command: NativeNoticeCommand, scope: NativeDataScope) throws -> NativeNotificationPending {
        guard dataScope == scope else { throw NativeDataError.sessionUnavailable }
        return try NativeNotificationJournal(vault: vault).retain(command, scope: scope)
    }
    func completeNotification(_ pending: NativeNotificationPending, receipt: NativeNoticeView.MutationReceipt, scope: NativeDataScope) throws {
        guard dataScope == scope else { throw NativeDataError.staleSessionResponse }
        let journal = NativeNotificationJournal(vault: vault)
        guard try journal.read(scope) == pending, receipt.matches(pending.command) else { throw NativeDataError.invalidResponse }
        try journal.acknowledgeDevice(pending, receipt: receipt, scope: scope)
        try journal.complete(pending, scope: scope)
    }

    func tripLifecycleRead(actor: NativeDataScope, afterTripID: String? = nil, revision: Int? = nil) async throws -> Data {
        guard dataScope == actor, (afterTripID == nil) == (revision == nil),
              afterTripID.map(NativeMemoryWire.uuid) ?? true,
              revision.map(NativeTripLifecycleWire.revision) ?? true else { throw NativeDataError.sessionUnavailable }
        let query: [URLQueryItem] = afterTripID.map { [.init(name: "afterTripId", value: $0), .init(name: "expectedRevision", value: String(revision!))] } ?? []
        return try await tripRequest(path: "api/trips/native/v2/lifecycle", method: "GET", queryItems: query)
    }

    func tripLifecycleRecovery(actor: NativeDataScope) throws -> NativeTripLifecycleJournal? {
        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }
        return try NativeTripLifecycleJournalVault(vault: vault).read(actor)
    }

    func rememberTripLifecycle(_ command: NativeTripLifecycleCommand, actor: NativeDataScope) throws -> NativeTripLifecycleJournal {
        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }
        return try NativeTripLifecycleJournalVault(vault: vault).remember(command, actor: actor)
    }

    func tripLifecycleSubmit(_ journal: NativeTripLifecycleJournal, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor, journal.matches(actor), try tripLifecycleRecovery(actor: actor) == journal else {
            throw NativeDataError.staleSessionResponse
        }
        _ = try journal.command()
        return try await tripRequest(path: "api/trips/native/v2/lifecycle", method: "POST", body: journal.bytes)
    }

    func tripLifecycleOperation(_ journal: NativeTripLifecycleJournal, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor, journal.matches(actor), try tripLifecycleRecovery(actor: actor) == journal else {
            throw NativeDataError.staleSessionResponse
        }
        let command = try journal.command()
        return try await tripRequest(path: "api/trips/native/v2/lifecycle/operations/\(command.operationID)", method: "GET")
    }

    func abandonTripLifecycle(_ journal: NativeTripLifecycleJournal, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor, journal.matches(actor), try tripLifecycleRecovery(actor: actor) == journal else {
            throw NativeDataError.staleSessionResponse
        }
        let command = try journal.command()
        return try await tripRequest(path: "api/trips/native/v2/lifecycle/operations/\(command.operationID)/abandon", method: "POST", body: journal.bytes)
    }

    func completeTripLifecycle(_ journal: NativeTripLifecycleJournal, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativeTripLifecycleJournalVault(vault: vault).complete(journal, actor: actor)
    }

    func scopedTripEditRequest(tripID: String, body: Data) async throws -> Data {
        guard UUID(uuidString: tripID) != nil, body.count <= 32000 else { throw NativeDataError.invalidResponse }
        let result = try await tripRequest(path: "api/trips/native/v2/\(tripID)/scoped-edit", method: "POST", body: body)
        guard result.count <= 256000 else { throw NativeDataError.invalidResponse }; return result
    }

    func scopedTripEditRecovery() throws -> NativeScopedTripJournal? {
        guard let actor = dataScope else { throw NativeDataError.sessionUnavailable }
        return try NativeScopedTripJournalVault(vault: vault).read(actor)
    }

    func rememberScopedTripEdit(_ command: NativeScopedTripCommand, selection: NativeScopedTripSelection, actor: NativeDataScope) throws -> NativeScopedTripJournal {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        return try NativeScopedTripJournalVault(vault: vault).remember(command, selection: selection, actor: actor)
    }

    func completeScopedTripEdit(_ journal: NativeScopedTripJournal, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativeScopedTripJournalVault(vault: vault).complete(journal, actor: actor)
    }

    func tripDeletionRequest(method: String, body: Data? = nil, requestID: String? = nil) async throws -> Data {
        let query = requestID.map { [URLQueryItem(name: "requestId", value: $0)] } ?? []
        return try await dataRequest(prefix: "api/privacy/native/v1/trips", path: "api/privacy/native/v1/trips",
                                     method: method, body: body, queryItems: query)
    }

    /// Keep an uncertain request across app restarts and token replacement. This
    /// keychain record is owner and API-origin scoped; it contains no Trip text.
    func pendingTripDeletion() throws -> NativePendingTripDeletion? {
        guard let scope = dataScope else { throw NativeDataError.sessionUnavailable }
        let (status, bytes) = vault.read(service: deletionVaultService, owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes,
              let value = try? JSONDecoder().decode(NativePendingTripDeletion.self, from: bytes),
              value.owner == scope.subject, value.isValid else { throw NativeDataError.sessionUnavailable }
        return value
    }

    func rememberTripDeletion(_ value: NativePendingTripDeletion) throws {
        let existing = try pendingTripDeletion()
        guard let scope = dataScope, value.owner == scope.subject, value.isValid,
              existing == nil || existing == value else { throw NativeDataError.sessionUnavailable }
        let result = vault.write(try JSONEncoder().encode(value), service: deletionVaultService, owner: value.owner)
        guard result == errSecSuccess else { throw NativeDataError.sessionUnavailable }
    }

    func forgetTripDeletion(_ value: NativePendingTripDeletion) throws {
        let existing = try pendingTripDeletion()
        guard let scope = dataScope, scope.subject == value.owner, existing == value else {
            throw NativeDataError.sessionUnavailable
        }
        let result = vault.remove(service: deletionVaultService, owner: value.owner)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }

    private var deletionVaultService: String { keychainService + ".trip-deletion." + (endpoint?.absoluteString ?? "disabled") }

    /// First-party read only: fixed endpoint and typed scope share the current identity fence.
    func knowledgeRequest(selection: NativeKnowledgeSelection, question: Bool = false) async throws -> Data {
        guard selection.valid else { throw NativeDataError.invalidResponse }
        if question {
            guard selection.scene == "rail" else { throw NativeDataError.invalidResponse }
            return try await dataRequest(prefix: "api/knowledge/native/v1/answer", path: "api/knowledge/native/v1/answer", method: "GET", queryItems: [
                .init(name: "questionId", value: "rail_boarding_documents"), .init(name: "questionVersion", value: "1"),
                .init(name: "city", value: selection.city), .init(name: "locale", value: selection.locale)
            ])
        }
        return try await dataRequest(prefix: "api/knowledge/native/v1", path: "api/knowledge/native/v1", method: "GET", queryItems: selection.queryItems)
    }

    /// Owned result reads share the native session fence; the caller receives no credential.
    func resultRequest(artifactID: String? = nil, revision: Int? = nil) async throws -> Data {
        if let artifactID, UUID(uuidString: artifactID) == nil { throw NativeDataError.invalidResponse }
        if let revision, artifactID == nil || !(1...1000).contains(revision) { throw NativeDataError.invalidResponse }
        var query: [URLQueryItem] = []
        if let artifactID { query.append(.init(name: "artifactId", value: artifactID)) }
        if let revision { query.append(.init(name: "revision", value: String(revision))) }
        let bytes = try await dataRequest(prefix: "api/results/native/v1", path: "api/results/native/v1", method: "GET", queryItems: query)
        guard bytes.count <= 100_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Read only the discovered exact Proposal reference through the native identity fence.
    func proposalReferenceRequest(artifactID: String, revision: Int) async throws -> Data {
        guard UUID(uuidString: artifactID) != nil, (1...1000).contains(revision) else {
            throw NativeDataError.invalidResponse
        }
        let path = "api/results/native/v1/change-proposal-reference"
        let bytes = try await dataRequest(prefix: path, path: path, method: "GET", queryItems: [
            .init(name: "artifactId", value: artifactID), .init(name: "revision", value: String(revision))
        ])
        guard bytes.count <= 100_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Frozen owned Trip discovery contract; consumers must re-read the returned exact reference.
    func tripProposalReferenceRequest(tripID: String) async throws -> Data {
        guard UUID(uuidString: tripID) != nil else { throw NativeDataError.invalidResponse }
        let path = "api/results/native/v1/change-proposal-reference/trip"
        let bytes = try await dataRequest(prefix: path, path: path, method: "GET", queryItems: [
            .init(name: "tripId", value: tripID)
        ])
        guard bytes.count <= 10_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Bounded owner search uses the same fixed native transport and identity fence.
    func resultSearchRequest(query: String, cursor: String? = nil) async throws -> Data {
        guard query.utf16.count <= 120, cursor == nil || UUID(uuidString: cursor ?? "") != nil else {
            throw NativeDataError.invalidResponse
        }
        var items: [URLQueryItem] = [.init(name: "query", value: query)]
        if let cursor { items.append(.init(name: "cursor", value: cursor)) }
        let bytes = try await dataRequest(prefix: "api/results/native/v1/search", path: "api/results/native/v1/search", method: "GET", queryItems: items)
        guard bytes.count <= 100_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Reopen a Task after restart without relying on a remembered artifact ID.
    func taskResultRequest(taskID: String) async throws -> Data {
        guard let initial = dataScope else { throw NativeDataError.sessionUnavailable }
        return try await AssistantTaskResultReader.open(taskID: taskID, isCurrent: { self.dataScope == initial }, resolve: {
            try await self.dataRequest(prefix: "api/results/native/v1/task", path: "api/results/native/v1/task", method: "GET",
                                       queryItems: [.init(name: "taskId", value: taskID)])
        }, exact: { id, revision in
            try await self.resultRequest(artifactID: id, revision: revision)
        })
    }

    /// Fixed, read-only goal index; the existing session fence owns credentials.
    func journeysGoalIndexRequest(cursor: String? = nil) async throws -> Data {
        if let cursor, NativeJourneyGoalIndexCursor(cursor) == nil { throw NativeDataError.invalidResponse }
        let base = "api/chat/native/v5/journeys-goals"
        let bytes = try await dataRequest(prefix: base, path: base + (cursor.map { "/" + $0 } ?? ""), method: "GET")
        guard bytes.count <= 512_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Journeys resolves only an owned exact result reference for its selected Trip.
    func tripResultReferenceRequest(tripID: String) async throws -> Data {
        guard UUID(uuidString: tripID) != nil else { throw NativeDataError.invalidResponse }
        let bytes = try await dataRequest(prefix: "api/results/native/v1/trip", path: "api/results/native/v1/trip", method: "GET",
                                          queryItems: [.init(name: "tripId", value: tripID)])
        guard bytes.count <= 10_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Read-only place observations use the same active native-session fence as
    /// Trip and Knowledge. The provider credential remains server-side.
    func placeLookupRequest(_ parameters: [String: String]) async throws -> Data {
        return try await dataRequest(prefix: "api/places/native/v1", path: "api/places/native/v1/lookup", method: "GET",
            queryItems: parameters.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) })
    }

    func placeSearchRequest(provider: NativePlaceProvider, query: String, city: String) async throws -> Data {
        guard query.count <= 200, city.count <= 100, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeDataError.invalidResponse }
        return try await dataRequest(prefix: "api/places/native/v1", path: "api/places/native/v1/search", method: "GET", queryItems: [
            .init(name: "provider", value: provider.rawValue), .init(name: "q", value: query), .init(name: "city", value: city),
        ])
    }

    func placeSuggestRequest(provider: NativePlaceProvider, query: String, city: String) async throws -> Data {
        guard query.count <= 200, city.count <= 100, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeDataError.invalidResponse }
        return try await dataRequest(prefix: "api/places/native/v1", path: "api/places/native/v1/suggest", method: "GET", queryItems: [
            .init(name: "provider", value: provider.rawValue), .init(name: "q", value: query), .init(name: "city", value: city),
        ])
    }

    func placeReverseGeocodeRequest(provider: NativePlaceProvider, latitude: Double, longitude: Double) async throws -> Data {
        guard latitude.isFinite, longitude.isFinite, (-90...90).contains(latitude), (-180...180).contains(longitude) else { throw NativeDataError.invalidResponse }
        return try await dataRequest(prefix: "api/places/native/v1", path: "api/places/native/v1/reverse-geocode", method: "GET", queryItems: [
            .init(name: "provider", value: provider.rawValue), .init(name: "lat", value: String(latitude)),
            .init(name: "lng", value: String(longitude)), .init(name: "system", value: "gcj02"),
        ])
    }

    /// Explicit conversation reads retain the transport's account/session fence.
    func assistantConversationRequest(conversationID: String? = nil, list: Bool = false) async throws -> Data {
        guard askMode == .assistant, !list || conversationID == nil,
              conversationID == nil || UUID(uuidString: conversationID ?? "") != nil else {
            throw NativeDataError.invalidResponse
        }
        let path = list ? "api/chat/native/v5/conversations" : "api/chat/native/v5/conversation"
        let items = conversationID.map { [URLQueryItem(name: "conversationId", value: $0)] } ?? []
        let bytes = try await dataRequest(prefix: "api/chat/native/v5", path: path, method: "GET", queryItems: items)
        guard bytes.count <= (list ? 30_000 : 1_000_000) else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Task status authority comes from server-validated conversation membership only.
    func assistantTaskHistoryRequest(conversationID: String, cursor: String? = nil) async throws -> Data {
        guard askMode == .assistant, UUID(uuidString: conversationID) != nil,
              cursor == nil || (cursor!.utf8.count <= 512 && cursor!.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil) else {
            throw NativeDataError.invalidResponse
        }
        let items = cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? []
        let bytes = try await dataRequest(prefix: "api/chat/native/v5/conversations", path: "api/chat/native/v5/conversations/\(conversationID)/tasks", method: "GET", queryItems: items)
        guard bytes.count <= 50_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// The qualified v2 route is distinct from v1; the prepared real UI keeps this disabled.
    func submitQualifiedIntakeDelegationRequest(_ body: Data) async throws -> Data {
        guard askMode == .assistant, body.count <= 16_000 else { throw NativeDataError.invalidResponse }
        let path = "api/chat/native/v5/planning/intake-tasks"
        let bytes = try await dataRequest(prefix: path, path: path, method: "POST", body: body)
        guard bytes.count <= 12_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    func offlineTripTextCommand(tripID:String,action:String,body:Data)async throws->Data {
        guard NativeMemoryWire.uuid(tripID),["proposal","revoke"].contains(action),body.count<=8192 else{throw NativeDataError.invalidResponse}
        let path="api/trips/native/v2/"+tripID+"/offline-text/"+action
        return try await dataRequest(prefix:"api/trips/native/v2",path:path,method:"POST",body:body)
    }

    func offlineTripRead(tripID:String,headVersion:Int,nonce:String)async throws->Data {
        guard NativeMemoryWire.uuid(tripID),headVersion>0,NativeMemoryWire.uuid(nonce) else{throw NativeDataError.invalidResponse}
        let path="api/trips/native/v2/"+tripID+"/offline-read"
        return try await dataRequest(prefix:"api/trips/native/v2",path:path,method:"GET",queryItems:[.init(name:"expectedHeadVersion",value:String(headVersion)),.init(name:"requestNonce",value:nonce)])
    }

    func rememberLinkedTripDeletion(_ command:NativeLinkedTripDeleteRequest,body:Data,target:NativeLinkedTripDeleteSelection)throws {
        guard target.scope==dataScope,command.selection.valid,command.expectedVersion==target.headVersion else{throw NativeDataError.sessionUnavailable}
        let journal=NativeLinkedTripDeleteJournal(endpoint:target.scope.endpoint,owner:target.scope.subject,epoch:target.scope.mobileEpoch,tripID:target.tripID,body:body)
        guard try journal.decodedRequest()==command else{throw NativeDataError.invalidResponse}
        let existing=try linkedTripDeletionRecovery()
        try NativeLinkedTripDeleteJournal.validateReplacement(existing:existing,incoming:journal)
        let bytes=try JSONEncoder().encode(journal)
        guard bytes.count<=NativeLinkedTripDeleteJournal.maximumBytes,vault.write(bytes,service:linkedDeleteVaultService,owner:target.scope.subject)==errSecSuccess else{throw NativeDataError.sessionUnavailable}
    }
    func linkedTripDeletionRecovery()throws->NativeLinkedTripDeleteJournal? {
        guard let scope=dataScope else{throw NativeDataError.sessionUnavailable}
        let (status,bytes)=vault.read(service:linkedDeleteVaultService,owner:scope.subject)
        if status==errSecItemNotFound{return nil}
        guard status==errSecSuccess,let bytes,bytes.count<=NativeLinkedTripDeleteJournal.maximumBytes else{throw NativeDataError.sessionUnavailable}
        let journal=try JSONDecoder().decode(NativeLinkedTripDeleteJournal.self,from:bytes)
        guard journal.endpoint==scope.endpoint,journal.owner==scope.subject,journal.epoch==scope.mobileEpoch,NativeMemoryWire.uuid(journal.tripID) else{throw NativeDataError.invalidResponse}
        _=try journal.decodedRequest();return journal
    }
    func pendingLinkedTripDeletion(target:NativeLinkedTripDeleteSelection)throws->NativeLinkedTripDeleteJournal? {
        guard target.scope==dataScope else{throw NativeDataError.sessionUnavailable}
        guard let journal=try linkedTripDeletionRecovery() else{return nil}
        guard try journal.matches(target) else{throw NativeDataError.server(code:"LINKED_DELETION_RECOVERY_REQUIRED")};return journal
    }
    func completeLinkedTripDeletion(_ receipt:NativeLinkedTripDeleteReceipt,target:NativeLinkedTripDeleteSelection)throws {
        guard target.scope==dataScope,receipt.state=="completed",let journal=try linkedTripDeletionRecovery(),try journal.matches(target) else{throw NativeDataError.invalidResponse}
        let request=try journal.decodedRequest()
        guard receipt.requestId==request.requestId,receipt.planId==request.planId,receipt.tripId==journal.tripID,receipt.scopeDigest==request.scopeDigest,receipt.selection==request.selection else{throw NativeDataError.invalidResponse}
        let result=vault.remove(service:linkedDeleteVaultService,owner:target.scope.subject)
        guard result==errSecSuccess || result==errSecItemNotFound else{throw NativeDataError.sessionUnavailable}
    }
    private var linkedDeleteVaultService:String{keychainService+".linked-trip-delete."+(endpoint?.absoluteString ?? "disabled")}

    func linkedTripDeletionRequest(body:Data?=nil,requestID:String?=nil)async throws->Data {
        guard (body==nil) != (requestID==nil),body==nil || body!.count<=192_000,requestID==nil || NativeMemoryWire.uuid(requestID!) else{throw NativeDataError.invalidResponse}
        guard !busy,let initial=dataScope else{throw NativeDataError.sessionUnavailable}
        if let credential,credential.expiresAt<=Date().timeIntervalSince1970+10{await validate()}
        guard dataScope==initial,let credential,let endpoint else{throw NativeDataError.sessionUnavailable}
        var components=URLComponents(url:endpoint.appendingPathComponent("api/privacy/native/v1/linked-trips"),resolvingAgainstBaseURL:false)
        if let requestID{components?.queryItems=[.init(name:"requestId",value:requestID)]}
        guard let url=components?.url else{throw NativeDataError.invalidResponse}
        var request=URLRequest(url:url);request.httpMethod=body==nil ? "GET":"POST";request.httpBody=body;request.httpShouldHandleCookies=false;request.timeoutInterval=30
        request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.setValue("Bearer \(credential.accessToken)",forHTTPHeaderField:"Authorization")
        let (data,response)=try await transport.data(for:request)
        guard dataScope==initial,let http=response as? HTTPURLResponse,data.count<=512_000 else{throw NativeDataError.staleSessionResponse}
        guard [200,202].contains(http.statusCode) else {
            let code=(try? JSONDecoder().decode(NativeDataFailure.self,from:data).error.code) ?? "HTTP_\(http.statusCode)"
            if http.statusCode==401,code != "REAUTHENTICATION_REQUIRED"{handle(SessionError.denied)}
            throw NativeDataError.server(code:code)
        }
        return data
    }

    func coreExportRequest(requestID:String,create:Bool)async throws->Data {
        guard NativeMemoryWire.uuid(requestID) else{throw NativeDataError.invalidResponse}
        let path="api/privacy/native/v1/exports"
        let body=create ? try JSONSerialization.data(withJSONObject:["requestId":requestID,"confirmed":true]):nil
        return try await coreExportTransport(path:path,method:create ? "POST":"GET",body:body,query:create ? []:[.init(name:"requestId",value:requestID)],headers:[:],limit:64_000,expected:[200,202]).0
    }
    func coreExportTicket(requestID:String)async throws->Data {
        guard NativeMemoryWire.uuid(requestID) else{throw NativeDataError.invalidResponse}
        return try await coreExportTransport(path:"api/privacy/native/v1/exports/"+requestID+"/download-ticket",method:"POST",body:Data("{}".utf8),query:[],headers:[:],limit:4096,expected:[200]).0
    }
    func coreExportDownload(requestID:String,operationID:String,token:String)async throws->NativeCoreExportDownload {
        guard NativeMemoryWire.uuid(requestID),NativeMemoryWire.uuid(operationID),token.range(of:"^[A-Za-z0-9_-]{43}$",options:.regularExpression) != nil else{throw NativeDataError.invalidResponse}
        let (bytes,http)=try await coreExportTransport(path:"api/privacy/native/v1/exports/"+requestID+"/download",method:"GET",body:nil,query:[],headers:["X-Export-Operation-ID":operationID,"X-Export-Download-Token":token],limit:8_388_608,expected:[200])
        return .init(bytes:bytes,status:http.statusCode,contentType:http.value(forHTTPHeaderField:"Content-Type"),disposition:http.value(forHTTPHeaderField:"Content-Disposition"),cacheControl:http.value(forHTTPHeaderField:"Cache-Control"))
    }
    private func coreExportTransport(path:String,method:String,body:Data?,query:[URLQueryItem],headers:[String:String],limit:Int,expected:[Int])async throws->(Data,HTTPURLResponse) {
        guard enabled,!busy,let initial=dataScope else{throw NativeDataError.sessionUnavailable}
        if let credential,credential.expiresAt<=Date().timeIntervalSince1970+10{await validate()}
        guard dataScope==initial,let credential,let endpoint,path=="api/privacy/native/v1/exports" || path.hasPrefix("api/privacy/native/v1/exports/"),!path.contains(".."),!path.contains("?"),!path.contains("#") else{throw NativeDataError.sessionUnavailable}
        var components=URLComponents(url:endpoint.appendingPathComponent(path),resolvingAgainstBaseURL:false);components?.queryItems=query.isEmpty ? nil:query
        guard let url=components?.url else{throw NativeDataError.invalidResponse}
        var request=URLRequest(url:url);request.httpMethod=method;request.httpBody=body;request.httpShouldHandleCookies=false;request.timeoutInterval=30
        request.setValue("Bearer \(credential.accessToken)",forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        for (key,value) in headers{request.setValue(value,forHTTPHeaderField:key)}
        let (stream,response)=try await transport.bytes(for:request)
        guard let http=response as? HTTPURLResponse,dataScope==initial else{stream.task.cancel();throw NativeDataError.staleSessionResponse}
        let accepted=expected.contains(http.statusCode),cap=accepted ? limit:4096
        if accepted,http.expectedContentLength>Int64(cap){stream.task.cancel();throw NativeDataError.invalidResponse}
        var bytes=Data();bytes.reserveCapacity(min(cap,64_000))
        for try await byte in stream {
            guard dataScope==initial,!Task.isCancelled,bytes.count<cap else{stream.task.cancel();throw NativeDataError.staleSessionResponse}
            bytes.append(byte)
        }
        guard dataScope==initial else{throw NativeDataError.staleSessionResponse}
        if !accepted {
            let code=(try? JSONDecoder().decode(NativeDataFailure.self,from:bytes).error.code) ?? "HTTP_\(http.statusCode)"
            if http.statusCode==401,code != "REAUTHENTICATION_REQUIRED"{handle(SessionError.denied)}
            throw NativeDataError.server(code:code)
        }
        return (bytes,http)

    }

    func placeActionRequest(tripId: String, body: Data, actor: NativeDataScope) async throws -> Data {
        guard dataScope == actor, NativeMemoryWire.uuid(tripId), body.count <= 16384 else { throw NativeDataError.sessionUnavailable }
        let path = "api/explore/native/v1/trips/\(tripId)/place-actions"
        return try await dataRequest(prefix: path, path: path, method: "POST", body: body)
    }

    func placeGuideRequest(selection: NativePlaceGuideSelection, body: Data) async throws -> Data {
        guard dataScope == selection.scope, selection.valid, body.count <= 12_000 else { throw NativeDataError.sessionUnavailable }
        let path = "api/guide/native/v1/trips/\(selection.tripID)"
        let bytes = try await dataRequest(prefix: path, path: path, method: "POST", body: body)
        guard dataScope == selection.scope, bytes.count <= 65_536 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }

    /// Guide has one fixed original grounded policy/history lane. New turns only use the qualified Guide command.
    func placeGuideGroundedRequest(path: String, method: String, body: Data? = nil, actor: NativeDataScope) async throws -> Data {
        let base = "api/chat/native/v4"
        let allowed = method == "GET" && [base + "/policy", base + "/turns"].contains(path)
            || ["POST", "DELETE"].contains(method) && path == base + "/consent"
        guard dataScope == actor, allowed, (body?.count ?? 0) <= 12_000 else { throw NativeDataError.sessionUnavailable }
        let bytes = try await dataRequest(prefix: base, path: path, method: method, body: body)
        guard dataScope == actor, bytes.count <= 1_000_000 else { throw NativeDataError.staleSessionResponse }
        return bytes
    }

    private var placeGuideJournalService: String { keychainService + ".place-guide-operation." + (endpoint?.absoluteString ?? "disabled") }
    func pendingPlaceGuide(actor: NativeDataScope) throws -> NativePlaceGuidePending? {
        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }
        let (status, bytes) = vault.read(service: placeGuideJournalService, owner: actor.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 32_000 else { throw NativeDataError.sessionUnavailable }
        let pending = try JSONDecoder().decode(NativePlaceGuidePending.self, from: bytes)
        _ = try pending.selection(for: actor); try pending.validatedRecovery()
        if pending.fencedReference == nil && pending.expiresAt <= Date() {
            let fenced = try pending.fenced()
            try writePlaceGuideRecovery(fenced, actor: actor); return fenced
        }
        return pending
    }
    func rememberPlaceGuide(_ pending: NativePlaceGuidePending, policy: NativeTextPolicy, actor: NativeDataScope) throws {
        guard dataScope == actor, policy.valid, policy.consentState == .accepted, pending.noticeHash == policy.noticeHash, pending.expiresAt > Date(),
              try pending.fields()["policyId"] as? String == policy.id else { throw NativeDataError.sessionUnavailable }
        _ = try pending.selection(for: actor)
        if let existing = try pendingPlaceGuide(actor: actor) {
            guard existing == pending else { throw NativeDataError.server(code: "GUIDE_RECOVERY_REQUIRED") }; return
        }
        try writePlaceGuideRecovery(pending, actor: actor)
    }
    func fencePlaceGuide(actor: NativeDataScope) throws {
        guard let pending = try pendingPlaceGuide(actor: actor), pending.fencedReference == nil else { return }
        try writePlaceGuideRecovery(pending.fenced(), actor: actor)
    }
    private func writePlaceGuideRecovery(_ pending: NativePlaceGuidePending, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }
        let bytes = try JSONEncoder().encode(pending)
        guard bytes.count <= 32_000, vault.write(bytes, service: placeGuideJournalService, owner: actor.subject) == errSecSuccess else {
            placeGuide.clear(); voiceAudio.cancel(); failureCode="guideJournalCleanupRequired"; status="storageError"; dataGeneration += 1
            throw NativeDataError.sessionUnavailable
        }
    }
    func completePlaceGuide(_ pending: NativePlaceGuidePending, actor: NativeDataScope) throws {
        let reference = try NativePlaceGuideResultReference(pending)
        guard dataScope == actor, let stored = try pendingPlaceGuide(actor: actor),
              try stored.selection(for: actor) == pending.selection(for: actor),
              stored == pending || stored.fencedReference == reference else { throw NativeDataError.staleSessionResponse }
        let status = vault.remove(service: placeGuideJournalService, owner: actor.subject)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
    func pendingPlaceAction(actor: NativeDataScope) throws -> NativePlaceActionPending? {
        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }
        return try NativePlaceActionJournal(vault: vault).read(actor)
    }
    func rememberPlaceAction(_ command: NativePlaceActionCommand, actor: NativeDataScope) throws -> NativePlaceActionPending {
        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }
        return try NativePlaceActionJournal(vault: vault).retain(command, scope: actor)
    }
    func completePlaceAction(_ pending: NativePlaceActionPending, actor: NativeDataScope) throws {
        guard dataScope == actor else { throw NativeDataError.staleSessionResponse }
        try NativePlaceActionJournal(vault: vault).complete(pending, scope: actor)
    }

    func libraryPlaceRequest(provider:NativePlaceProvider,providerID:String,tripID:String)async throws->Data {
        guard !providerID.isEmpty,providerID.utf16.count<=128,NativeMemoryWire.uuid(tripID) else{throw NativeDataError.invalidResponse}
        let path="api/library/native/v1/place"
        return try await dataRequest(prefix:path,path:path,method:"GET",queryItems:[.init(name:"provider",value:provider.rawValue),.init(name:"providerPoiId",value:providerID),.init(name:"tripId",value:tripID)])
    }

    func librarySourcesRequest(source:NativeLibrarySource,query:String,cursor:String?)async throws->Data {
        guard query.utf16.count<=120,cursor==nil || NativeLibraryCursor.valid(cursor!,source:source,query:query.isEmpty ? nil:query) else{throw NativeDataError.invalidResponse}
        let path="api/library/native/v1/items"
        var q=[URLQueryItem(name:"source",value:source.rawValue)]
        if !query.isEmpty{q.append(.init(name:"query",value:query))};if let cursor{q.append(.init(name:"cursor",value:cursor))}
        return try await dataRequest(prefix:path,path:path,method:"GET",queryItems:q)
    }
    func librarySourceItem(_ reference:NativeLibraryMetadata)async throws->Data {
        guard reference.valid else{throw NativeDataError.invalidResponse}
        let path="api/library/native/v1/item"
        var q=[URLQueryItem(name:"source",value:reference.source.rawValue),URLQueryItem(name:"id",value:reference.id)]
        if let revision=reference.revision{q.append(.init(name:"revision",value:String(revision)))}
        return try await dataRequest(prefix:path,path:path,method:"GET",queryItems:q)
    }

    func fiveResultReference(field: String, id: String) async throws -> Data {
        guard ["task", "trip"].contains(field), UUID(uuidString:id) != nil else { throw NativeDataError.invalidResponse }
        let path = "api/results/native/v2/" + field
        return try await dataRequest(prefix:path,path:path,method:"GET",queryItems:[URLQueryItem(name:field+"Id",value:id)])
    }
    func fiveResultSearchRequest(query: String, cursor: String?) async throws -> Data {
        guard query.utf16.count<=120,cursor==nil || UUID(uuidString:cursor!) != nil else {throw NativeDataError.invalidResponse}
        let path="api/results/native/v2/search"
        var q=[URLQueryItem(name:"query",value:query)];if let cursor{q.append(URLQueryItem(name:"cursor",value:cursor))}
        return try await dataRequest(prefix:path,path:path,method:"GET",queryItems:q)
    }
    func chooseFiveResultDecision(_ body: Data) async throws -> Data {
        guard body.count<=2048 else {throw NativeDataError.invalidResponse}
        let path="api/results/native/v2/decision"
        return try await dataRequest(prefix:path,path:path,method:"POST",body:body)
    }

    func fiveResultRequest(artifactID: String, revision: Int) async throws -> Data {
        guard UUID(uuidString: artifactID) != nil, (1...1000).contains(revision) else { throw NativeDataError.invalidResponse }
        let path = "api/results/native/v2"
        let bytes = try await dataRequest(prefix: path, path: path, method: "GET", queryItems: [URLQueryItem(name:"artifactId",value:artifactID),URLQueryItem(name:"revision",value:String(revision))])
        guard bytes.count <= 100_000 else { throw NativeDataError.invalidResponse }; return bytes
    }

    func selectedSourceMessageRequest(_ body: Data) async throws -> Data {
        guard askMode == .assistant, body.count <= 16_384 else { throw NativeDataError.invalidResponse }
        let path = "api/chat/native/v6/conversation"
        return try await dataRequest(prefix: path, path: path, method: "POST", body: body)
    }
    func selectedSourceContextRequest(_ body: Data) async throws -> Data {
        guard askMode == .assistant, body.count <= 8192 else { throw NativeDataError.invalidResponse }
        let path = "api/chat/native/v6/context"
        return try await dataRequest(prefix: path, path: path, method: "POST", body: body)
    }

    func travelIntakeRequest(conversationID: String, goalID: String) async throws -> Data {
        guard askMode == .assistant, UUID(uuidString: conversationID) != nil,
              UUID(uuidString: goalID) != nil else { throw NativeDataError.invalidResponse }
        let path = "api/chat/native/v5/travel-intake"
        let data = try await dataRequest(prefix: path, path: path, method: "GET",
            queryItems: [URLQueryItem(name: "conversationId", value: conversationID), URLQueryItem(name: "goalId", value: goalID)])
        guard data.count <= 32_000 else { throw NativeDataError.invalidResponse }
        return data
    }

    func travelIntakeWriteBasisRequest(conversationID: String, goalID: String) async throws -> Data {
        guard askMode == .assistant, UUID(uuidString: conversationID) != nil,
              UUID(uuidString: goalID) != nil else { throw NativeDataError.invalidResponse }
        let path = "api/chat/native/v5/travel-intake/write-basis"
        let data = try await dataRequest(prefix: path, path: path, method: "GET",
            queryItems: [URLQueryItem(name: "conversationId", value: conversationID), URLQueryItem(name: "goalId", value: goalID)])
        guard data.count <= 10_000 else { throw NativeDataError.invalidResponse }
        return data
    }

    func submitTravelIntakeRequest(_ body: Data) async throws -> Data {
        guard askMode == .assistant, body.count <= 32_000 else { throw NativeDataError.invalidResponse }
        let path = "api/chat/native/v5/travel-intake"
        let data = try await dataRequest(prefix: path, path: path, method: "POST", body: body)
        guard data.count <= 10_000 else { throw NativeDataError.invalidResponse }
        return data
    }

    /// Fixed read-only activity path; credentials and scope remain in this transport.
    func taskActivityRequest(conversationID: String, taskID: String) async throws -> Data {
        guard askMode == .assistant, UUID(uuidString: conversationID) != nil,
              UUID(uuidString: taskID) != nil else { throw NativeDataError.invalidResponse }
        let prefix = "api/chat/native/v5/conversations"
        let bytes = try await dataRequest(prefix: prefix,
            path: "\(prefix)/\(conversationID)/tasks/\(taskID)/activity", method: "GET")
        guard bytes.count <= 10_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Local Ask shares identity fencing, never credentials, with the Trip consumer.
    func askRequest(path: String, method: String, body: Data? = nil) async throws -> Data {
        guard askMode != .unavailable else { throw NativeDataError.invalidResponse }
        let prefix = Self.askRequestPrefix(mode: askMode, path: path, method: method)
        let data = try await dataRequest(prefix: prefix, path: path, method: method, body: body)
        guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        return data
    }

    static func askRequestPrefix(mode: NativeAskMode, path: String, method: String) -> String {
        let cancelPrefix = "api/chat/native/v1/turns/"
        let cancelID = path.hasPrefix(cancelPrefix) && path.hasSuffix("/cancel")
            ? String(path.dropFirst(cancelPrefix.count).dropLast("/cancel".count)) : ""
        let cancellation = method == "POST" && UUID(uuidString: cancelID) != nil
        let assistantTaskHistory = mode == .assistant && method == "GET" && path == "api/chat/native/v2/turns"
        return (mode.usesTask || mode == .assistant) && cancellation ? "api/chat/native/v1"
            : assistantTaskHistory ? "api/chat/native/v2" : mode.base
    }

    private var memoryDeleteVaultService:String {keychainService+".memory-bulk-delete."+(endpoint?.absoluteString ?? "disabled")}
    func memoryDeletionRecovery() throws -> NativeMemoryDeleteJournal? {
        guard let scope=dataScope else{throw NativeDataError.sessionUnavailable}
        let (status,bytes)=vault.read(service:memoryDeleteVaultService,owner:scope.subject)
        if status==errSecItemNotFound{return nil}
        guard status==errSecSuccess,let bytes,bytes.count<=262_144 else{throw NativeDataError.sessionUnavailable}
        let journal=try JSONDecoder().decode(NativeMemoryDeleteJournal.self,from:bytes)
        guard journal.matches(scope) else{throw NativeDataError.staleSessionResponse}
        _=try journal.command();return journal
    }
    func rememberMemoryDeletion(_ command:NativeMemoryDeleteCommand,body:Data) throws {
        guard let scope=dataScope,try NativeMemoryDeleteCommand.decode(body)==command else{throw NativeDataError.sessionUnavailable}
        if let existing=try memoryDeletionRecovery(){
            guard existing.body==body,try existing.command()==command else{throw NativeDataError.server(code:"MEMORY_DELETE_RECOVERY_REQUIRED")};return
        }
        let journal=NativeMemoryDeleteJournal(endpoint:scope.endpoint,owner:scope.subject,epoch:scope.mobileEpoch,body:body)
        let bytes=try JSONEncoder().encode(journal)
        guard bytes.count<=262_144,vault.write(bytes,service:memoryDeleteVaultService,owner:scope.subject)==errSecSuccess else{throw NativeDataError.sessionUnavailable}
    }
    func completeMemoryDeletion(_ receipt:NativeMemoryDeleteReceipt) throws {
        guard let scope=dataScope,let journal=try memoryDeletionRecovery(),receipt.state=="completed" else{throw NativeDataError.invalidResponse}
        let command=try journal.command()
        guard receipt.requestId==command.requestId,receipt.planId==command.planId,receipt.scopeDigest==command.scopeDigest,receipt.selection==command.selection,receipt.sourceTombstoned,!receipt.cleanupPending else{throw NativeDataError.invalidResponse}
        let status=vault.remove(service:memoryDeleteVaultService,owner:scope.subject)
        guard status==errSecSuccess || status==errSecItemNotFound else{throw NativeDataError.sessionUnavailable}
    }
    func memoryDeletionRequest(body:Data?=nil,requestID:String?=nil) async throws -> Data {
        guard enabled,!busy,let initial=dataScope,body==nil || body!.count<=192_000,requestID==nil || NativeMemoryWire.uuid(requestID!),body != nil || requestID != nil,body==nil || requestID==nil else{throw NativeDataError.sessionUnavailable}
        if let credential,credential.expiresAt<=Date().timeIntervalSince1970+10{await validate()}
        guard dataScope==initial,let credential,let endpoint else{throw NativeDataError.sessionUnavailable}
        var components=URLComponents(url:endpoint.appendingPathComponent("api/privacy/native/v1/memories/delete"),resolvingAgainstBaseURL:false)
        if let requestID{components?.queryItems=[.init(name:"requestId",value:requestID)]}
        guard let url=components?.url else{throw NativeDataError.invalidResponse}
        var request=URLRequest(url:url);request.httpMethod=body==nil ? "GET":"POST";request.httpBody=body;request.httpShouldHandleCookies=false;request.timeoutInterval=30
        request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.setValue("Bearer \(credential.accessToken)",forHTTPHeaderField:"Authorization")
        let (bytes,response)=try await transport.data(for:request)
        guard dataScope==initial,let http=response as? HTTPURLResponse,bytes.count<=512_000 else{throw NativeDataError.staleSessionResponse}
        guard [200,202].contains(http.statusCode) else{
            let code=(try? JSONDecoder().decode(NativeDataFailure.self,from:bytes).error.code) ?? "HTTP_\(http.statusCode)"
            if http.statusCode==401,code != "REAUTHENTICATION_REQUIRED"{handle(SessionError.denied)}
            throw NativeDataError.server(code:code)
        }
        return bytes
    }

    func memoryProfilesRequest()async throws->Data {
        let path="api/memory/native/v1/profiles"
        return try await dataRequest(prefix:path,path:path,method:"GET")
    }
    func memoryProfilesCommand(_ body:Data)async throws->Data {
        guard body.count<=8192 else{throw NativeDataError.invalidResponse}
        let path="api/memory/native/v1/profiles"
        return try await dataRequest(prefix:path,path:path,method:"POST",body:body)
    }

    func memoryRequest(path: String = "api/memory/native/v1/travel-pace", method: String, body: Data? = nil) async throws -> Data {
        try await dataRequest(prefix: "api/memory/native/v1/travel-pace", path: path, method: method, body: body)
    }

    /// Translation always uses the current-input lane, independently of Ask mode.
    func translateRequest(path: String, method: String, body: Data? = nil) async throws -> Data {
        let data = try await dataRequest(prefix: "api/translate", path: path, method: method, body: body)
        guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        return data
    }

    /// Fixed GET-only opt-in saved translation readers; no producer or body.
    func translationHistoryRequest(cursor: String? = nil, turnID: String? = nil, query: String? = nil) async throws -> Data {
        guard query == nil || (query?.utf16.count ?? 0) <= NativeTranslationHistoryWire.maximumQueryUnits,
              cursor == nil || NativeTranslationHistoryWire.cursorTurn(cursor ?? "", query: query) != nil,
              turnID == nil || (cursor == nil && query == nil && UUID(uuidString: turnID ?? "") != nil) else { throw NativeDataError.invalidResponse }
        let base = "api/translate/history/v2"
        let path = turnID.map { base + "/turns/" + $0.lowercased() } ?? base
        var queryItems = cursor.map { [URLQueryItem(name: "cursor", value: query == nil ? $0.lowercased() : $0)] } ?? []
        if let query { queryItems.append(URLQueryItem(name: "query", value: query)) }
        let data = try await dataRequest(prefix: base, path: path, method: "GET", queryItems: queryItems)
        guard data.count <= NativeTranslationHistoryWire.maximumResponseBytes else { throw NativeDataError.invalidResponse }
        return data
    }

    private func dataRequest(prefix: String, path: String, method: String, body: Data? = nil, queryItems: [URLQueryItem] = []) async throws -> Data {
        guard enabled, !busy, let initial = dataScope else { throw NativeDataError.sessionUnavailable }
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 10 {
            await validate()
        }
        guard dataScope == initial, let credential, let endpoint else { throw NativeDataError.sessionUnavailable }
        guard path == prefix || path.hasPrefix(prefix + "/"),
              !path.contains(".."), !path.contains("?"), !path.contains("#") else { throw NativeDataError.invalidResponse }
        guard var target = URLComponents(url: endpoint.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { throw NativeDataError.invalidResponse }
        target.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = target.url else { throw NativeDataError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if path.hasSuffix("/ai-assist") { request.timeoutInterval = 90 }
        request.httpShouldHandleCookies = false
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await transport.data(for: request)
        guard dataScope == initial else { throw NativeDataError.staleSessionResponse }
        guard let http = response as? HTTPURLResponse else { throw NativeDataError.invalidResponse }
        if http.statusCode == 401 {
            handle(SessionError.denied)
            throw NativeDataError.sessionUnavailable
        }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(NativeDataFailure.self, from: data)
            throw NativeDataError.server(code: envelope?.error.code ?? "HTTP_\(http.statusCode)")
        }
        return data
    }

    /// Read one bounded live connection. Reconnection never sends an Ask request.
    func askEvents(turnId: String, after: Int, receive: (NativeAskEventDecoder.Frame, TimeInterval) throws -> Void) async throws {
        guard askMode == .grounded, enabled, !busy, UUID(uuidString: turnId) != nil,
              after >= 0, after <= 999_999_999_999_999, let initial = dataScope else { throw NativeDataError.sessionUnavailable }
        if let credential, credential.expiresAt <= Date().timeIntervalSince1970 + 15 { await validate() }
        guard dataScope == initial, let credential, let endpoint else { throw NativeDataError.sessionUnavailable }
        let url = endpoint.appendingPathComponent("api/chat/native/v4/turns/\(turnId)/events")
        var request = URLRequest(url: url)
        request.httpShouldHandleCookies = false
        request.timeoutInterval = 15
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(credential.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(String(after), forHTTPHeaderField: "Last-Event-ID")
        let started = ProcessInfo.processInfo.systemUptime
        let (bytes, response) = try await transport.bytes(for: request)
        defer { bytes.task.cancel() }
        let remaining = max(0, 15 - (ProcessInfo.processInfo.systemUptime - started))
        let deadline = Task {
            try await Task.sleep(for: .seconds(remaining))
            bytes.task.cancel()
        }
        defer { deadline.cancel() }
        guard dataScope == initial else { throw NativeDataError.staleSessionResponse }
        guard let http = response as? HTTPURLResponse else { throw NativeDataError.invalidResponse }
        if http.statusCode == 401 { handle(SessionError.denied); throw NativeDataError.sessionUnavailable }
        guard http.statusCode == 200,
              http.value(forHTTPHeaderField: "Content-Type")?.lowercased().hasPrefix("text/event-stream") == true else { throw NativeDataError.invalidResponse }
        var parser = NativeAskEventDecoder()
        var count = 0
        for try await byte in bytes {
            try Task.checkCancellation()
            count += 1
            guard dataScope == initial else { throw NativeDataError.staleSessionResponse }
            guard count <= 2_097_152, ProcessInfo.processInfo.systemUptime - started < 15 else { throw NativeDataError.invalidResponse }
            if let frame = try parser.append(byte) { try receive(frame, ProcessInfo.processInfo.systemUptime - started) }
        }
        try Task.checkCancellation()
        guard dataScope == initial else { throw NativeDataError.staleSessionResponse }
        try parser.finish()
    }

    func restore() async {
        guard prepareDeviceMaterials() else { return }
        guard enabled, !busy, credential == nil, let owner = defaults.string(forKey: storageKey) else { return }
        do {
            credential = try read(owner: owner)
            await validate()
        } catch {
            // A locked/unreadable vault is not proof that no request was sent.
            // Preserve the record for a later restore; never silently discard it.
            credential = nil; subject = nil; mobileEpoch = nil; displayName = nil
            status = "storageError"
        }
    }

    func login(email: String, password: String) async {
        guard enabled, !busy else { return }
        busy = true
        defer { busy = false }
        // A deliberate account change clears all old account data before sending the new request.
        let anonymousResume: UUID?
        do {
            anonymousResume = credential == nil && defaults.string(forKey: storageKey) == nil
                && defaults.object(forKey: storageKey + ".signOutIntent") == nil
                && defaults.string(forKey: storageKey + ".pendingJournalCleanupOwner") == nil
                && defaults.string(forKey: storageKey + ".recoveryCleanupOwner") == nil
                ? try entryResume.initialLoginPreservation() : nil
        } catch { failureCode="entryResumeCleanupRequired";status="storageError";return }
        guard clear(preservingAnonymousResume: anonymousResume) else { return }
        defaults.removeObject(forKey: storageKey + ".signOutIntent")
        deviceMaterialSignOutFence = false // Only a deliberate new login after cleanup reopens consumption.
        let attempt = UUID().uuidString
        let generation = dataGeneration
        do {
            let data = try await request("credentials", body: ["email": email, "password": password, "attemptId": attempt])
            try ensureCurrent(generation)
            var value = try JSONDecoder().decode(TokenReply.self, from: data)
            let pending = NativeCredential(subject: value.subject, accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt, attemptId: attempt, mobileEpoch: nil)
            credential = pending
            try save(pending)
            let reply = try await request("login", body: ["attemptId": attempt], token: value.accessToken)
            try ensureCurrent(generation)
            let state = try JSONDecoder().decode(SessionReply.self, from: reply)
            guard state.subject == value.subject else { throw SessionError.invalid }
            value.mobileEpoch = state.mobileEpoch
            try accept(value, attempt: attempt)
            try await loadProfile()
        } catch { if dataGeneration == generation { handle(error) } }
    }

    func validate() async {
        guard enabled, !busy, let existing = credential else { return }
        let generation = dataGeneration
        busy = true
        defer { busy = false }
        do {
            if existing.mobileEpoch == nil {
                let data = try await request("login", body: ["attemptId": existing.attemptId], token: existing.accessToken)
                try ensureCurrent(generation)
                let state = try JSONDecoder().decode(SessionReply.self, from: data)
                guard state.subject == existing.subject else { throw SessionError.invalid }
                var updated = existing
                updated.mobileEpoch = state.mobileEpoch
                credential = updated
                try save(updated)
                subject = updated.subject
                mobileEpoch = updated.mobileEpoch
                status = "active"
                try await loadProfile()
            } else {
                let data = try await request("refresh", body: ["refreshToken": existing.refreshToken])
                try ensureCurrent(generation)
                let reply = try JSONDecoder().decode(TokenReply.self, from: data)
                guard reply.subject == existing.subject, reply.mobileEpoch == existing.mobileEpoch else { throw SessionError.invalid }
                try accept(reply, attempt: existing.attemptId)
                try await loadProfile()
            }
        } catch { if dataGeneration == generation { handle(error) } }
    }

    func logout() async {
        guard !busy else { return }
        defaults.set(credential?.subject ?? defaults.string(forKey: storageKey) ?? defaults.string(forKey: storageKey + ".pendingJournalCleanupOwner") ?? defaults.string(forKey: storageKey + ".recoveryCleanupOwner") ?? "unbound", forKey: storageKey + ".signOutIntent")
        deviceMaterialSignOutFence = true
        placeGuide.clear()
        do { try voiceAudio.erase() }
        catch { failureCode="voiceAudioCleanupRequired";status="storageError";return }
        do { try entryResume.erase() }
        catch { failureCode="entryResumeCleanupRequired";status="storageError";return }
        subject=nil; mobileEpoch=nil; displayName=nil; status="signingOut"
        do { try NativePDFInbox().eraseAll() }
        catch { failureCode="pdfIntakeCleanupRequired";status="storageError";return }
        do { try deviceMaterials.eraseAll() }
        catch { failureCode="deviceMaterialCleanupRequired";status="storageError";return }
        do{try offlineTrips.eraseAll()}catch{failureCode="offlineCleanupRequired";return}
        let generation = dataGeneration
        busy = true
        defer { busy = false }
        if let existing = credential {
            do {
                var token = existing.accessToken
                if existing.expiresAt <= Date().timeIntervalSince1970 + 10 {
                    let data = try await request("refresh", body: ["refreshToken": existing.refreshToken])
                    try ensureCurrent(generation)
                    let reply = try JSONDecoder().decode(TokenReply.self, from: data)
                    guard reply.subject == existing.subject, reply.mobileEpoch == existing.mobileEpoch else { throw SessionError.invalid }
                    try accept(reply, attempt: existing.attemptId)
                    token = reply.accessToken
                }
                _ = try await request("logout", body: [:], token: token)
                try ensureCurrent(generation)
            } catch { if dataGeneration == generation { handle(error) }; return }
        }
        if clear() { status = "signedOut" }
    }

    private func loadProfile() async throws {
        guard let credential else { throw SessionError.invalid }
        let generation = dataGeneration
        let data = try await request("profile", body: [:], token: credential.accessToken)
        try ensureCurrent(generation)
        let reply = try JSONDecoder().decode(ProfileReply.self, from: data)
        guard reply.subject == credential.subject else { throw SessionError.invalid }
        displayName = reply.displayName
    }

    private func accept(_ reply: TokenReply, attempt: String) throws {
        let retained = credential?.subject == reply.subject && credential?.mobileEpoch == reply.mobileEpoch ? credential?.pendingAsk : nil
        let value = NativeCredential(subject: reply.subject, accessToken: reply.accessToken, refreshToken: reply.refreshToken, expiresAt: reply.expiresAt, attemptId: attempt, mobileEpoch: reply.mobileEpoch, pendingAsk: retained)
        try save(value)
        credential = value
        subject = value.subject
        mobileEpoch = value.mobileEpoch
        status = deviceMaterialSignOutFence ? "signingOut" : "active"
    }

    private func ensureCurrent(_ generation: Int) throws {
        guard dataGeneration == generation else { throw SessionError.superseded }
    }

    private func handle(_ error: Error) {
        if case SessionError.superseded = error { return }
        if let value = error as? URLError { failureCode = "network:\(value.code.rawValue)" }
        else if error is DecodingError { failureCode = "response-decoding" }
        else if case SessionError.storage(let code) = error { failureCode = "keychain:\(code)" }
        else if case SessionError.http(let code) = error { failureCode = "http:\(code)" }
        else { failureCode = "session" }
        #if DEBUG
        FileHandle.standardError.write(Data("VisePanda native session failed: \(failureCode ?? "session")\n".utf8))
        #endif
        subject = nil
        mobileEpoch = nil
        displayName = nil
        if case SessionError.denied = error { if clear(preservePendingJournals: !deviceMaterialSignOutFence) { status = "expiredOrReplaced" } }
        else { status = "retry" }
    }

    private func request(_ action: String, body: [String: String], token: String? = nil) async throws -> Data {
        guard let endpoint else { throw SessionError.invalid }
        var request = URLRequest(url: endpoint.appendingPathComponent("api/auth/native/v2/\(action)"))
        request.httpMethod = action == "profile" ? "GET" : "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if action != "profile" { request.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await transport.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw SessionError.invalid }
        #if DEBUG
        FileHandle.standardError.write(Data("VisePanda native \(action) HTTP \(http.statusCode)\n".utf8))
        #endif
        if http.statusCode == 401 || http.statusCode == 409 { throw SessionError.denied }
        guard http.statusCode == 200 else { throw SessionError.http(http.statusCode) }
        return data
    }

    private var vaultService: String { keychainService + "." + (endpoint?.absoluteString ?? "disabled") }
    private func save(_ value: NativeCredential) throws {
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 64_000 else { throw SessionError.storage(errSecParam) }
        let result = vault.write(bytes, service: vaultService, owner: value.subject)
        guard result == errSecSuccess else { throw SessionError.storage(result) }
        defaults.set(value.subject, forKey: storageKey)
    }
    private func read(owner: String) throws -> NativeCredential {
        let (found, bytes) = vault.read(service: vaultService, owner: owner)
        guard found == errSecSuccess else { throw SessionError.storage(found) }
        guard let data = bytes, data.count <= 64_000 else { throw SessionError.storage(errSecDecode) }
        let value = try JSONDecoder().decode(NativeCredential.self, from: data)
        guard value.subject == owner,
              value.pendingAsk == nil || (value.pendingAsk?.valid == true && value.pendingAsk?.mobileEpoch == value.mobileEpoch) else { throw SessionError.storage(errSecDecode) }
        return value
    }
    @discardableResult func prepareDeviceMaterials() -> Bool {
        guard !deviceMaterialSignOutFence else { return false }
        do {
            var preserve=false
            if let owner=credential?.subject ?? defaults.string(forKey:storageKey) {
                let (status,bytes)=vault.read(service:materialDeleteRequestService,owner:owner)
                if status==errSecSuccess {
                    guard let bytes else{throw InboxError.invalidInput}
                    let pending=try NativeDeviceMaterialDeleteRequest.decode(bytes)
                    let stored=try credential ?? read(owner:owner)
                    guard pending.namespace.owner==owner,pending.namespace.endpoint==endpoint?.absoluteString,pending.namespace.epoch==stored.mobileEpoch else{throw InboxError.invalidInput}
                    preserve=true // Recover only selected files; bootstrap must not erase unselected copies.
                } else if status != errSecItemNotFound { throw NativeDataError.sessionUnavailable }
            }
            try deviceMaterials.firstAccess(preservingInbox:preserve);return true
        }
        catch { failureCode="deviceMaterialCleanupRequired"; return false }
    }

    func receiveDeviceScreenshot(_ data: Data, owner: String) throws -> NativeScreenshotInbox.Receipt {
        guard let scope = dataScope, scope.subject == owner, prepareDeviceMaterials(),try pendingDeviceMaterialDeletion()==nil else { throw InboxError.invalidInput }
        return try deviceMaterials.receive(data, scope: scope)
    }

    @discardableResult private func clear(preservePendingJournals: Bool = false, preservingAnonymousResume: UUID? = nil) -> Bool {
        // Fence consumers before cleanup; a locked file is not proof of erasure.
        dataGeneration += 1
        notifications.actorChanged(to: nil)
        placeGuide.clear()
        do { try voiceAudio.erase() }
        catch { failureCode="voiceAudioCleanupRequired";status="storageError";return false }
        do { try entryResume.erase(preservingUnclaimedID: preservingAnonymousResume) }
        catch { failureCode="entryResumeCleanupRequired";status="storageError";return false }
        subject=nil; mobileEpoch=nil; displayName=nil
        do { try NativeCoverageProgressExportFile.eraseAll() }
        catch { failureCode="coverageProgressExportCleanupRequired"; status="storageError"; return false }
        do { try NativeNotificationDataExportFile.eraseAll() }
        catch { failureCode="notificationDataExportCleanupRequired"; status="storageError"; return false }
        do { try NativeMaterialReferenceExportFile.eraseAll() }
        catch { failureCode="materialReferenceExportCleanupRequired"; status="storageError"; return false }
        do { try NativeDataCoverageExportFile.eraseAll() }
        catch { failureCode="dataCoverageExportCleanupRequired"; status="storageError"; return false }
        do { try NativeExperienceExportFile.eraseAll() }
        catch { failureCode="communityExperienceExportCleanupRequired"; status="storageError"; return false }
        do { try NativeCommunitySafetyExportFile.eraseAll() }
        catch { failureCode="communitySafetyExportCleanupRequired"; status="storageError"; return false }
        do { try NativeCommunityExportFile.eraseAll() }
        catch { failureCode="communityExportCleanupRequired"; status="storageError"; return false }
        do { try NativePDFInbox().eraseAll() }
        catch { failureCode="pdfIntakeCleanupRequired";status="storageError";return false }
        do { try deviceMaterials.eraseAll() }
        catch { failureCode="deviceMaterialCleanupRequired";status="storageError";return false }
        do{try offlineTrips.eraseAll()}catch{failureCode="offlineCleanupRequired";status="storageError";return false}
        dataGeneration += 1
        assistantNavigation=nil
        memoryPreferences.clear()
        exploreAskHandoff=nil
        if let owner = credential?.subject ?? defaults.string(forKey: storageKey) ?? defaults.string(forKey: storageKey + ".pendingJournalCleanupOwner") ?? defaults.string(forKey: storageKey + ".recoveryCleanupOwner") {
            do { try NativeDataCoverageJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
            catch { failureCode="dataCoverageJournalCleanupRequired"; status="storageError"; return false }
            do { try NativeExperienceJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
            catch { failureCode="communityExperienceJournalCleanupRequired"; status="storageError"; return false }
            do { try NativeCommunitySafetyJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
            catch { failureCode="communitySafetyJournalCleanupRequired"; status="storageError"; return false }
            do { try NativeCommunityJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
            catch { failureCode="communityJournalCleanupRequired"; status="storageError"; return false }
            if preservePendingJournals {
                // Noncredential cleanup index only. It cannot restore a session or authorize a journal read.
                defaults.set(owner, forKey: storageKey + ".pendingJournalCleanupOwner")
            } else {
                do { try NativeCoverageProgressJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="coverageProgressJournalCleanupRequired"; status="storageError"; return false }
                do { try NativeNotificationDataJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="notificationDataJournalCleanupRequired"; status="storageError"; return false }
                do { try NativeMaterialReferenceJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="materialReferenceJournalCleanupRequired"; status="storageError"; return false }
                let guide = vault.remove(service: placeGuideJournalService, owner: owner)
                guard guide == errSecSuccess || guide == errSecItemNotFound else { failureCode="guideJournalCleanupRequired";status="storageError";return false }
                do { try NativeRecoveryJournal(vault: vault).erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner) }
                catch { failureCode="recoveryJournalCleanupRequired";status="storageError";return false }
                do { try NativeReservationJournalVault.remove(endpoint:endpoint?.absoluteString ?? "disabled",owner:owner,vault:vault) }
                catch { failureCode="reservationCleanupRequired";status="storageError";return false }
                do { try NativePDFJournalVault.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="pdfIntakeJournalCleanupRequired";status="storageError";return false }
                do { try NativeScopedTripJournalVault.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="scopedEditCleanupRequired";status="storageError";return false }
                do { try NativePlaceActionJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="placeActionCleanupRequired";status="storageError";return false }
                do { try NativeServiceOperationJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="serviceOperationCleanupRequired";status="storageError";return false }
                do { try NativeTravelerBriefJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="travelerBriefCleanupRequired";status="storageError";return false }
                do {
                    try NativeNotificationJournal.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault)
                    try NativeNotificationJournal.eraseBinding(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault)
                } catch { failureCode="notificationCleanupRequired";status="storageError";return false }
                do { try NativeTripLifecycleJournalVault.erase(endpoint: endpoint?.absoluteString ?? "disabled", owner: owner, vault: vault) }
                catch { failureCode="tripLifecycleCleanupRequired";status="storageError";return false }
            }
            let support=vault.remove(service:tripSupportConfirmVaultService,owner:owner)
            guard support==errSecSuccess || support==errSecItemNotFound else { failureCode="keychain:\(support)";status="storageError";return false }
            for service in [materialDeleteRequestService,materialDeleteReceiptService] {
                let result=vault.remove(service:service,owner:owner)
                guard result==errSecSuccess || result==errSecItemNotFound else{failureCode="keychain:\(result)";status="storageError";return false}
            }
            let readiness=vault.remove(service:readinessSaveService,owner:owner)
            guard readiness==errSecSuccess || readiness==errSecItemNotFound else{failureCode="keychain:\(readiness)";status="storageError";return false}
            let memoryDelete=vault.remove(service:memoryDeleteVaultService,owner:owner)
            guard memoryDelete==errSecSuccess || memoryDelete==errSecItemNotFound else{failureCode="keychain:\(memoryDelete)";status="storageError";return false}
            let linked=vault.remove(service:linkedDeleteVaultService,owner:owner)
            guard linked==errSecSuccess || linked==errSecItemNotFound else{subject=nil;mobileEpoch=nil;displayName=nil;failureCode="keychain:\(linked)";status="storageError";return false}
            let result = vault.remove(service: vaultService, owner: owner)
            guard result == errSecSuccess || result == errSecItemNotFound else {
                subject = nil; mobileEpoch = nil; displayName = nil
                failureCode = "keychain:\(result)"; status = "storageError"
                return false
            }
        }
        defaults.removeObject(forKey: storageKey)
        if !preservePendingJournals {
            defaults.removeObject(forKey: storageKey + ".pendingJournalCleanupOwner")
            defaults.removeObject(forKey: storageKey + ".recoveryCleanupOwner")
        }
        credential = nil
        subject = nil
        mobileEpoch = nil
        displayName = nil
        return true
    }
    private enum SessionError: Error { case denied, invalid, superseded, storage(OSStatus), http(Int) }
    private struct TokenReply: Decodable {
        let subject: String
        let accessToken: String
        let refreshToken: String
        let expiresAt: Double
        var mobileEpoch: Int?
    }
    private struct ProfileReply: Decodable { let subject: String; let displayName: String? }
    private struct SessionReply: Decodable { let subject: String; let mobileEpoch: Int }
}

struct NativeDataScope: Hashable, Sendable {
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let generation: Int
}

enum NativeDataError: Error {
    case sessionUnavailable, staleSessionResponse, invalidResponse
    case server(code: String)
}

private struct NativeDataFailure: Decodable {
    struct Failure: Decodable { let code: String }
    let error: Failure
}

/// A synchronous storage boundary keeps write-before-send testable. Production
/// always uses the existing owner/endpoint Keychain item, never UserDefaults text.
@MainActor
protocol NativeCredentialVault {
    func write(_ data: Data, service: String, owner: String) -> OSStatus
    func read(service: String, owner: String) -> (OSStatus, Data?)
    func remove(service: String, owner: String) -> OSStatus
}

struct NativeKeychainVault: NativeCredentialVault {
    private func query(service: String, owner: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: owner]
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        let lookup = query(service: service, owner: owner)
        let result = SecItemUpdate(lookup as CFDictionary, [kSecValueData: data] as CFDictionary)
        guard result == errSecItemNotFound else { return result }
        var insert = lookup
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        return SecItemAdd(insert as CFDictionary, nil)
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        var lookup = query(service: service, owner: owner)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var data: CFTypeRef?
        let result = SecItemCopyMatching(lookup as CFDictionary, &data)
        return (result, data as? Data)
    }
    func remove(service: String, owner: String) -> OSStatus {
        SecItemDelete(query(service: service, owner: owner) as CFDictionary)
    }
}
