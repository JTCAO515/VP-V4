import Foundation
import Security

struct NativeScopedTripJournal: Codable, Equatable, Identifiable {
    let schemaVersion: Int
    let endpoint: String
    let owner: String
    let epoch: Int
    let tripID: String
    let dayID: String
    let itemID: String?
    let baseVersion: Int
    let bytes: Data
    var id: String { tripID + ":" + String(epoch) }

    func matches(_ actor: NativeDataScope) -> Bool {
        schemaVersion == 1 && endpoint == actor.endpoint && owner == actor.subject && epoch == actor.mobileEpoch
    }
    func command() throws -> NativeScopedTripCommand {
        guard schemaVersion == 1, UUID(uuidString: tripID) != nil, NativeScopedTripSelection.validObjectID(dayID),
              itemID == nil || NativeScopedTripSelection.validObjectID(itemID!), baseVersion >= 0 else { throw NativeDataError.invalidResponse }
        let command = try NativeScopedTripCommand(bytes: bytes)
        let raw = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        let basis = raw["basis"] as! [String: Any]
        guard NativeScopedTripWire.integer(basis["baseVersion"]) == baseVersion else { throw NativeDataError.invalidResponse }
        return command
    }
}

/// One unknown operation per owner/origin. An absent receipt never releases it.
/// No provider response, source body or credential enters this device-only vault.
@MainActor struct NativeScopedTripJournalVault {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.local-session.v2.scoped-trip-edit." + endpoint }
    func read(_ actor: NativeDataScope) throws -> NativeScopedTripJournal? {
        let (status, bytes) = vault.read(service: Self.service(actor.endpoint), owner: actor.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 32000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeScopedTripJournal.self, from: bytes)
        guard value.matches(actor) else { throw NativeDataError.staleSessionResponse }
        _ = try value.command(); return value
    }
    func remember(_ command: NativeScopedTripCommand, selection: NativeScopedTripSelection, actor: NativeDataScope) throws -> NativeScopedTripJournal {
        guard selection.actor == actor else { throw NativeDataError.staleSessionResponse }
        let tripID = selection.tripID
        if let existing = try read(actor) {
            guard existing.tripID == tripID, existing.bytes == command.bytes else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let value = NativeScopedTripJournal(schemaVersion: 1, endpoint: actor.endpoint, owner: actor.subject,
            epoch: actor.mobileEpoch, tripID: tripID, dayID: selection.dayID, itemID: selection.itemID, baseVersion: selection.headVersion, bytes: command.bytes)
        _ = try value.command()
        let data = try JSONEncoder().encode(value)
        guard data.count <= 32000, vault.write(data, service: Self.service(actor.endpoint), owner: actor.subject) == errSecSuccess,
              try read(actor) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }
    func complete(_ journal: NativeScopedTripJournal, actor: NativeDataScope) throws {
        guard journal.matches(actor), try read(actor) == journal else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: actor.endpoint, owner: actor.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}
