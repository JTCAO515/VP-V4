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
    private let transport: URLSession
    private let defaults: UserDefaults
    private let storageKey: String
    private let keychainService = "com.visepanda.native.local-session.v2"

    init(arguments: [String] = ProcessInfo.processInfo.arguments, defaults: UserDefaults = .standard, configuration: URLSessionConfiguration = .ephemeral, bundleConfiguration: [String: String] = Bundle.main.infoDictionary?.compactMapValues { $0 as? String } ?? [:]) {
        endpoint = Self.resolveEndpoint(arguments: arguments, bundleConfiguration: bundleConfiguration)
        self.defaults = defaults
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
                  host.range(of: #"^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$"#, options: .regularExpression) != nil
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

    /// The Trip consumer receives response bytes, never the Keychain credential.
    func tripRequest(path: String, method: String, body: Data? = nil, queryItems: [URLQueryItem] = []) async throws -> Data {
        try await dataRequest(prefix: "api/trips/native/v2", path: path, method: method, body: body, queryItems: queryItems)
    }

    /// Local Ask shares identity fencing, never credentials, with the Trip consumer.
    func askRequest(path: String, method: String, body: Data? = nil) async throws -> Data {
        let data = try await dataRequest(prefix: "api/chat/native/v1", path: path, method: method, body: body)
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

    func restore() async {
        guard enabled, !busy, credential == nil, let owner = defaults.string(forKey: storageKey) else { return }
        do {
            credential = try read(owner: owner)
            await validate()
        } catch { clear(); status = "storageError" }
    }

    func login(email: String, password: String) async {
        guard enabled, !busy else { return }
        busy = true
        defer { busy = false }
        // A deliberate account change clears all old account data before sending the new request.
        clear()
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
        clear()
        status = "signedOut"
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
        let value = NativeCredential(subject: reply.subject, accessToken: reply.accessToken, refreshToken: reply.refreshToken, expiresAt: reply.expiresAt, attemptId: attempt, mobileEpoch: reply.mobileEpoch)
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
        subject = nil
        mobileEpoch = nil
        displayName = nil
        if case SessionError.denied = error { clear(); status = "expiredOrReplaced" }
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
        if http.statusCode == 401 || http.statusCode == 409 { throw SessionError.denied }
        guard http.statusCode == 200 else { throw SessionError.http(http.statusCode) }
        return data
    }

    private func query(owner: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService + "." + (endpoint?.absoluteString ?? "disabled"), kSecAttrAccount as String: owner]
    }
    private func save(_ value: NativeCredential) throws {
        let bytes = try JSONEncoder().encode(value)
        let lookup = query(owner: value.subject)
        let update = SecItemUpdate(lookup as CFDictionary, [kSecValueData: bytes] as CFDictionary)
        if update == errSecItemNotFound {
            var insert = lookup
            insert[kSecValueData as String] = bytes
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            let inserted = SecItemAdd(insert as CFDictionary, nil)
            guard inserted == errSecSuccess else { throw SessionError.storage(inserted) }
        } else if update != errSecSuccess { throw SessionError.storage(update) }
        defaults.set(value.subject, forKey: storageKey)
    }
    private func read(owner: String) throws -> NativeCredential {
        var lookup = query(owner: owner)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let found = SecItemCopyMatching(lookup as CFDictionary, &result)
        guard found == errSecSuccess, let data = result as? Data else { throw SessionError.storage(found) }
        let value = try JSONDecoder().decode(NativeCredential.self, from: data)
        guard value.subject == owner else { throw SessionError.storage(errSecDecode) }
        return value
    }
    private func clear() {
        dataGeneration += 1
        if let owner = credential?.subject ?? defaults.string(forKey: storageKey) { SecItemDelete(query(owner: owner) as CFDictionary) }
        defaults.removeObject(forKey: storageKey)
        credential = nil
        subject = nil
        mobileEpoch = nil
        displayName = nil
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
