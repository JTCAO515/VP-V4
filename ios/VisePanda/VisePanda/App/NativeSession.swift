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
    private var credential: NativeCredential?
    private let endpoint: URL?
    private let transport: URLSession
    private let defaults: UserDefaults
    private let storageKey: String
    private let keychainService = "com.visepanda.native.local-session.v2"

    init(arguments: [String] = ProcessInfo.processInfo.arguments, defaults: UserDefaults = .standard) {
        // This slice is explicitly local integration. No remote endpoint can be enabled by arguments.
        let flag = arguments.firstIndex(of: "-VisePandaNativeAPI")
        let raw = flag.flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        let url = raw.flatMap(URL.init(string:))
        if let url, url.scheme == "http", ["localhost", "127.0.0.1"].contains(url.host ?? ""), url.user == nil, url.password == nil {
            endpoint = url
        } else { endpoint = nil }
        self.defaults = defaults
        storageKey = "native.v2.activeSubject.\(endpoint?.absoluteString ?? "disabled")"
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        transport = URLSession(configuration: configuration, delegate: NativeRedirectBlocker(), delegateQueue: nil)
    }

    var enabled: Bool { endpoint != nil }

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
        do {
            let data = try await request("credentials", body: ["email": email, "password": password, "attemptId": attempt])
            var value = try JSONDecoder().decode(TokenReply.self, from: data)
            let pending = NativeCredential(subject: value.subject, accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt, attemptId: attempt, mobileEpoch: nil)
            credential = pending
            try save(pending)
            let reply = try await request("login", body: ["attemptId": attempt], token: value.accessToken)
            let state = try JSONDecoder().decode(SessionReply.self, from: reply)
            guard state.subject == value.subject else { throw SessionError.invalid }
            value.mobileEpoch = state.mobileEpoch
            try accept(value, attempt: attempt)
            try await loadProfile()
        } catch { handle(error) }
    }

    func validate() async {
        guard enabled, !busy, let existing = credential else { return }
        busy = true
        defer { busy = false }
        do {
            if existing.mobileEpoch == nil {
                let data = try await request("login", body: ["attemptId": existing.attemptId], token: existing.accessToken)
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
                let reply = try JSONDecoder().decode(TokenReply.self, from: data)
                guard reply.subject == existing.subject, reply.mobileEpoch == existing.mobileEpoch else { throw SessionError.invalid }
                try accept(reply, attempt: existing.attemptId)
                try await loadProfile()
            }
        } catch { handle(error) }
    }

    func logout() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        if let existing = credential {
            do {
                var token = existing.accessToken
                if existing.expiresAt <= Date().timeIntervalSince1970 + 10 {
                    let data = try await request("refresh", body: ["refreshToken": existing.refreshToken])
                    let reply = try JSONDecoder().decode(TokenReply.self, from: data)
                    guard reply.subject == existing.subject, reply.mobileEpoch == existing.mobileEpoch else { throw SessionError.invalid }
                    try accept(reply, attempt: existing.attemptId)
                    token = reply.accessToken
                }
                _ = try await request("logout", body: [:], token: token)
            } catch { handle(error); return }
        }
        clear()
        status = "signedOut"
    }

    private func loadProfile() async throws {
        guard let credential else { throw SessionError.invalid }
        let data = try await request("profile", body: [:], token: credential.accessToken)
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

    private func handle(_ error: Error) {
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
        if let owner = credential?.subject ?? defaults.string(forKey: storageKey) { SecItemDelete(query(owner: owner) as CFDictionary) }
        defaults.removeObject(forKey: storageKey)
        credential = nil
        subject = nil
        mobileEpoch = nil
        displayName = nil
    }
    private enum SessionError: Error { case denied, invalid, storage(OSStatus), http(Int) }
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
