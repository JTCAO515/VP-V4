import Foundation
import Observation

@MainActor @Observable final class NativeCommunitySafetyStore {
    var journalObservation: NativeJournalDataObservation?

    typealias Request = (Data) async throws -> Data
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var objects: [NativeCommunitySafetyObject] = []
    private(set) var selectedObject: NativeCommunitySafetyObject?
    private(set) var records: [NativeCommunitySafetyRecord] = []
    private(set) var selectedRecord: NativeCommunitySafetyRecord?
    private(set) var collection: String?
    private(set) var nextCursor: String?
    private(set) var loaded = false
    private(set) var pending: NativeCommunitySafetyPending?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var storageReady: Bool
    private(set) var receiptAbsent = false
    private(set) var fileURL: URL?
    private var journalReady = true
    private var generation = UUID()
    private var deadline = 0.0
    private var absentDeadline = 0.0
    private var fileDeadline = 0.0
    private let uptime: () -> Double
    private let now: () -> Date
    private let files: NativeCommunitySafetyExportFile
    init(files: NativeCommunitySafetyExportFile? = nil, uptime: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime }, now: @escaping () -> Date = Date.init) {
        let ownFiles = files ?? NativeCommunitySafetyExportFile()
        self.files = ownFiles; self.uptime = uptime; self.now = now; storageReady = ownFiles.ready
    }
    func bind(_ next: NativeCommunitySafetyActor?) {
        guard actor != next else { return }
        suspend(); actor = next; pending = nil; notice = nil
    }
    func restore(_ next: NativeCommunitySafetyActor, read: () throws -> NativeCommunitySafetyPending?) {
        bind(next)
        do {
            pending = try read()
            guard pending == nil || pending?.matches(next.scope, sessionID: next.sessionID) == true else { throw NativeDataError.staleSessionResponse }
            journalReady = true; storageReady = files.ready
            notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { journalReady = false; storageReady = false; notice = "STORAGE_UNAVAILABLE" }
    }
    func suspend() { generation = UUID(); busy = false; clearVisible(); receiptAbsent = false; absentDeadline = 0 }
    func clearVisible() {
        objects = []; selectedObject = nil; records = []; selectedRecord = nil; collection = nil; nextCursor = nil; loaded = false; deadline = 0
        fileURL = nil; fileDeadline = 0
        do { try files.clear(); storageReady = files.ready && journalReady }
        catch { storageReady = false; notice = "STORAGE_CLEANUP_REQUIRED" }
    }
    func isFresh(_ current: NativeCommunitySafetyActor?) -> Bool {
        current != nil && current == actor && uptime() < deadline && objects.allSatisfy({ now() < $0.expiresAt }) && (selectedObject == nil || now() < selectedObject!.expiresAt)
    }
    func tick(current: NativeCommunitySafetyActor?) {
        if current != actor { bind(current); return }
        if loaded && !isFresh(current) { clearVisible(); notice = "REFRESH_REQUIRED" }
        if fileURL != nil && uptime() >= fileDeadline { clearVisible(); notice = "EXPORT_EXPIRED" }
        if receiptAbsent && uptime() >= absentDeadline { receiptAbsent = false }
    }
    func visibleObjects(_ current: NativeCommunitySafetyActor?) -> [NativeCommunitySafetyObject] { isFresh(current) ? objects : [] }
    func visibleRecords(_ current: NativeCommunitySafetyActor?) -> [NativeCommunitySafetyRecord] { isFresh(current) ? records : [] }
    func visibleObject(_ current: NativeCommunitySafetyActor?) -> NativeCommunitySafetyObject? { isFresh(current) ? selectedObject : nil }
    func visibleRecord(_ current: NativeCommunitySafetyActor?) -> NativeCommunitySafetyRecord? { isFresh(current) ? selectedRecord : nil }
    func exportURL(_ current: NativeCommunitySafetyActor?) -> URL? {
        guard storageReady, current != nil, current == actor, uptime() < fileDeadline else { return nil }; return fileURL
    }
    func canRetry(_ current: NativeCommunitySafetyActor?) -> Bool { current != nil && current == actor && storageReady && receiptAbsent && uptime() < absentDeadline }
    func canPerform(_ command: NativeCommunitySafetyCommand, current: NativeCommunitySafetyActor?) -> Bool {
        guard current != nil, current == actor, !busy, storageReady, pending == nil else { return false }
        if command.action == "delete" { return true }
        guard isFresh(current) else { return false }
        if command.action == "unblock" { return selectedRecord?.id == command.recordID && selectedRecord?.canUnblock == true }
        if command.action == "appeal" {
            guard let record = selectedRecord, record.appealBasis != nil,
                  let input = try? JSONSerialization.jsonObject(with: command.body) as? [String: Any] else { return false }
            return record.submissionID == command.submissionID && record.submissionVersion == command.submissionVersion && record.safetyVersion == command.safetyVersion && input["basis"] as? String == record.appealBasis
        }
        guard let object = selectedObject else { return false }
        return object.id == command.submissionID && object.submissionVersion == command.submissionVersion && object.safetyVersion == command.safetyVersion && (command.action == "report" ? object.canReport : command.action == "block" && object.canBlock)
    }
    func load(collection: String? = nil, cursor: String? = nil, current: () -> NativeCommunitySafetyActor?, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady, collection == nil || NativeCommunitySafetyWire.collections.contains(collection!) else { return }
        let own = generation, start = uptime(); clearVisible(); busy = true
        defer { if own == generation { busy = false } }
        do {
            var input: [String: Any] = ["action": collection == nil ? "objects" : "mine", "cursor": cursor as Any? ?? NSNull()]
            if let collection { input["collection"] = collection }
            let bytes = try await request(NativeCommunityWire.bytes(input))
            guard valid(own: own, actor: actor, start: start, current: current) else { return }
            let outcome = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor)
            switch outcome {
            case .objects(let values, let next, _) where collection == nil:
                guard cursor == nil || values.allSatisfy({ $0.id > cursor! }), values.allSatisfy({ now() < $0.expiresAt }) else { throw NativeDataError.invalidResponse }
                objects = values; nextCursor = next
            case .page(let c, let values, let next, _) where c == collection:
                guard cursor == nil || values.allSatisfy({ $0.id > cursor! }) else { throw NativeDataError.invalidResponse }
                records = values; self.collection = c; nextCursor = next
            default: throw NativeDataError.invalidResponse
            }
            deadline = start + 30; loaded = true; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { fail(error, own: own) }
    }
    func read(objectID: String? = nil, collection: String? = nil, recordID: String? = nil, current: () -> NativeCommunitySafetyActor?, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady else { return }
        let own = generation, start = uptime(); clearVisible(); busy = true
        defer { if own == generation { busy = false } }
        do {
            let input: [String: Any]
            if let objectID { input = ["action": "object", "submissionId": objectID] }
            else {
                guard let collection, let recordID, NativeCommunitySafetyWire.collections.contains(collection) else { throw NativeDataError.invalidResponse }
                input = ["action": "read", "collection": collection, "id": recordID]
            }
            let bytes = try await request(NativeCommunityWire.bytes(input))
            guard valid(own: own, actor: actor, start: start, current: current) else { return }
            switch try NativeCommunitySafetyOutcome.decode(bytes, actor: actor) {
            case .object(let value) where value.id == objectID:
                guard now() < value.expiresAt else { throw NativeDataError.invalidResponse }; selectedObject = value
            case .record(let value) where value.id == recordID && value.kind == NativeCommunitySafetyWire.collectionKind(collection ?? ""):
                selectedRecord = value; self.collection = collection
            default: throw NativeDataError.invalidResponse
            }
            deadline = start + 30; loaded = true; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { fail(error, own: own) }
    }
    func perform(_ command: NativeCommunitySafetyCommand, current: () -> NativeCommunitySafetyActor?, read: () throws -> NativeCommunitySafetyPending?, retain: (Data) throws -> NativeCommunitySafetyPending, complete: (NativeCommunitySafetyPending) throws -> Void, request: Request) async {
        guard let actor, canPerform(command, current: current()) else { return }
        let own = generation, start = uptime(); busy = true
        defer { if own == generation { busy = false } }
        do {
            let existing: NativeCommunitySafetyPending?
            do { existing = try read() } catch { journalReady = false; storageReady = false; throw error }
            if let existing { pending = existing; notice = "RECOVERY_REQUIRED"; return }
            let durable: NativeCommunitySafetyPending
            do { durable = try retain(command.body) }
            catch { journalReady = false; storageReady = false; throw error }
            guard durable.body == command.body, durable.matches(actor.scope, sessionID: actor.sessionID), try read() == durable else { throw NativeDataError.sessionUnavailable }
            pending = durable; receiptAbsent = false; clearVisible()
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let bytes = try await request(command.body)
            guard valid(own: own, actor: actor, start: start, current: current) else { return }
            let outcome = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor)
            guard try outcome.terminal(for: command, recovery: false) else { throw NativeDataError.invalidResponse }
            try finish(durable, outcome: outcome, start: start, complete: complete)
        } catch { fail(error, own: own) }
    }
    func recover(abandon: Bool = false, current: () -> NativeCommunitySafetyActor?, complete: (NativeCommunitySafetyPending) throws -> Void, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady, let pending else { return }
        let own = generation, start = uptime(); busy = true; receiptAbsent = false; clearVisible()
        defer { if own == generation { busy = false } }
        do {
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let command = try NativeCommunitySafetyCommand(body: pending.body)
            let bytes = try await request(command.recovery(abandon: abandon))
            guard valid(own: own, actor: actor, start: start, current: current) else { return }
            let outcome = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor)
            if try outcome.terminal(for: command, recovery: true) { try finish(pending, outcome: outcome, start: start, complete: complete) }
            else {
                guard !abandon, case .operation(_, "absent", nil) = outcome else { throw NativeDataError.invalidResponse }
                receiptAbsent = true; absentDeadline = start + 30; notice = "EXACT_RETRY_OR_ABANDON"
            }
        } catch { fail(error, own: own) }
    }
    func retry(current: () -> NativeCommunitySafetyActor?, read: () throws -> NativeCommunitySafetyPending?, complete: (NativeCommunitySafetyPending) throws -> Void, request: Request) async {
        guard let actor, canRetry(current()), !busy, let pending else { return }
        let own = generation, start = uptime(); busy = true; receiptAbsent = false; clearVisible()
        defer { if own == generation { busy = false } }
        do {
            guard storageReady, try read() == pending else { throw NativeDataError.sessionUnavailable }
            let command = try NativeCommunitySafetyCommand(body: pending.body)
            let bytes = try await request(pending.body)
            guard valid(own: own, actor: actor, start: start, current: current) else { return }
            let outcome = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor)
            guard try outcome.terminal(for: command, recovery: false) else { throw NativeDataError.invalidResponse }
            try finish(pending, outcome: outcome, start: start, complete: complete)
        } catch { fail(error, own: own) }
    }
    func export(current: () -> NativeCommunitySafetyActor?, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady else { return }
        let own = generation, start = uptime(); busy = true; clearVisible()
        defer { if own == generation { busy = false } }
        do {
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let bytes = try await request(NativeCommunityWire.bytes(["action": "export"]))
            guard valid(own: own, actor: actor, start: start, current: current), case .export(let artifact) = try NativeCommunitySafetyOutcome.decode(bytes, actor: actor) else { throw NativeDataError.invalidResponse }
            fileURL = try files.write(artifact); fileDeadline = start + 30; notice = "MODULE_EXPORT_READY"
        } catch { fail(error, own: own) }
    }
    private func valid(own: UUID, actor: NativeCommunitySafetyActor, start: Double, current: () -> NativeCommunitySafetyActor?) -> Bool {
        guard own == generation else { return false }
        guard current() == actor, !Task.isCancelled, uptime() - start < 30 else {
            clearVisible(); notice = pending == nil ? "REFRESH_REQUIRED" : "ACK_UNKNOWN"; return false
        }
        return true
    }
    private func finish(_ value: NativeCommunitySafetyPending, outcome: NativeCommunitySafetyOutcome, start: Double, complete: (NativeCommunitySafetyPending) throws -> Void) throws {
        let journalEligible: Bool = { switch outcome { case .deleted: true; case .operation(_, let state, _): state == "committed"; default: false } }()
        let journalTicket = journalEligible ? journalObservation?.begin() : nil
        do { try complete(value) } catch { journalReady = false; storageReady = false; throw error }
        pending = nil
        if case .operation(_, let state, let record) = outcome {
            selectedRecord = record; loaded = record != nil; deadline = start + 30
            notice = state == "abandoned" ? "ABANDONED" : "ACKNOWLEDGED"
        } else { notice = "MODULE_DELETED" }
        journalObservation?.finish(journalTicket, try NativeCommunitySafetyCommand(body: value.body).operationID)
    }
    private func fail(_ error: Error, own: UUID) {
        guard own == generation else { return }
        clearVisible(); receiptAbsent = false
        if !storageReady { notice = "STORAGE_CLEANUP_REQUIRED"; return }
        if case NativeDataError.server(let code) = error { notice = code }
        else { notice = pending == nil ? "SAFETY_UNAVAILABLE" : "ACK_UNKNOWN" }
    }
}
