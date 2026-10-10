import Foundation

/// Adapts only the existing module consumers. No new deletion or export implementation lives here.
@MainActor enum NativeDataCoverageOriginal {
    struct Verified {
        let state: NativeDataCoverageState
        let artifact: Data?
        let expiresAt: Date?
        let terminal: Bool
    }

    static func verify(_ reply: NativeDataCoverageReceipt, original: NativeDataCoverageCommand,
                       actor: NativeCommunitySafetyActor, guide: NativePlaceGuideSelection? = nil) throws -> Verified {
        guard let bytes = reply.result else {
            guard [.unknown, .unavailable, .partial].contains(reply.state) else { throw NativeDataError.invalidResponse }
            return .init(state: reply.state, artifact: nil, expiresAt: nil, terminal: false)
        }
        if original.action == .export {
            if !["ugc", "safety", "publication", "case", "brief", "guide", "notifications", "lifecycle"].contains(original.moduleID) {
                _ = try NativeCoreExportReceipt.decode(bytes, requestID: original.operationID)
                return .init(state: reply.state == .scopedComplete ? .partial : reply.state, artifact: nil, expiresAt: nil, terminal: false)
            }
            guard reply.state == .scopedComplete else { return .init(state: reply.state, artifact: nil, expiresAt: nil, terminal: false) }
            switch original.moduleID {
            case "ugc":
                guard case .export(let artifact) = try NativeCommunityOutcome.decode(bytes, actor: .init(scope: actor.scope, sessionID: actor.sessionID)) else { throw NativeDataError.invalidResponse }
                return .init(state: reply.state, artifact: artifact, expiresAt: Date().addingTimeInterval(30), terminal: true)
            case "safety":
                guard case .export(let artifact) = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor) else { throw NativeDataError.invalidResponse }
                return .init(state: reply.state, artifact: artifact, expiresAt: Date().addingTimeInterval(30), terminal: true)
            case "publication":
                guard case .export(let artifact) = try NativeExperienceOutcome.decode(bytes, actor: actor) else { throw NativeDataError.invalidResponse }
                return .init(state: reply.state, artifact: artifact, expiresAt: Date().addingTimeInterval(30), terminal: true)
            case "case":
                let bundle = try NativeServiceDataBundle.decode(bytes, actor: actor.scope, sessionId: actor.sessionID, requestId: original.operationID)
                return .init(state: reply.state, artifact: bundle.bytes, expiresAt: bundle.expiresAt, terminal: true)
            case "brief":
                let bundle = try NativeTravelerBriefBundle(bytes: bytes, actor: actor.scope, sessionID: actor.sessionID, requestID: original.operationID)
                return .init(state: reply.state, artifact: bundle.bytes, expiresAt: bundle.expiresAt, terminal: true)
            case "guide":
                guard let guide, guide.scope == actor.scope, guide.tripID == original.tripID else { throw NativeDataError.staleSessionResponse }
                let text = try NativePlaceGuideMetadataExport.decode(bytes, expected: guide)
                return .init(state: reply.state, artifact: Data(text.utf8), expiresAt: Date().addingTimeInterval(30), terminal: true)
            case "notifications", "lifecycle":
                let bundle = try NativeDataCoverageOwnerBundle(bytes: bytes, actor: actor, command: original)
                return .init(state: reply.state, artifact: bundle.bytes, expiresAt: bundle.expiresAt, terminal: true)
            default:
                // Original core receipt proves preparation, not delivery. Its store owns download validation.
                _ = try NativeCoreExportReceipt.decode(bytes, requestID: original.operationID)
                return .init(state: reply.state == .scopedComplete ? .partial : reply.state, artifact: nil, expiresAt: nil, terminal: false)
            }
        }
        switch original.moduleID {
        case "ugc":
            let command = try NativeCommunityCommand(body: original.commandBytes)
            let outcome = try NativeCommunityOutcome.decode(bytes, actor: .init(scope: actor.scope, sessionID: actor.sessionID))
            _ = try outcome.terminal(for: command, recovery: reply.phase == .recover)
            if case .deleted = outcome { return try classified(reply, meaning: .completed) }
            if case .operation(_, let state, _) = outcome { return try classified(reply, meaning: operationMeaning(state)) }
            throw NativeDataError.invalidResponse
        case "safety":
            let command = try NativeCommunitySafetyCommand(body: original.commandBytes)
            let outcome = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor)
            _ = try outcome.terminal(for: command, recovery: reply.phase == .recover)
            if case .deleted = outcome { return try classified(reply, meaning: .completed) }
            if case .operation(_, let state, _) = outcome { return try classified(reply, meaning: operationMeaning(state)) }
            throw NativeDataError.invalidResponse
        case "publication":
            let command = try NativeExperienceCommand(body: original.commandBytes)
            let input = try NativeExperienceInput(body: reply.phase == .recover ? command.recovery() : command.body)
            let outcome = try NativeExperienceOutcome.decode(bytes, actor: actor)
            guard try outcome.matches(input) else { throw NativeDataError.invalidResponse }
            if case .deleted = outcome { return try classified(reply, meaning: .completed) }
            if case .operation(_, let state, _, _) = outcome { return try classified(reply, meaning: operationMeaning(state)) }
            throw NativeDataError.invalidResponse
        case "case":
            let command = NativeServiceOperationCommand(body: original.commandBytes); try command.validate()
            let raw = try recoveryPayload(bytes, recovered: reply.phase == .recover)
            if raw is NSNull { return try classified(reply, meaning: .absent) }
            let receipt = try NativeServiceOperationReceipt.decode(raw, command: command)
            return try classified(reply, meaning: receipt.outcome == "deleted" ? .completed : .cancelled)
        case "brief":
            let command = try NativeTravelerBriefCommand(body: original.commandBytes)
            let raw = try recoveryPayload(bytes, recovered: reply.phase == .recover)
            if raw is NSNull { return try classified(reply, meaning: .absent) }
            let receipt = try NativeTravelerBriefReceipt(raw: raw, command: command)
            return try classified(reply, meaning: receipt.outcome == "applied" ? .completed : .cancelled)
        case "memory":
            let receipt = try NativeMemoryDeleteReceipt.decode(bytes, command: NativeMemoryDeleteCommand.decode(original.commandBytes))
            return try classified(reply, meaning: receipt.state == "completed" ? .completed : .queued)
        case "trip", "archive":
            let v = try JSONSerialization.jsonObject(with: original.commandBytes) as? [String: Any]
            guard let tripID = original.tripID else { throw NativeDataError.invalidResponse }
            if v?["action"] as? String == "confirm" {
                let request = try JSONDecoder().decode(NativeLinkedTripDeleteRequest.self, from: original.commandBytes)
                let result = try NativeLinkedTripDeleteReceipt.decode(bytes, request: request, tripID: tripID)
                return try classified(reply, meaning: result.state == "completed" ? .completed : .queued)
            }
            let request = try tripRequest(original, actor: actor)
            let receipt = try JSONDecoder().decode(NativeTripDeletionReceipt.self, from: bytes)
            guard receipt.isValid(for: request) else { throw NativeDataError.invalidResponse }
            return try classified(reply, meaning: receipt.state == "completed" ? .completed : .queued)
        case "guide":
            let value = try NativePlaceActionWire.exact(NativePlaceGuideStore.outcome(bytes), ["kind", "operationId"])
            guard value["kind"] as? String == "forgotten", value["operationId"] as? String == original.operationID else { throw NativeDataError.invalidResponse }
            return try classified(reply, meaning: .completed)
        default: throw NativeDataError.invalidResponse
        }
    }

    private enum Meaning { case completed, queued, cancelled, absent }
    private static func operationMeaning(_ state: String) throws -> Meaning {
        switch state { case "committed": .completed; case "abandoned": .cancelled; case "absent": .absent; default: throw NativeDataError.invalidResponse }
    }
    /// Ending recovery is independent of an applied deletion. Canonical outer state/reason must agree with the original outcome.
    private static func classified(_ reply: NativeDataCoverageReceipt, meaning: Meaning) throws -> Verified {
        let state: NativeDataCoverageState, reason: String, terminal: Bool
        switch meaning {
        case .completed: state = .scopedComplete; reason = "NONE"; terminal = true
        case .queued: state = .queued; reason = "ORIGINAL_JOB_PENDING"; terminal = false
        case .cancelled: state = .partial; reason = "ORIGINAL_OPERATION_CANCELLED"; terminal = true
        case .absent: state = .unknown; reason = "ORIGINAL_ACK_ABSENT"; terminal = false
        }
        guard reply.state == state, reply.reason == reason else { throw NativeDataError.invalidResponse }
        return .init(state: state, artifact: nil, expiresAt: nil, terminal: terminal)
    }
    private static func recoveryPayload(_ bytes: Data, recovered: Bool) throws -> Any {
        let raw = try NativeServiceOperationWire.response(bytes)
        if recovered { return try NativeCommunityWire.object(raw, ["receipt"])["receipt"] as Any }
        return raw
    }

    static func tripRequest(_ command: NativeDataCoverageCommand, actor: NativeCommunitySafetyActor) throws -> NativePendingTripDeletion {
        let w = NativeCommunityWire.self, v = try w.object(JSONSerialization.jsonObject(with: command.commandBytes), ["requestId", "tripId", "expectedVersion", "confirmed"])
        guard try w.bool(v["confirmed"]), try w.id(v["requestId"]) == command.operationID,
              try w.id(v["tripId"]) == command.tripID else { throw NativeDataError.invalidResponse }
        return try .init(owner: actor.scope.subject, tripID: w.id(v["tripId"]), requestID: command.operationID,
                         expectedVersion: w.integer(v["expectedVersion"], max: 999_999_999, minimum: 0))
    }

    static func retain(_ command: NativeDataCoverageCommand, using session: NativeSession, actor: NativeCommunitySafetyActor) throws {
        guard command.matches(actor), session.dataScope == actor.scope else { throw NativeDataError.staleSessionResponse }
        switch command.moduleID {
        case "ugc": _ = try session.rememberCommunity(body: command.commandBytes, actor: .init(scope: actor.scope, sessionID: actor.sessionID))
        case "safety": _ = try session.rememberCommunitySafety(body: command.commandBytes, actor: actor)
        case "publication": _ = try session.rememberCommunityExperience(body: command.commandBytes, actor: actor)
        case "case": _ = try session.rememberServiceOperation(NativeServiceOperationCommand(body: command.commandBytes), actor: actor.scope)
        case "brief": _ = try session.rememberTravelerBrief(NativeTravelerBriefCommand(body: command.commandBytes), actor: actor.scope)
        case "memory": try session.rememberMemoryDeletion(NativeMemoryDeleteCommand.decode(command.commandBytes), body: command.commandBytes)
        case "trip", "archive":
            if let v = try JSONSerialization.jsonObject(with: command.commandBytes) as? [String: Any], v["action"] as? String == "confirm", let tripID = command.tripID {
                let request = try JSONDecoder().decode(NativeLinkedTripDeleteRequest.self, from: command.commandBytes)
                try session.rememberLinkedTripDeletion(request, body: command.commandBytes, target: .init(scope: actor.scope, tripID: tripID, headVersion: request.expectedVersion))
            } else { try session.rememberTripDeletion(tripRequest(command, actor: actor)) }
        case "guide": break // The original Guide forget receipt has an operation ID but no durable module journal.
        default: throw NativeDataError.invalidResponse
        }
    }

    static func complete(_ original: NativeDataCoverageCommand, reply: NativeDataCoverageReceipt, using session: NativeSession, actor: NativeCommunitySafetyActor) throws {
        guard original.matches(actor), let bytes = reply.result else { throw NativeDataError.staleSessionResponse }
        let observedSources: [String: NativeJournalDataSourceID] = ["ugc": .community, "safety": .communitySafety,
            "publication": .experience, "case": .serviceOperation, "brief": .travelerBrief]
        let journalQualification = try? verify(reply, original: original, actor: actor)
        let journalCompleted = original.action == .delete && journalQualification?.terminal == true && journalQualification?.state == .scopedComplete
        let journalObserver = journalCompleted ? observedSources[original.moduleID].map { session.journalDataObservation($0) } : nil
        let journalTicket = journalObserver?.begin()
        switch original.moduleID {
        case "ugc":
            let a = NativeCommunityActor(scope: actor.scope, sessionID: actor.sessionID)
            guard let pending = try session.communityRecovery(actor: a) else { return }
            guard pending.body == original.commandBytes else { throw NativeDataError.staleSessionResponse }
            try session.completeCommunity(pending, actor: a)
        case "safety":
            guard let pending = try session.communitySafetyRecovery(actor: actor) else { return }
            guard pending.body == original.commandBytes else { throw NativeDataError.staleSessionResponse }
            try session.completeCommunitySafety(pending, actor: actor)
        case "publication":
            guard let pending = try session.communityExperienceRecovery(actor: actor) else { return }
            guard pending.body == original.commandBytes else { throw NativeDataError.staleSessionResponse }
            try session.completeCommunityExperience(pending, actor: actor)
        case "case":
            guard let pending = try session.serviceOperationRecovery(actor: actor.scope) else { return }
            guard pending.body == original.commandBytes else { throw NativeDataError.staleSessionResponse }
            try session.completeServiceOperation(pending, actor: actor.scope)
        case "brief":
            guard let pending = try session.travelerBriefRecovery(actor: actor.scope) else { return }
            guard pending.body == original.commandBytes else { throw NativeDataError.staleSessionResponse }
            try session.completeTravelerBrief(pending, actor: actor.scope)
        case "memory":
            let receipt = try NativeMemoryDeleteReceipt.decode(bytes, command: NativeMemoryDeleteCommand.decode(original.commandBytes))
            if receipt.sourceTombstoned { session.memoryPreferences.clear() }
            guard try session.memoryDeletionRecovery() != nil else { return }
            try session.completeMemoryDeletion(receipt)
        case "trip", "archive":
            if let v = try JSONSerialization.jsonObject(with: original.commandBytes) as? [String: Any], v["action"] as? String == "confirm", let tripID = original.tripID {
                let request = try JSONDecoder().decode(NativeLinkedTripDeleteRequest.self, from: original.commandBytes)
                let receipt = try NativeLinkedTripDeleteReceipt.decode(bytes, request: request, tripID: tripID)
                guard try session.linkedTripDeletionRecovery() != nil else { return }
                try session.completeLinkedTripDeletion(receipt, target: .init(scope: actor.scope, tripID: tripID, headVersion: request.expectedVersion))
            } else {
                guard try session.pendingTripDeletion() != nil else { return }
                try session.forgetTripDeletion(tripRequest(original, actor: actor))
            }
        case "guide": break
        default: throw NativeDataError.invalidResponse
        }
        journalObserver?.finish(journalTicket, original.operationID)
    }
}
