import Foundation
import Security

/// Reads only the original fixed services through their original validators. Never sends or clears.
@MainActor final class NativeJournalDataVaultSources: NativeJournalDataSource {
    struct Companion {
        let service: (String) -> String
        let read: (NativeCommunitySafetyActor) throws -> NativeJournalDataExportRecord?
    }
    private let vault: any NativeCredentialVault
    private let current: () -> NativeCommunitySafetyActor?
    private let guide: (NativeDataScope) throws -> NativePlaceGuidePending?
    private let ask: () throws -> NativePendingAsk?
    private let askAbsent: (NativeCommunitySafetyActor) throws -> Bool
    private let companions: [NativeJournalDataSourceID: Companion]
    private let evidence: (NativeJournalDataSourceID, NativeCommunitySafetyActor) -> NativeJournalDataCompletion?

    init(vault: any NativeCredentialVault, current: @escaping () -> NativeCommunitySafetyActor?,
         guide: @escaping (NativeDataScope) throws -> NativePlaceGuidePending?,
         ask: @escaping () throws -> NativePendingAsk?,
         askAbsent: @escaping (NativeCommunitySafetyActor) throws -> Bool,
         companions: [NativeJournalDataSourceID: Companion],
         evidence: @escaping (NativeJournalDataSourceID, NativeCommunitySafetyActor) -> NativeJournalDataCompletion?) {
        self.vault = vault; self.current = current; self.guide = guide; self.ask = ask
        self.askAbsent = askAbsent; self.companions = companions; self.evidence = evidence
    }
    func completion(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) -> NativeJournalDataCompletion? {
        guard current() == actor else { return nil }; return evidence(source, actor)
    }
    private func checked(_ actor: NativeCommunitySafetyActor) throws {
        guard current() == actor else { throw NativeDataError.staleSessionResponse }
    }
    private func record(_ id: NativeJournalDataSourceID, operation: String? = nil, trip: String? = nil,
                        action: String? = nil, bytes: Data? = nil, boundary: String = "body_rights_not_granted", object: String? = nil) -> NativeJournalDataExportRecord {
        .init(source: id, state: .pending, kind: bytes == nil ? .metadataOnly : .originalOperation,
            operationID: operation, tripID: trip, action: action, originalOperationBytes: bytes, contentBoundary: boundary, objectID: object)
    }
    private func empty(_ id: NativeJournalDataSourceID, state: NativeJournalDataReadState) -> NativeJournalDataSnapshot {
        .init(record: .init(source: id, state: state, kind: .metadataOnly, operationID: nil, tripID: nil,
            action: nil, originalOperationBytes: nil, contentBoundary: state == .absent ? "original_reader_absent" : "qualification_unconfirmed"), originalIdentity: nil)
    }
    /// Pure original qualification runs twice around exact physical byte comparisons.
    /// Guide uses the original stored decoder without its separate expiry writer.
    /// Observed drift never becomes an empty or valid row; this is not a cross-process transaction.
    private func read(_ id: NativeJournalDataSourceID, service: String, actor: NativeCommunitySafetyActor,
                      original: () throws -> NativeJournalDataExportRecord?) -> NativeJournalDataSnapshot {
        do {
            try checked(actor); let value = try original()
            let before = vault.read(service: service, owner: actor.scope.subject)
            let repeated = try original(), after = vault.read(service: service, owner: actor.scope.subject)
            try checked(actor)
            guard before.0 == after.0, before.1 == after.1, value == repeated else { throw NativeDataError.staleSessionResponse }
            if value == nil {
                guard after.0 == errSecItemNotFound else { throw NativeDataError.staleSessionResponse }
                return empty(id, state: .absent)
            }
            guard let value, value.source == id, after.0 == errSecSuccess, let identity = after.1,
                  !identity.isEmpty, identity.count <= 262_144 else { throw NativeDataError.invalidResponse }
            var immutable = identity
            if id == .recovery {
                // The original acknowledge method appends these two verified fields; it never changes body.
                guard var envelope = try JSONSerialization.jsonObject(with: identity) as? [String: Any] else { throw NativeDataError.invalidResponse }
                envelope.removeValue(forKey: "originalReceipt"); envelope.removeValue(forKey: "originalProposalDigest")
                immutable = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys, .withoutEscapingSlashes])
            }
            let snapshot = NativeJournalDataSnapshot(record: value, originalIdentity: identity, operationIdentity: immutable)
            guard snapshot.valid else { throw NativeDataError.invalidResponse }; return snapshot
        } catch { return empty(id, state: .unavailable) }
    }
    func read(_ actor: NativeCommunitySafetyActor) throws -> [NativeJournalDataSnapshot] {
        try read(actor, only: nil)
    }
    func snapshot(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) throws -> NativeJournalDataSnapshot? {
        try read(actor, only: source).first
    }
    private func read(_ actor: NativeCommunitySafetyActor, only selected: NativeJournalDataSourceID?) throws -> [NativeJournalDataSnapshot] {
        try checked(actor)
        let scope = actor.scope, endpoint = scope.endpoint
        var rows: [NativeJournalDataSnapshot] = []
        func add(_ id: NativeJournalDataSourceID, _ service: String,
                 _ original: () throws -> NativeJournalDataExportRecord?) {
            guard selected == nil || selected == id else { return }
            rows.append(read(id, service: service, actor: actor, original: original))
        }
        add(.coverage, NativeDataCoverageJournal.service(endpoint)) {
            try NativeDataCoverageJournal(vault: self.vault, validate: {
                guard try NativeDataCoverageCommand(body: $0).matches(actor) else { throw NativeDataError.staleSessionResponse }
            }).read(actor).map {
                let c = try NativeDataCoverageCommand(body: $0.body)
                return self.record(.coverage, operation: c.operationID, trip: c.tripID, action: c.action.rawValue)
            }
        }
        add(.materialReference, NativeMaterialReferenceJournal.service(endpoint)) {
            try NativeMaterialReferenceJournal(vault: self.vault).read(actor).map {
                let c = try NativeMaterialReferenceCommand(body: $0.body)
                return self.record(.materialReference, operation: c.requestID, trip: c.tripID, action: c.action,
                    bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.profile, NativeProfileDataJournal.service(endpoint)) {
            try NativeProfileDataJournal(vault: self.vault, validateConfirmation: NativeProfileDataCommand.validateConfirmation).read(actor).map {
                let c = try NativeProfileDataCommand(body: $0.body)
                return self.record(.profile, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.conversation, NativeConversationDataJournal.service(endpoint)) {
            try NativeConversationDataJournal(vault: self.vault, validateConfirmation: NativeConversationDataCommand.validateConfirmation).read(actor).map {
                let c = try NativeConversationDataCommand(body: $0.body)
                return self.record(.conversation, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.serviceOperation, NativeServiceOperationJournal.service(endpoint)) {
            try NativeServiceOperationJournal(vault: self.vault).read(scope).map {
                let c = NativeServiceOperationCommand(body: $0.body)
                return self.record(.serviceOperation, operation: try c.operationId, action: try c.action, object: try c.caseId)
            }
        }
        add(.turn, NativeTurnDataJournal.service(endpoint)) {
            try NativeTurnDataJournal(vault: self.vault, validateConfirmation: NativeTurnDataCommand.validateConfirmation).read(actor).map {
                let c = try NativeTurnDataCommand(body: $0.body)
                return self.record(.turn, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.reservation, NativeReservationJournalVault.service(endpoint)) {
            try NativeReservationJournalVault(vault: self.vault).read(scope).map {
                let c = try $0.command()
                return self.record(.reservation, operation: c.operationId, trip: $0.tripId, action: "confirm", boundary: "reservation_authority_and_content_excluded")
            }
        }
        add(.community, NativeCommunityJournal.service(endpoint)) {
            try NativeCommunityJournal(vault: self.vault).read(scope, sessionID: actor.sessionID).map {
                let c = try NativeCommunityCommand(body: $0.body)
                return self.record(.community, operation: c.operationID, action: c.action, boundary: "publication_body_and_recipient_content_excluded")
            }
        }
        add(.recovery, NativeRecoveryJournal.service(endpoint: endpoint)) {
            try NativeRecoveryJournal(vault: self.vault).read(scope: scope).map {
                self.record(.recovery, operation: $0.operationID, trip: $0.tripID, action: $0.stage,
                    boundary: "provider_report_proposal_and_authorization_excluded")
            }
        }
        add(.tripLifecycle, NativeTripLifecycleJournalVault.service(endpoint)) {
            try NativeTripLifecycleJournalVault(vault: self.vault).read(scope).map {
                let c = try $0.command()
                return self.record(.tripLifecycle, operation: c.operationID, trip: c.tripID, action: c.action.rawValue)
            }
        }
        add(.travelerBrief, NativeTravelerBriefJournal.service(endpoint)) {
            try NativeTravelerBriefJournal(vault: self.vault).read(scope).map {
                let c = try NativeTravelerBriefCommand(body: $0.body)
                return self.record(.travelerBrief, operation: c.operationID, action: c.action, boundary: "recipient_brief_content_and_authority_excluded", object: c.caseID)
            }
        }
        add(.pdf, NativePDFJournalVault.service(endpoint)) {
            try NativePDFJournalVault(vault: self.vault).read(scope).map {
                self.record(.pdf, operation: $0.command.operationId, trip: $0.tripID, action: "confirm", boundary: "pdf_licensed_body_and_reviewed_patch_excluded")
            }
        }
        add(.communitySafety, NativeCommunitySafetyJournal.service(endpoint)) {
            try NativeCommunitySafetyJournal(vault: self.vault, validate: { _ = try NativeCommunitySafetyCommand(body: $0) }).read(scope, sessionID: actor.sessionID).map {
                let c = try NativeCommunitySafetyCommand(body: $0.body)
                return self.record(.communitySafety, operation: c.operationID, action: c.action, boundary: "moderation_reasons_and_recipient_content_excluded")
            }
        }
        add(.notificationData, NativeNotificationDataJournal.service(endpoint)) {
            try NativeNotificationDataJournal(vault: self.vault).read(actor).map {
                let c = try NativeNotificationDataCommand(body: $0.body)
                return self.record(.notificationData, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.coverageProgress, NativeCoverageProgressJournal.service(endpoint)) {
            try NativeCoverageProgressJournal(vault: self.vault, validateErase: NativeCoverageProgressCommand.validateErase).read(actor).map {
                let c = try NativeCoverageProgressCommand(body: $0.body)
                return self.record(.coverageProgress, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.archive, NativeArchiveDataJournal.service(endpoint)) {
            try NativeArchiveDataJournal(vault: self.vault, validateConfirmation: NativeArchiveDataCommand.validateConfirmation).read(actor).map {
                let c = try NativeArchiveDataCommand(body: $0.body)
                return self.record(.archive, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_archive_references_only")
            }
        }
        add(.experience, NativeExperienceJournal.service(endpoint)) {
            try NativeExperienceJournal(vault: self.vault, validate: { _ = try NativeExperienceCommand(body: $0) }).read(actor).map {
                let c = try NativeExperienceCommand(body: $0.body)
                return self.record(.experience, operation: c.operationID, action: c.action, boundary: "authored_or_licensed_experience_body_excluded")
            }
        }
        add(.placeAction, NativePlaceActionJournal.service(endpoint)) {
            try NativePlaceActionJournal(vault: self.vault).read(scope).map {
                self.record(.placeAction, operation: try $0.command.operationId, trip: $0.command.tripId, action: try $0.command.action)
            }
        }
        add(.scopedTrip, NativeScopedTripJournalVault.service(endpoint)) {
            try NativeScopedTripJournalVault(vault: self.vault).read(scope).map {
                let c = try $0.command()
                return self.record(.scopedTrip, operation: c.operationID, trip: $0.tripID, action: c.action, boundary: "reviewed_patch_provider_and_licensed_content_excluded")
            }
        }
        add(.result, NativeResultDataJournal.service(endpoint)) {
            try NativeResultDataJournal(vault: self.vault, validateConfirmation: NativeResultDataCommand.validateConfirmation).read(actor).map {
                let c = try NativeResultDataCommand(body: $0.body)
                return self.record(.result, operation: c.requestID, action: c.action, bytes: $0.body, boundary: "closed_erase_references_only")
            }
        }
        add(.notification, NativeNotificationJournal.service(endpoint)) {
            try NativeNotificationJournal(vault: self.vault).read(scope).map {
                // The original notification module explicitly prohibits exporting exact token/reason bytes.
                _ = try $0.exportMetadata()
                return self.record(.notification, operation: $0.command.operationId, trip: $0.command.tripId,
                    action: $0.command.action, boundary: "secret_request_device_token_and_reason_excluded")
            }
        }
        add(.guide, "com.visepanda.native.local-session.v2.place-guide-operation." + endpoint) {
            try self.guide(scope).map {
                let c = try NativePlaceGuideResultReference($0)
                return self.record(.guide, operation: c.operationID, trip: $0.tripID, action: "follow_up", boundary: "question_source_text_audio_and_prompt_rights_excluded")
            }
        }
        if selected == nil || selected == .ask { do {
            try checked(actor); let value = try ask()
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
            let identity = try value.map { try encoder.encode($0) }
            guard try value == ask() else { throw NativeDataError.staleSessionResponse }
            try checked(actor)
            if let value, value.valid, value.mobileEpoch == scope.mobileEpoch, let identity {
                var immutable = value; immutable.acknowledged = false
                rows.append(.init(record: record(.ask, operation: value.request.idempotencyKey, action: value.mode.rawValue,
                    boundary: "credential_envelope_and_user_or_licensed_input_excluded"), originalIdentity: identity, operationIdentity: try encoder.encode(immutable)))
            } else if value == nil { rows.append(empty(.ask, state: .absent)) }
            else { throw NativeDataError.invalidResponse }
        } catch { rows.append(empty(.ask, state: .unavailable)) } }
        for id in [NativeJournalDataSourceID.tripSupport, .deviceDelete, .readinessSave, .linkedTripDelete, .memoryDelete, .tripDelete, .assistantEventsCursor] {
            guard selected == nil || selected == id else { continue }
            if let companion = companions[id] {
                add(id, companion.service(endpoint)) { try companion.read(actor) }
            } else { rows.append(empty(id, state: .unavailable)) }
        }
        try checked(actor); return rows
    }
    func physicallyAbsent(source id: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) throws -> Bool {
        try checked(actor)
        if id == .ask { return try askAbsent(actor) }
        // The qualified read includes the fixed original service status and a second readback.
        guard let row = try snapshot(source: id, actor: actor) else { return false }
        return row.record.state == .absent
    }
}
