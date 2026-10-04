import Foundation
import Security

struct NativeReservationJournal: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let owner: String
    let epoch: Int
    let tripId: String
    let body: Data
    var rejectionCode: String? = nil
    func matches(_ scope: NativeDataScope) -> Bool {
        schemaVersion == 1 && endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch
    }
    func command() throws -> NativeReservationCommand {
        guard NativeReservationWire.uuid(tripId), body.count <= 16384,
              rejectionCode == nil || ["RESERVATION_CONFLICT", "STALE_TRIP_VERSION", "INVALID_INPUT", "RESERVATION_SOURCE_UNAVAILABLE"].contains(rejectionCode!) else { throw NativeDataError.invalidResponse }
        let raw = try NativeReservationWire.exact(JSONSerialization.jsonObject(with: body), ["operation", "input"])
        guard raw["operation"] as? String == "confirm" else { throw NativeDataError.invalidResponse }
        return try NativeReservationWire.command(raw["input"]!)
    }
}

/// One outstanding operation per owner/endpoint, so another Trip cannot hide an unknown write.
/// Uses the accepted synchronous, device-only Keychain boundary. No credentials are read here.
@MainActor struct NativeReservationJournalVault {
    let vault: any NativeCredentialVault
    init(vault: any NativeCredentialVault = NativeKeychainVault()) { self.vault = vault }
    static func service(_ endpoint: String) -> String { "com.visepanda.native.local-session.v2.reservation-confirm." + endpoint }
    func read(_ scope: NativeDataScope) throws -> NativeReservationJournal? {
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 32000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeReservationJournal.self, from: bytes)
        guard value.matches(scope) else { throw NativeDataError.staleSessionResponse }
        _ = try value.command(); return value
    }
    func retain(_ command: NativeReservationCommand, trip: String, scope: NativeDataScope) throws -> NativeReservationJournal {
        let body = try command.body(operation: "confirm")
        if let existing = try read(scope) {
            guard existing.tripId == trip, NativeReservationWire.equal(try existing.command().object, command.object) else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let value = NativeReservationJournal(schemaVersion: 1, endpoint: scope.endpoint, owner: scope.subject,
                                             epoch: scope.mobileEpoch, tripId: trip, body: body)
        _ = try value.command()
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 32000, vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope) == value else { throw NativeDataError.sessionUnavailable }
        return value // Durable readback succeeds before any confirm dispatch.
    }
    func complete(_ journal: NativeReservationJournal, scope: NativeDataScope) throws {
        guard journal.matches(scope), try read(scope) == journal else { throw NativeDataError.staleSessionResponse }
        try Self.remove(endpoint: scope.endpoint, owner: scope.subject, vault: vault)
    }
    func recordRejection(_ journal: NativeReservationJournal, code: String, scope: NativeDataScope) throws -> NativeReservationJournal {
        guard journal.matches(scope), try read(scope) == journal else { throw NativeDataError.staleSessionResponse }
        var rejected = journal; rejected.rejectionCode = code; _ = try rejected.command()
        let bytes = try JSONEncoder().encode(rejected)
        guard vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope) == rejected else { throw NativeDataError.sessionUnavailable }
        return rejected
    }
    // Session owner calls this for sign-out/account/session denial even while this feature is closed.
    static func remove(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
        let (readStatus, _) = vault.read(service: service(endpoint), owner: owner)
        guard readStatus == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}
