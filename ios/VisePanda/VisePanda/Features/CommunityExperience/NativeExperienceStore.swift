import Foundation
import Observation

@MainActor @Observable final class NativeExperienceStore {
    typealias Request = (Data) async throws -> Data
    let window = NativeExperienceReadWindow<NativeExperienceOutcome>()
    private(set) var pending: NativeExperiencePending?
    private(set) var busy = false
    private(set) var storageReady = false
    private(set) var notice: String?
    private var actor: NativeCommunitySafetyActor?
    private var generation = UUID()
    private var absentUntil: TimeInterval = 0
    private var journalReady = false
    private let files: NativeExperienceExportFile

    init() { let files = NativeExperienceExportFile(); self.files = files; storageReady = files.ready }
    func bind(_ next: NativeCommunitySafetyActor?) {
        guard next != actor else { return }
        suspend(); actor = next; window.bind(next); pending = nil; journalReady = false; storageReady = false
    }
    func restore(_ actor: NativeCommunitySafetyActor, read: () throws -> NativeExperiencePending?) {
        bind(actor)
        do {
            pending = try read()
            guard pending == nil || pending?.matches(actor.scope, sessionID: actor.sessionID) == true else { throw NativeDataError.staleSessionResponse }
            if let pending { _ = try NativeExperienceCommand(body: pending.body) }
            journalReady = true; storageReady = files.ready; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { journalReady = false; storageReady = false; notice = "STORAGE_UNAVAILABLE" }
    }
    func suspend() {
        generation = UUID(); busy = false; absentUntil = 0; window.clear()
        do { try files.clear(); storageReady = files.ready && journalReady }
        catch { storageReady = false; notice = "STORAGE_CLEANUP_REQUIRED" }
    }
    func tick(current: NativeCommunitySafetyActor?) {
        if current != actor { bind(current); return }
        window.tick(current: current)
        do { try files.tick(current: current) }
        catch { storageReady = false; notice = "STORAGE_CLEANUP_REQUIRED" }
    }
    func visible(current: NativeCommunitySafetyActor?) -> NativeExperienceOutcome? { window.visible(current: current) }
    func exportURL(current: NativeCommunitySafetyActor?) -> URL? { files.visible(current: current) }
    func canRetry(current: NativeCommunitySafetyActor?) -> Bool {
        storageReady && current != nil && current == actor && pending != nil && ProcessInfo.processInfo.systemUptime < absentUntil
    }
    func canPerform(_ command: NativeExperienceCommand, current: NativeCommunitySafetyActor?) -> Bool {
        guard current != nil, actor == current, storageReady, !busy, pending == nil else { return false }
        if command.action == "delete" { return true }
        guard let result = visible(current: current), let input = try? JSONSerialization.jsonObject(with: command.body) as? [String: Any] else { return false }
        switch (command.action, result) {
        case ("requestPublication", .preview(let preview)):
            return command.submissionID == preview.object.id && input["previewDigest"] as? String == preview.digest &&
                input["expectedSubmissionVersion"] as? Int == preview.object.submissionVersion && input["expectedSafetyVersion"] as? Int == preview.object.safetyVersion
        case ("publish", .publication(let publication)):
            return publication.state == "rights_approved" && publication.id == command.publicationID && input["expectedPublicationVersion"] as? Int == publication.version &&
                input["expectedSubmissionVersion"] as? Int == publication.submissionVersion && input["expectedSafetyVersion"] as? Int == publication.safetyVersion
        case ("withdraw", .publication(let publication)):
            return publication.id == command.publicationID && input["expectedPublicationVersion"] as? Int == publication.version
        case ("withdraw", .publications(let publications, _, _)):
            return publications.contains { $0.id == command.publicationID && input["expectedPublicationVersion"] as? Int == $0.version }
        case ("unsave", .reference(let ref)):
            return ref.state == "saved" && ref.version == 1 && ref.id == command.referenceID
        case ("save", _):
            return result.experiences.contains { $0.id == command.publicationID && input["expectedSubmissionVersion"] as? Int == $0.submissionVersion &&
                input["expectedSafetyVersion"] as? Int == $0.safetyVersion && input["expectedPublicationVersion"] as? Int == $0.publicationVersion }
        default: return false
        }
    }
    func load(_ value: [String: Any], current: () -> NativeCommunitySafetyActor?, request: Request) async {
        guard !busy, storageReady, current() == actor, actor != nil else { return }
        notice = nil
        await window.load(current: current) {
            guard let actor = current() else { throw NativeDataError.sessionUnavailable }
            let input = try NativeExperienceInput(body: NativeCommunityWire.bytes(value))
            guard input.mutation == nil, input.recovery == nil, input.action != "export" else { throw NativeDataError.invalidResponse }
            let bytes = try await request(NativeCommunityWire.bytes(value))
            let outcome = try NativeExperienceOutcome.decode(bytes, actor: actor)
            guard try outcome.matches(input) else { throw NativeDataError.invalidResponse }
            return (outcome, outcome.expiry(now: Date()))
        }
    }
    func perform(_ command: NativeExperienceCommand, current: () -> NativeCommunitySafetyActor?,
                 read: () throws -> NativeExperiencePending?, retain: (Data) throws -> NativeExperiencePending,
                 complete: (NativeExperiencePending) throws -> Void, request: Request) async {
        guard canPerform(command, current: current()), !window.busy, let actor else { return }
        let own = generation
        do {
            guard try read() == nil else { throw NativeDataError.sessionUnavailable }
            pending = try retain(command.body)
            guard pending?.body == command.body, pending?.matches(actor.scope, sessionID: actor.sessionID) == true else { throw NativeDataError.invalidResponse }
        } catch { journalReady = false; storageReady = false; notice = "STORAGE_UNAVAILABLE"; return }
        await send(command.body, own: own, actor: actor, current: current, complete: complete, request: request)
    }
    func recover(abandon: Bool = false, retry: Bool = false, current: () -> NativeCommunitySafetyActor?,
                 complete: (NativeExperiencePending) throws -> Void, request: Request) async {
        guard let actor, current() == actor, !busy, !window.busy, storageReady, let pending,
              pending.matches(actor.scope, sessionID: actor.sessionID), !retry || canRetry(current: current()) else { return }
        do {
            let command = try NativeExperienceCommand(body: pending.body)
            await send(retry ? command.body : try command.recovery(abandon: abandon), own: generation, actor: actor,
                       current: current, complete: complete, request: request)
        } catch { notice = "RECOVERY_REQUIRED" }
    }
    private func send(_ body: Data, own: UUID, actor: NativeCommunitySafetyActor, current: () -> NativeCommunitySafetyActor?,
                      complete: (NativeExperiencePending) throws -> Void, request: Request) async {
        window.clear(); busy = true; absentUntil = 0; notice = nil
        defer { if own == generation { busy = false } }
        do {
            try files.clear()
            let input = try NativeExperienceInput(body: body), started = ProcessInfo.processInfo.systemUptime
            let bytes = try await request(body)
            guard own == generation, current() == actor, !Task.isCancelled, ProcessInfo.processInfo.systemUptime - started < 30 else { return }
            let outcome = try NativeExperienceOutcome.decode(bytes, actor: actor)
            guard try outcome.matches(input), let pending else { throw NativeDataError.invalidResponse }
            if case .operation(_, let state, _, _) = outcome, state == "absent" {
                absentUntil = started + 30; notice = "RECEIPT_ABSENT"; return
            }
            if case .operation(_, let state, _, _) = outcome, state == "abandoned" { notice = "ABANDONED" }
            else if case .deleted = outcome { notice = "MODULE_DELETED" }
            else { notice = "COMMITTED_REFRESH_REQUIRED" }
            do { try complete(pending); self.pending = nil }
            catch { journalReady = false; storageReady = false; throw error }
            // Receipts are acknowledgements. Fresh detail/reference/inspect reads supply display rights.
        } catch {
            guard own == generation else { return }
            if current() != actor { bind(current()); return }
            storageReady = files.ready && journalReady
            if !Task.isCancelled { notice = "RECOVERY_REQUIRED" }
        }
    }
    func export(current: () -> NativeCommunitySafetyActor?, request: Request) async {
        guard let actor, current() == actor, !busy, !window.busy, storageReady else { return }
        let own = generation, started = ProcessInfo.processInfo.systemUptime
        window.clear(); busy = true
        defer { if own == generation { busy = false } }
        do {
            try files.clear()
            let input = try NativeExperienceInput(body: NativeCommunityWire.bytes(["action": "export"]))
            let bytes = try await request(NativeCommunityWire.bytes(["action": "export"]))
            guard own == generation, current() == actor, !Task.isCancelled else { return }
            let outcome = try NativeExperienceOutcome.decode(bytes, actor: actor)
            guard try outcome.matches(input), case .export(let data) = outcome else { throw NativeDataError.invalidResponse }
            try files.write(data, actor: actor, started: started, expiresAt: Date().addingTimeInterval(30), current: current)
            storageReady = files.ready; notice = "EXPORT_READY"
        } catch {
            guard own == generation else { return }
            do { try files.clear() } catch { storageReady = false }
            notice = "EXPORT_UNAVAILABLE"
        }
    }
}
