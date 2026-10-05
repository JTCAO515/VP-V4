import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor private final class ServiceOperationTestVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var failWrite = false
    var failErase = false
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let bytes = values[service + owner] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, bytes)
    }
    func write(_ bytes: Data, service: String, owner: String) -> OSStatus {
        guard !failWrite else { return errSecInteractionNotAllowed }; values[service + owner] = bytes; return errSecSuccess
    }
    func remove(service: String, owner: String) -> OSStatus {
        guard !failErase else { return errSecInteractionNotAllowed }; values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

@MainActor struct NativeServiceOperationTests {
    static let scope = NativeDataScope(endpoint: "http://127.0.0.1:64001", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 3, generation: 0)
    static func command(operationId: String = "22222222-2222-4222-8222-222222222222") throws -> NativeServiceOperationCommand {
        .init(body: try NativeServiceOperationWire.bytes(["action": "request", "operationId": operationId, "caseId": "33333333-3333-4333-8333-333333333333", "expectedRevision": 0, "grantRevision": 1, "urgency": "normal", "trip": ["kind": "unknown"]]))
    }
    @Test func frozenBytesSurviveRestartAndAbandonExactly() throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), command = try Self.command()
        let original = try journal.retain(command, scope: Self.scope)
        #expect(try journal.read(Self.scope) == original)
        let restarted = NativeServiceOperationJournal(vault: vault)
        #expect(try restarted.read(Self.scope)?.body == command.body)
        let abandon = try JSONSerialization.jsonObject(with: command.recoveryBody(abandon: true)) as! [String: Any]
        #expect(abandon["mutationBytes"] as? String == String(data: command.body, encoding: .utf8))
        #expect(throws: (any Error).self) { try journal.retain(Self.command(operationId: "44444444-4444-4444-8444-444444444444"), scope: Self.scope) }
        var replaced = Self.scope; replaced = NativeDataScope(endpoint: replaced.endpoint, subject: replaced.subject, mobileEpoch: 4, generation: 0)
        #expect(throws: (any Error).self) { try journal.read(replaced) }
    }
    @Test func journalStorageFailureCannotAuthorizeDispatchOrClaimErasure() throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), command = try Self.command()
        vault.failWrite = true
        #expect(throws: (any Error).self) { try journal.retain(command, scope: Self.scope) }
        vault.failWrite = false; let value = try journal.retain(command, scope: Self.scope)
        vault.failErase = true
        #expect(throws: (any Error).self) { try journal.complete(value, scope: Self.scope) }
        #expect(try journal.read(Self.scope) == value)
        vault.failErase = false; try journal.complete(value, scope: Self.scope)
        #expect(try journal.read(Self.scope) == nil)
    }
    @Test func userCannotSupplyStaffAuthorityOrInferTrip() throws {
        let command = try Self.command()
        #expect(try command.action == "request")
        var forged = try command.object; forged["action"] = "accept"
        #expect(throws: (any Error).self) { try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(forged)).validate() }
        forged = try command.object; forged["trip"] = ["kind": "bound", "tripId": Self.scope.subject, "headVersion": true]
        #expect(throws: (any Error).self) { try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(forged)).validate() }
    }

    @Test func grantsAndFutureStatesNeverImplyAcceptance() throws {
        for state in ["active", "revoked", "future_state", "requested", "queued"] {
            let value = try JSONDecoder().decode(NativeServiceOperationStatus.self, from: Data("\"\(state)\"".utf8))
            #expect(!value.mayShowAcceptance)
            #expect(!value.isTerminal)
        }
        #expect(NativeServiceOperationStatus.accepted.mayShowAcceptance)
        #expect(NativeServiceOperationStatus.cancelled.isTerminal)
        #expect(!NativeServiceOperationStatus.cancelled.mayShowAcceptance)
    }
    @Test func wireRejectsBooleanCountersAndOpenShapes() throws {
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.integer(true) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.integer(0.5) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.integer(-1) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.object(["id": "x", "accepted": true], keys: ["id"]) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.identifier("local-selection") }
        #expect(try NativeServiceOperationWire.integer(0) == 0)
    }
}
