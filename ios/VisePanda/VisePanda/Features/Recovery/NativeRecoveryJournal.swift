import Foundation
import Security

struct NativeRecoveryPending: Codable, Equatable {
    let endpoint: String
    let owner: String
    let epoch: Int
    let tripID: String
    let baseVersion: Int
    let operationID: String
    let stage: String
    let body: Data
    let expectedPatch: NativeTripPatch?
    var originalReceipt: NativeRecoveryReceipt? = nil
    var originalProposalDigest: String? = nil

    init(scope: NativeDataScope, tripID: String, baseVersion: Int, operationID: String,
         stage: String, body: Data, expectedPatch: NativeTripPatch? = nil) {
        endpoint = scope.endpoint; owner = scope.subject; epoch = scope.mobileEpoch
        self.tripID = tripID; self.baseVersion = baseVersion; self.operationID = operationID
        self.stage = stage; self.body = body; self.expectedPatch = expectedPatch
    }
    func matches(_ scope: NativeDataScope) -> Bool {
        endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch
    }
    func validate() throws {
        guard NativeRecoveryWire.uuid(tripID), NativeRecoveryWire.uuid(operationID), epoch >= 0,
              (0...999999999).contains(baseVersion), body.count <= 24576,
              !endpoint.isEmpty, !owner.isEmpty else { throw NativeDataError.invalidResponse }
        let root = try NativeRecoveryWire.exact(JSONSerialization.jsonObject(with: body), ["operation", "input"])
        guard root["operation"] as? String == stage, let input = root["input"] as? [String: Any],
              input["operationId"] as? String == operationID else { throw NativeDataError.invalidResponse }
        if stage == "preview" {
            _ = try NativeRecoveryWire.exact(input, ["operationId", "expectedHeadVersion", "dayId", "selectedItemIds", "fixedItemIds", "reservationBindings", "report", "locale"])
            let value = try NativeRecoveryWire.decode(NativeRecoveryInput.self, input)
            try value.validate()
            guard value.expectedHeadVersion == baseVersion, expectedPatch == nil else { throw NativeDataError.invalidResponse }
        } else if stage == "select" {
            let input = try selection()
            if let originalReceipt {
                guard originalReceipt.operationId == operationID, originalReceipt.contextId == input.contextId,
                      originalReceipt.contextDigest == input.contextDigest, originalReceipt.candidateId == input.candidateId,
                      originalReceipt.baseVersion == baseVersion, NativeRecoveryWire.uuid(originalReceipt.proposalId),
                      originalReceipt.proposalRevision > 0, NativeRecoveryWire.date(originalReceipt.expiresAt) != nil
                else { throw NativeDataError.invalidResponse }
            }
            guard originalProposalDigest == nil || originalReceipt != nil && NativeRecoveryWire.hash(originalProposalDigest!) else { throw NativeDataError.invalidResponse }
            guard let expectedPatch, expectedPatch.expectedVersion == baseVersion,
                  (1...8).contains(expectedPatch.operations.count),
                  expectedPatch.operations.allSatisfy({ $0.kind == .deleteItem && $0.dayId.map(NativeRecoveryWire.item) == true && $0.itemId.map(NativeRecoveryWire.item) == true && $0.title == nil && $0.date == nil && $0.timeZone == nil && $0.startsAt == nil && $0.endsAt == nil })
            else { throw NativeDataError.invalidResponse }
        } else { throw NativeDataError.invalidResponse }
    }
    func selection() throws -> NativeRecoverySelection {
        guard stage == "select" else { throw NativeDataError.invalidResponse }
        let root = try NativeRecoveryWire.exact(JSONSerialization.jsonObject(with: body), ["operation", "input"])
        let input = try NativeRecoveryWire.exact(root["input"] as Any, ["operationId", "contextId", "contextDigest", "candidateId"])
        let value = try NativeRecoveryWire.decode(NativeRecoverySelection.self, input)
        try value.validate(); guard value.operationId == operationID else { throw NativeDataError.invalidResponse }; return value
    }
    func previewInput() throws -> NativeRecoveryInput {
        guard stage == "preview" else { throw NativeDataError.invalidResponse }
        let root = try NativeRecoveryWire.exact(JSONSerialization.jsonObject(with: body), ["operation", "input"])
        guard let input = root["input"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return try NativeRecoveryWire.decode(NativeRecoveryInput.self, input)
    }
}

/// One unresolved operation per owner and endpoint. Never overwrite an unknown ACK.
/// The exact same service constructor is used by NativeSession.clear before credential deletion.
@MainActor
struct NativeRecoveryJournal {
    let vault: any NativeCredentialVault
    init(vault: any NativeCredentialVault = NativeKeychainVault()) { self.vault = vault }
    static func service(endpoint: String) -> String { "com.visepanda.native.local-recovery.v1." + endpoint }
    func read(scope: NativeDataScope) throws -> NativeRecoveryPending? {
        let (status, bytes) = vault.read(service: Self.service(endpoint: scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 64000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeRecoveryPending.self, from: bytes)
        try value.validate()
        guard value.matches(scope) else { throw NativeDataError.staleSessionResponse }; return value
    }
    func save(_ value: NativeRecoveryPending, scope: NativeDataScope) throws {
        guard value.matches(scope) else { throw NativeDataError.staleSessionResponse }; try value.validate()
        if let existing = try read(scope: scope) {
            guard existing == value else { throw NativeDataError.server(code: "RECOVERY_RECEIPT_UNKNOWN") }; return
        }
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 64000,
              vault.write(bytes, service: Self.service(endpoint: scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope: scope) == value else { throw NativeDataError.sessionUnavailable }
    }
    func remove(_ value: NativeRecoveryPending, scope: NativeDataScope) throws {
        guard value.matches(scope), try read(scope: scope) == value else { throw NativeDataError.staleSessionResponse }
        try erase(endpoint: scope.endpoint, owner: scope.subject)
    }
    func acknowledge(_ value: NativeRecoveryPending, outcome: NativeRecoveryOutcome, scope: NativeDataScope) throws -> NativeRecoveryPending {
        guard value.matches(scope), try read(scope: scope) == value else { throw NativeDataError.staleSessionResponse }
        try outcome.validate(pending: value, now: Date())
        var updated = value
        if updated.originalReceipt == nil { updated.originalReceipt = outcome.operation.receipt }
        if updated.originalProposalDigest == nil { updated.originalProposalDigest = outcome.proposal?.digest }
        try updated.validate()
        let bytes = try JSONEncoder().encode(updated)
        guard bytes.count <= 64000,
              vault.write(bytes, service: Self.service(endpoint: scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope: scope) == updated else { throw NativeDataError.sessionUnavailable }
        return updated
    }
    func erase(endpoint: String, owner: String) throws {
        let status = vault.remove(service: Self.service(endpoint: endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}
