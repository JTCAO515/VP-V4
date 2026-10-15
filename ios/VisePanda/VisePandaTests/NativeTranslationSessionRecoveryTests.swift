import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeTranslationSessionRecoveryTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1:5800", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 1, generation: 1)
    private func identity() throws -> NativeTranslationRecoveryIdentity {
        try .init(threadId: "22222222-2222-4222-8222-222222222222", turnId: "33333333-3333-4333-8333-333333333333",
            idempotencyKey: "44444444-4444-4444-8444-444444444444", policyId: "55555555-5555-4555-8555-555555555555",
            noticeHash: String(repeating: "a", count: 64), sourceLocale: "en", targetLocale: "zh",
            inputHash: NativeTranslationRecoveryIdentity.hashInput("CNY 50."))
    }

    @Test func retainedSessionPortCannotReadOrRemoveFormerActorButNewGenerationCanRecover() throws {
        let vault = TranslationSessionTestVault()
        var current: NativeDataScope? = scope
        let port = NativeTranslationSessionRecoveryPort(journal: .init(vault: vault), currentScope: { current })
        let original = try port.retain(identity(), scope: scope)
        current = .init(endpoint: scope.endpoint, subject: "66666666-6666-4666-8666-666666666666", mobileEpoch: 1, generation: 2)
        let reads = vault.reads
        #expect(throws: NativeDataError.self) { try port.read(scope) }
        #expect(throws: NativeDataError.self) { try port.abandonLocally(original, scope: scope) }
        #expect(vault.reads == reads && vault.removes == 0)
        let returned = NativeDataScope(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: scope.mobileEpoch, generation: 3)
        current = returned
        #expect(try port.read(returned) == original)
        #expect(throws: NativeDataError.self) { try port.retain(identity(), scope: scope) }
        #expect(throws: NativeTranslationRecoveryError.self) { try port.retain(identity(), scope: returned) }
        #expect(vault.writes == 1)
    }

    @Test func actorChangeDuringPhysicalRetentionDeniesSendEligibilityAndPreservesLandedIdentity() throws {
        let vault = TranslationSessionTestVault()
        var current: NativeDataScope? = scope
        let port = NativeTranslationSessionRecoveryPort(journal: .init(vault: vault), currentScope: { current })
        vault.afterWrite = { current = nil }
        #expect(throws: NativeDataError.self) { try port.retain(identity(), scope: scope) }
        #expect(vault.writes == 1 && vault.removes == 0)
        vault.afterWrite = nil
        current = scope
        let restored = try #require(port.read(scope))
        #expect(restored.identity == (try identity()))
        #expect(throws: NativeTranslationRecoveryError.self) { try port.retain(identity(), scope: scope) }
        #expect(vault.writes == 1)
    }

    @Test func missingFixedInventoryCompanionIsUnavailableAndCannotClaimCompletionOrAbsence() throws {
        let actor = NativeCommunitySafetyActor(scope: scope, sessionID: "77777777-7777-4777-8777-777777777777")
        let source = NativeJournalDataVaultSources(vault: TranslationSessionTestVault(), current: { actor },
            guide: { _ in nil }, ask: { nil }, askAbsent: { _ in false }, companions: [:], evidence: { _, _ in nil })
        let row = try #require(source.snapshot(source: .translationRecovery, actor: actor))
        #expect(row.valid && row.record.state == .unavailable && row.record.kind == .metadataOnly)
        #expect(row.originalIdentity == nil && row.record.originalOperationBytes == nil && row.record.objectID == nil)
        #expect(source.completion(source: .translationRecovery, actor: actor) == nil)
        #expect(try source.physicallyAbsent(source: .translationRecovery, actor: actor) == false)
    }
}

@MainActor private final class TranslationSessionTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var reads = 0, writes = 0, removes = 0
    var afterWrite: (() -> Void)?
    private func key(_ service: String, _ owner: String) -> String { "\(service.utf8.count):\(service)\(owner)" }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        reads += 1
        guard let bytes = values[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, bytes)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        writes += 1; values[key(service, owner)] = data; afterWrite?(); return errSecSuccess
    }
    func remove(service: String, owner: String) -> OSStatus {
        removes += 1
        return values.removeValue(forKey: key(service, owner)) == nil ? errSecItemNotFound : errSecSuccess
    }
}
