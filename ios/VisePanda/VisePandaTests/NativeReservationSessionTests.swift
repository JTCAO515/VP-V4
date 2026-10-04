import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeReservationSessionTests {
    private let origin = "http://127.0.0.1:63224"
    private let owner = "11111111-1111-4111-8111-111111111111"
    private let trip = "22222222-2222-4222-8222-222222222222"
    private var ownerKey: String { "native.v2.activeSubject." + origin + ".pendingJournalCleanupOwner" }
    private func session(_ defaults: UserDefaults, _ vault: ReservationSessionVault) -> NativeSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ReservationSessionProtocol.self]
        return NativeSession(arguments: ["-VisePandaNativeAPI", origin], defaults: defaults,
                             configuration: configuration, bundleConfiguration: [:], vault: vault)
    }
    private func unknownThen401(_ session: NativeSession, _ vault: ReservationSessionVault) async throws -> (NativeDataScope, NativeReservationJournal) {
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try #require(session.dataScope)
        let command = NativeReservationCommand(operationId: "44444444-4444-4444-8444-444444444444",
            referenceId: "33333333-3333-4333-8333-333333333333", expectedTripVersion: 3, expectedRevision: 0,
            fields: .init(title: "Synthetic report"), source: .init(), explicitlyConfirmed: true)
        let saved = try NativeReservationJournalVault(vault: vault).retain(command, trip: trip, scope: actor)
        do {
            _ = try await session.tripRequest(path: "api/trips/native/v2/" + trip + "/reservations", method: "POST", body: saved.body)
            Issue.record("Synthetic lost ACK must not succeed")
        } catch NativeDataError.server(let code) { #expect(code == "RESERVATION_RECEIPT_UNKNOWN") }
        #expect(session.dataScope == actor)
        let read = try NativeReservationWire.encode(["operation": "receipt", "operationId": command.operationId])
        do {
            _ = try await session.tripRequest(path: "api/trips/native/v2/" + trip + "/reservations", method: "POST", body: read)
            Issue.record("Synthetic receipt read must return 401")
        } catch NativeDataError.sessionUnavailable { /* Actual dataRequest → handle(denied) → clear(preservePendingJournals: true). */ }
        return (actor, saved)
    }
    @Test func actualSessionLostAck401ThenExplicitLogoutClearsByNoncredentialOwnerIndex() async throws {
        let name = "vpj24.session-denied." + UUID().uuidString, defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = ReservationSessionVault(), first = session(defaults, vault)
        let (actor, saved) = try await unknownThen401(first, vault)
        #expect(first.dataScope == nil && first.retainedDataScope == nil && first.subject == nil)
        #expect(first.status == "expiredOrReplaced")
        #expect(try NativeReservationJournalVault(vault: vault).read(actor) == saved)
        #expect(defaults.string(forKey: ownerKey) == owner)
        #expect(!vault.containsCredential(endpoint: origin, owner: owner))
        // A fresh Session has no credential or activeSubject. Only explicit cleanup may use the index.
        let relaunched = session(defaults, vault)
        await relaunched.restore()
        #expect(relaunched.dataScope == nil && relaunched.retainedDataScope == nil)
        await relaunched.logout()
        #expect(relaunched.status == "signedOut")
        #expect(try NativeReservationJournalVault(vault: vault).read(actor) == nil)
        #expect(defaults.object(forKey: ownerKey) == nil)
    }
    @Test func actualSessionCleanupFailureRetainsIndexAndBlocksNewLoginUntilEraseSucceeds() async throws {
        let name = "vpj24.session-cleanup." + UUID().uuidString, defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = ReservationSessionVault(), first = session(defaults, vault)
        let (actor, saved) = try await unknownThen401(first, vault)
        vault.failReservationErase = true
        let relaunched = session(defaults, vault)
        await relaunched.logout()
        #expect(relaunched.dataScope == nil && relaunched.status == "storageError")
        #expect(relaunched.failureCode == "reservationCleanupRequired")
        #expect(defaults.string(forKey: ownerKey) == owner)
        #expect(try NativeReservationJournalVault(vault: vault).read(actor) == saved)
        await relaunched.login(email: "other@example.invalid", password: "synthetic-only")
        #expect(relaunched.dataScope == nil && relaunched.status == "storageError")
        #expect(!vault.containsCredential(endpoint: origin, owner: owner))
        vault.failReservationErase = false
        await relaunched.logout()
        #expect(relaunched.status == "signedOut" && defaults.object(forKey: ownerKey) == nil)
        #expect(try NativeReservationJournalVault(vault: vault).read(actor) == nil)
    }
}

@MainActor private final class ReservationSessionVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var failReservationErase = false
    private func key(_ service: String, _ owner: String) -> String { service + "|" + owner }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[key(service, owner)] = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[key(service, owner)] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, value)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if failReservationErase, service == NativeReservationJournalVault.service("http://127.0.0.1:63224") { return errSecInteractionNotAllowed }
        values.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
    func containsCredential(endpoint: String, owner: String) -> Bool {
        values[key("com.visepanda.native.local-session.v2." + endpoint, owner)] != nil
    }
}

nonisolated private final class ReservationSessionProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url!.path, owner = "11111111-1111-4111-8111-111111111111"
        let status: Int, value: [String: Any]
        if path.hasSuffix("/credentials") {
            status = 200; value = ["subject": owner, "accessToken": "synthetic-only", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") { status = 200; value = ["subject": owner, "mobileEpoch": 1] }
        else if path.hasSuffix("/profile") { status = 200; value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { status = 200; value = [:] }
        else {
            // URLSession may deliver the original POST bytes as a stream to URLProtocol.
            let input = body().flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            status = input?["operation"] as? String == "confirm" ? 503 : 401
            value = ["error": ["code": status == 503 ? "RESERVATION_RECEIPT_UNKNOWN" : "UNAUTHENTICATED"]]
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value))
        client?.urlProtocolDidFinishLoading(self)
    }
    private func body() -> Data? {
        if let bytes = request.httpBody { return bytes }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var bytes = Data(), buffer = [UInt8](repeating: 0, count: 2048)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }; if count == 0 { return bytes }
            bytes.append(contentsOf: buffer.prefix(count))
        }
    }
}
