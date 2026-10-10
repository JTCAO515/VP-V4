import Foundation
import Observation

@MainActor @Observable
final class NativeTravelDirectionsIntakeStore {
    private(set) var selection: NativeTravelDirectionsSelection?
    private(set) var basis: NativeTravelDirectionsWriteBasis?
    private(set) var intake: NativeTravelDirectionsIntakeBasis?
    private(set) var publication: NativeTravelDirectionsPublication?
    private(set) var pendingBody: Data?
    private(set) var busy = false
    private(set) var notice: String?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func bind(_ target: NativeTravelDirectionsSelection?) {
        guard selection != target else { return }
        generation = UUID(); selection = target; basis = nil; intake = nil
        publication = nil; pendingBody = nil; busy = false; deadline = 0; notice = nil
    }
    func qualified(_ current: NativeTravelDirectionsSelection?) -> Bool {
        selection == current && current != nil && basis?.matches(current!) == true && uptime() < deadline && !busy && pendingBody == nil
    }
    func load(current: @escaping () -> NativeTravelDirectionsSelection?,
              read: (String, String, String) async throws -> Data) async {
        guard !busy, let target = selection, target.valid, target == current() else { return }
        let own = generation, start = uptime(); busy = true; basis = nil; intake = nil; deadline = 0
        defer { if generation == own { busy = false } }
        do {
            let b = try await read("basis", target.conversationID, target.goalID)
            guard generation == own, target == current(), !Task.isCancelled else { return }
            guard let value = try NativeTravelDirectionsWriteBasis.decode(b), value.matches(target) else { throw NativeDataError.staleSessionResponse }
            let i = try await read("intake", target.conversationID, target.goalID)
            guard generation == own, target == current(), !Task.isCancelled else { return }
            let currentIntake = try NativeTravelDirectionsIntakeBasis.decode(i)
            if let currentIntake {
                guard currentIntake.conversationId == value.conversationId, currentIntake.goalId == value.goalId,
                      currentIntake.goalVersion == value.goalVersion, currentIntake.inputMessageId == value.parentMessageId,
                      currentIntake.inputSequence == value.messageSequence, currentIntake.intakeRevision == value.intakeRevision,
                      currentIntake.intakeDigest == value.intakeDigest else { throw NativeDataError.staleSessionResponse }
            } else { guard value.intakeRevision == 0 else { throw NativeDataError.staleSessionResponse } }
            guard uptime() - start < 30 else { throw NativeDataError.staleSessionResponse }
            basis = value; intake = currentIntake; deadline = start + 30; notice = nil
        } catch { if generation == own, target == current() { basis = nil; intake = nil; deadline = 0; notice = "unavailable" } }
    }
    func submit(values: NativeTravelDirectionsFormValues, text: String, locale: String,
                current: @escaping () -> NativeTravelDirectionsSelection?, post: (Data) async throws -> Data,
                read: (String, Int) async throws -> Data, readIntake: (String, String) async throws -> Data) async {
        guard qualified(current()), let target = selection, let basis, values.valid,
              NativeFiveResultContent.text(text, max: 4000) != nil, ["zh", "en"].contains(locale) else { return }
        let useSaved = values.useSavedPace && values.pace.isEmpty
        guard !useSaved || intake?.profilePace?.sourceRevision != nil else { notice = "profileUnavailable"; return }
        var projection: [String: Any] = ["schemaVersion": "travel-directions-intake/1", "destinations": values.destinationLabels,
            "durationDays": values.days as Any? ?? NSNull(), "interests": values.interestLabels,
            "currentPace": values.pace.isEmpty ? NSNull() : values.pace as Any,
            "budget": NSNull(), "dates": NSNull(), "intent": values.specific ? "specific" : "explore"]
        if let budget = values.budgetMinorUnits { projection["budget"] = ["currency": values.currency, "totalMinorUnits": budget] }
        if !values.startDate.isEmpty { projection["dates"] = ["startDate": values.startDate, "endDate": values.endDate] }
        let request: [String: Any] = ["conversationId": target.conversationID, "goalId": target.goalID,
            "expectedGoalVersion": target.goalVersion, "parentMessageId": target.parentMessageID,
            "messageId": UUID().uuidString.lowercased(), "messageKey": UUID().uuidString.lowercased(),
            "threadId": UUID().uuidString.lowercased(), "turnId": UUID().uuidString.lowercased(),
            "taskId": UUID().uuidString.lowercased(), "taskKey": UUID().uuidString.lowercased(),
            "planningPolicyId": target.planningPolicyID, "locale": locale, "text": text,
            "memoryBasis": (intake?.memoryBasis ?? []).map { ["id": $0.id, "revision": $0.revision] as [String: Any] },
            "expectedSourceSequence": basis.messageSequence, "expectedIntakeRevision": basis.intakeRevision,
            "expectedIntakeDigest": basis.intakeDigest as Any? ?? NSNull(), "intake": projection,
            "useSavedPace": useSaved, "expectedProfileRevision": useSaved ? intake?.profilePace?.sourceRevision as Any? ?? NSNull() : NSNull()]
        do {
            _ = try NativeTravelDirectionsIntake.decode(projection)
            let bytes = try JSONSerialization.data(withJSONObject: request, options: .sortedKeys)
            guard bytes.count <= 16_384 else { throw NativeDataError.invalidResponse }
            pendingBody = bytes
            await retry(current: current, post: post, read: read, readIntake: readIntake)
        } catch { notice = "invalid" }
    }
    func retry(current: @escaping () -> NativeTravelDirectionsSelection?, post: (Data) async throws -> Data,
               read: (String, Int) async throws -> Data, readIntake: (String, String) async throws -> Data) async {
        guard !busy, let target = selection, target.sameRequestContext(as: current()), let bytes = pendingBody,
              let request = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return }
        let own = generation; busy = true; notice = nil; publication = nil
        defer { if generation == own { busy = false } }
        do {
            let reply = try await post(bytes)
            guard generation == own, target.sameRequestContext(as: current()), !Task.isCancelled else { return }
            let receipt = try NativeTravelDirectionsPublication.decode(reply, request: request)
            guard receipt.current else { pendingBody = nil; basis = nil; deadline = 0; notice = "stale"; return }
            let start = uptime()
            let intakeBytes = try await readIntake(target.conversationID, target.goalID)
            guard generation == own, target.sameRequestContext(as: current()), !Task.isCancelled else { return }
            guard let freshIntake = try NativeTravelDirectionsIntakeBasis.decode(intakeBytes),
                  freshIntake.conversationId == target.conversationID, freshIntake.goalId == target.goalID,
                  freshIntake.goalVersion == receipt.goalVersion, freshIntake.inputMessageId == receipt.inputMessageID,
                  freshIntake.inputSequence == receipt.inputSequence, freshIntake.intakeRevision == receipt.intakeRevision,
                  freshIntake.intakeDigest == receipt.intakeDigest,
                  let requestedIntake = request["intake"] as? [String: Any],
                  freshIntake.intake == (try NativeTravelDirectionsIntake.decode(requestedIntake)),
                  let requestedMemories = request["memoryBasis"] as? [[String: Any]] else { throw NativeDataError.staleSessionResponse }
            let memoryRefs = try JSONDecoder().decode([NativeTravelMemoryReference].self, from: JSONSerialization.data(withJSONObject: requestedMemories))
            guard Set(memoryRefs.map { "\($0.id):\($0.revision)" }) == Set(freshIntake.memoryBasis.map { "\($0.id):\($0.revision)" }),
                  memoryRefs.count == freshIntake.memoryBasis.count else { throw NativeDataError.staleSessionResponse }
            let content = try await read(receipt.artifactID, receipt.revision)
            guard generation == own, target.sameRequestContext(as: current()), !Task.isCancelled else { return }
            guard uptime() - start < 30,
                  let record = try NativeFiveResultRecord.decode(content, artifactID: receipt.artifactID, revision: receipt.revision), record.current,
                  record.source.taskId == receipt.taskID, record.source.taskTurnId == receipt.turnID,
                  record.source.goalId == target.goalID, record.source.goalVersion == receipt.goalVersion,
                  record.source.inputMessageId == receipt.inputMessageID, record.source.inputSequence == receipt.inputSequence,
                  record.source.tripId == freshIntake.tripId, record.source.tripVersion == freshIntake.tripVersion,
                  Set(record.memories.map { "\($0.id):\($0.revision)" }) == Set(memoryRefs.map { "\($0.id):\($0.revision)" }),
                  record.memories.count == memoryRefs.count,
                  case .directions(let directions) = record.content, directions.intake == freshIntake.intake else { throw NativeDataError.staleSessionResponse }
            publication = receipt; pendingBody = nil; basis = nil; deadline = 0
        } catch {
            guard generation == own, target.sameRequestContext(as: current()) else { return }
            basis = nil; deadline = 0; notice = "unconfirmed"
            if case NativeDataError.server(let code) = error, ["UNAUTHENTICATED", "DATA_POLICY_BLOCKED"].contains(code) {
                pendingBody = nil; intake = nil; notice = "blocked"
            }
        }
    }
}
