import Foundation
import Observation

@MainActor @Observable
final class NativeSelectedMessageStore {
    var sources = NativeSelectedSources()
    private(set) var scope: NativeDataScope?
    private(set) var pending: NativeSelectedMessageRequest?
    private(set) var contextUnavailable = false
    private(set) var manifest: NativeSelectedContextManifest?
    private var generation = UUID()
    private var pendingMemoryIDs:[String]=[]
    func bind(_ next: NativeDataScope?) {
        guard scope != next else { return }; clear(); scope = next
    }
    func clear() { generation = UUID(); sources = .init(); pending = nil; pendingMemoryIDs=[]; manifest = nil; contextUnavailable = false }
    func prepare(_ request: NativeSelectedMessageRequest,memoryIDs:[String]=[]) throws -> NativeSelectedMessageRequest {
        guard scope != nil, request.valid,memoryIDs.count<=3,Set(memoryIDs).count==memoryIDs.count,memoryIDs.allSatisfy(NativeMemoryWire.uuid) else { throw NativeDataError.invalidResponse }
        if let pending { guard pending == request else { throw NativeDataError.invalidResponse }; return pending }
        pending = request; pendingMemoryIDs=memoryIDs; manifest = nil; return request
    }
    func send(currentScope: () -> NativeDataScope?, post: (Data) async throws -> Data,
              context: (Data) async throws -> Data) async throws -> NativeSelectedMessageAccepted {
        guard let pending, let scope, currentScope() == scope else { throw NativeDataError.sessionUnavailable }
        let own = generation,memoryIDs=pendingMemoryIDs
        do {
            let accepted = try NativeSelectedMessageAccepted.decode(await post(JSONEncoder().encode(pending)))
            guard generation == own, currentScope() == scope, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
            guard accepted.matches(pending) else { throw NativeDataError.invalidResponse }
            self.pending = nil; sources = .init()
            if let goal = accepted.goalID, let version = accepted.scopeVersion {
                let request = NativeSelectedContextRequest(conversationId:accepted.conversationID,goalId:goal,messageId:accepted.messageID,expectedGoalVersion:version,memoryIds:memoryIDs)
                do {
                    let read = try NativeSelectedContextManifest.decode(await context(JSONEncoder().encode(request)))
                    guard generation == own, currentScope() == scope, !Task.isCancelled, read.matches(request) else { throw NativeDataError.staleSessionResponse }
                    manifest = read
                } catch {
                    guard generation == own, currentScope() == scope else { throw NativeDataError.staleSessionResponse }
                    manifest = nil; contextUnavailable = true
                    if case NativeDataError.server(let code) = error, ["DATA_POLICY_BLOCKED","UNAUTHENTICATED"].contains(code) { clear() }
                }
            }
            return accepted
        } catch {
            guard generation == own else { throw error }
            manifest = nil
            if case NativeDataError.server(let code) = error, ["DATA_POLICY_BLOCKED","UNAUTHENTICATED"].contains(code) { clear() }
            throw error // keep exact pending identity/body for explicit same-operation retry
        }
    }
}
