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
    private var credential: NativeCredential?
    private let endpoint: URL?
    let askMode: NativeAskMode
    private let transport: URLSession
    private let defaults: UserDefaults
    private let vault: any NativeCredentialVault
    private let storageKey: String
    private let keychainService = "com.visepanda.native.local-session.v2"

    init(arguments: [String] = ProcessInfo.processInfo.arguments, defaults: UserDefaults = .standard, configuration: URLSessionConfiguration = .ephemeral, bundleConfiguration: [String: String] = Bundle.main.infoDictionary?.compactMapValues { $0 as? String } ?? [:], vault: any NativeCredentialVault = NativeKeychainVault()) {
        endpoint = Self.resolveEndpoint(arguments: arguments, bundleConfiguration: bundleConfiguration)
        let installed = bundleConfiguration["VisePandaNativeTaskContext", default: ""]
        if !installed.isEmpty { askMode = NativeAskMode(rawValue: installed) ?? .unavailable }
        else if endpoint?.scheme == "http", arguments.contains("-VisePandaGroundedMode") { askMode = .grounded }
        else if endpoint?.scheme == "http", arguments.contains("-VisePandaTaskContext") { askMode = .taskContext }
        else { askMode = .currentInput }
        self.defaults = defaults
        self.vault = vault
        storageKey = "native.v2.activeSubject.\(endpoint?.absoluteString ?? "disabled")"
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        transport = URLSession(configuration: configuration, delegate: NativeRedirectBlocker(), delegateQueue: nil)
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
        guard status == "active", let subject, let mobileEpoch,
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

    func serviceCaseRequest(body: Data) async throws -> Data {
        try await dataRequest(prefix: "api/service-cases/native/v1", path: "api/service-cases/native/v1", method: "POST", body: body)
    }

    /// The Trip consumer receives response bytes, never the Keychain credential.
    func tripRequest(path: String, method: String, body: Data? = nil, queryItems: [URLQueryItem] = []) async throws -> Data {
        try await dataRequest(prefix: "api/trips/native/v2", path: path, method: method, body: body, queryItems: queryItems)
    }

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

    /// Local Ask shares identity fencing, never credentials, with the Trip consumer.
    func askRequest(path: String, method: String, body: Data? = nil) async throws -> Data {
        guard askMode != .unavailable else { throw NativeDataError.invalidResponse }
        let cancelPrefix = "api/chat/native/v1/turns/"
        let cancelID = path.hasPrefix(cancelPrefix) && path.hasSuffix("/cancel")
            ? String(path.dropFirst(cancelPrefix.count).dropLast("/cancel".count)) : ""
        let cancellation = method == "POST" && UUID(uuidString: cancelID) != nil
        let prefix = askMode.usesTask && cancellation ? "api/chat/native/v1" : askMode.base
        let data = try await dataRequest(prefix: prefix, path: path, method: method, body: body)
        guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
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
        guard clear() else { return }
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
        status = "active"
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
        if case SessionError.denied = error { if clear() { status = "expiredOrReplaced" } }
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
    @discardableResult private func clear() -> Bool {
        dataGeneration += 1
        if let owner = credential?.subject ?? defaults.string(forKey: storageKey) {
            let result = vault.remove(service: vaultService, owner: owner)
            guard result == errSecSuccess || result == errSecItemNotFound else {
                subject = nil; mobileEpoch = nil; displayName = nil
                failureCode = "keychain:\(result)"; status = "storageError"
                return false
            }
        }
        defaults.removeObject(forKey: storageKey)
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
