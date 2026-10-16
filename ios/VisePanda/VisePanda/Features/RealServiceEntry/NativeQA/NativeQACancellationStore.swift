import Foundation
import Observation

/// Owns only stop intent/receipt projection. It never acknowledges generation or changes message state.
@MainActor @Observable
final class NativeQACancellationStore {
    enum State: Equatable { case inactive, ready, requesting, checking, pending, unknown, cancelled, alreadyTerminal, blocked, unavailable }
    private(set) var state: State = .inactive
    private(set) var receipt: NativeQACancellationReceipt?
    private(set) var command: NativeQACancellationPending?
    private let transport: any NativeQATransport
    private let persistence: any NativeQACancellationPersistence
    private let currentTarget: () -> NativeQACancellationTarget?
    private var bound: NativeQACancellationTarget?
    private var active = false
    private var generation = UUID()
    private var work: Task<Void, Never>?
    init(transport: any NativeQATransport, persistence: any NativeQACancellationPersistence,
         currentTarget: @escaping () -> NativeQACancellationTarget?) {
        self.transport = transport; self.persistence = persistence; self.currentTarget = currentTarget
    }
    var target: NativeQACancellationTarget? { currentTarget() }
    var busy: Bool { work != nil }
    var hasCurrentProjection: Bool {
        guard active, let bound, let target else { return false }
        return target.valid && bound.sameRequest(as: target) && transport.scope == target.scope
    }
    var canRequestStop: Bool { hasCurrentProjection && !busy && state == .ready && command == nil && target?.canRequestStop == true }
    func invalidate() {
        generation = UUID(); work?.cancel(); work = nil
        active = false; bound = nil; receipt = nil; command = nil; state = .inactive
    }
    func activate(_ visible: Bool) async {
        invalidate()
        guard visible, let target, target.valid, transport.scope == target.scope else { return }
        active = true; bound = target
        await perform(reading: true) { captured, token in
            if let record = try self.load(captured) {
                self.command = record.command
                try await self.read(record.command, durable: true, target: captured, token: token)
            } else { self.state = .ready }
        }
    }
    func requestStop() async {
        guard canRequestStop else { return }
        await perform(reading: false) { captured, token in
            // Even a different instance may already have persisted this tuple. Never repeat its POST.
            if let record = try self.load(captured) {
                self.command = record.command
                try await self.read(record.command, durable: true, target: captured, token: token)
                return
            }
            try self.ensure(captured, token, freshStop: true)
            let command = try NativeQACancellationPending(target: captured)
            self.command = command
            try self.persistence.retainCancellation(command, scope: captured.scope)
            guard let physical = try self.load(captured), physical.command == command else { throw NativeQACancellationError.storageUnavailable }
            if physical.receipt != nil {
                try await self.read(command, durable: true, target: captured, token: token)
                return
            }
            try self.ensure(captured, token, freshStop: true)
            let response = try await self.transport.request(.requestCancellation(command), scope: captured.scope)
            try self.ensure(captured, token)
            try self.accept(response, command: command, durable: true, target: captured, token: token)
        }
    }
    func checkResult() async {
        guard hasCurrentProjection, !busy else { return }
        await perform(reading: true) { captured, token in
            let record = try self.load(captured)
            let command = try record?.command ?? NativeQACancellationPending(target: captured)
            self.command = record?.command
            try await self.read(command, durable: record != nil, target: captured, token: token)
        }
    }
    private func load(_ captured: NativeQACancellationTarget) throws -> NativeQACancellationRecord? {
        let record = try persistence.loadCancellation(target: captured)
        guard record.map({ $0.valid && $0.command.matches(captured) }) ?? true else { throw NativeQACancellationError.storageUnavailable }
        return record
    }
    private func read(_ command: NativeQACancellationPending, durable: Bool, target captured: NativeQACancellationTarget, token: UUID) async throws {
        try ensure(captured, token)
        let response = try await transport.request(.readCancellation(sessionID: command.sessionID, requestID: command.requestID), scope: captured.scope)
        try ensure(captured, token)
        try accept(response, command: command, durable: durable, target: captured, token: token)
    }
    private func accept(_ response: NativeQAHTTPResponse, command: NativeQACancellationPending, durable: Bool,
                        target captured: NativeQACancellationTarget, token: UUID) throws {
        try ensure(captured, token)
        guard command.matches(captured) else { throw NativeQACancellationError.stale }
        let observed = try NativeQACancellationReceipt.decode(response, command: command)
        if observed.observed, durable {
            try persistence.finishCancellation(command, receipt: observed, scope: captured.scope)
            guard let physical = try load(captured), physical.command == command, physical.receipt == observed else {
                throw NativeQACancellationError.storageUnavailable
            }
        }
        try ensure(captured, token)
        receipt = observed
        switch observed.state {
        case .cancelled: state = .cancelled
        case .terminal: state = .alreadyTerminal
        case .pending: state = .pending
        case .notObserved: state = .unknown
        }
    }
    private func ensure(_ captured: NativeQACancellationTarget, _ token: UUID, freshStop: Bool = false) throws {
        guard hasCurrentProjection, generation == token, let current = target, current.sameRequest(as: captured),
              !Task.isCancelled, !freshStop || current.canRequestStop else { throw NativeQACancellationError.stale }
    }
    private func perform(reading: Bool, _ action: @escaping @MainActor (NativeQACancellationTarget, UUID) async throws -> Void) async {
        guard hasCurrentProjection, !busy, let captured = bound else { return }
        let token = generation
        state = reading ? .checking : .requesting; receipt = nil
        let task = Task { @MainActor in
            do { try await action(captured, token) }
            catch {
                guard self.generation == token, self.active else { return }
                guard self.hasCurrentProjection else { self.invalidate(); return }
                self.receipt = nil
                if let error = error as? NativeQACancellationError,
                   case .server(let code, _) = error, ["UNAUTHENTICATED", "FORBIDDEN"].contains(code) {
                    self.state = .blocked
                } else { self.state = self.command == nil ? .unavailable : .unknown }
            }
            if self.generation == token { self.work = nil }
        }
        work = task
        await withTaskCancellationHandler { await task.value } onCancel: { task.cancel() }
    }
}
