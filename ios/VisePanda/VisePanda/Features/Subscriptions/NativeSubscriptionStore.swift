import Foundation
import Observation

@MainActor @Observable final class NativeSubscriptionStore {
    enum Phase: Equatable { case unavailable, loading, loaded }
    private(set) var phase = Phase.unavailable
    private(set) var catalog: NativeSubscriptionCatalog?
    private var entitlement: NativeSubscriptionEntitlement?
    private var capturedScope: NativeSubscriptionScope?
    private var nonce: UUID?
    private var foreground = true
    private var expiryTask: Task<Void, Never>?
    private let port: any NativeSubscriptionReadPort
    private struct ReadFence {
        let scope: NativeSubscriptionScope
        let checkedAt: Date
        let deadline: ContinuousClock.Instant
    }
    private var readFence: ReadFence?
    private var leaseStart: ContinuousClock.Instant?
    private var leaseDeadline: ContinuousClock.Instant?
    private let monotonicNow: @MainActor () -> ContinuousClock.Instant

    init(port: any NativeSubscriptionReadPort = NativeSubscriptionUnavailablePort(),
         monotonicNow: @escaping @MainActor () -> ContinuousClock.Instant = { ContinuousClock().now }) {
        self.port = port
        self.monotonicNow = monotonicNow
    }

    /// Rechecks the live scope at render time, before SwiftUI's account-change task can run.
    var visibleEntitlement: NativeSubscriptionEntitlement? {
        guard foreground, phase == .loaded, capturedScope == port.currentScope,
              capturedScope?.valid == true, let entitlement else { return nil }
        if entitlement.state == .active {
            guard let leaseStart, let leaseDeadline,
                  leaseStart <= monotonicNow(), monotonicNow() < leaseDeadline else { return nil }
        }
        return entitlement
    }

    var currentScope: NativeSubscriptionScope? { port.currentScope }

    /// Also used on sign out, view dismissal and backgrounding; old private bytes are discarded.
    func invalidate() { clearProjection(preservingReadFence: false) }

    private func clearProjection(preservingReadFence: Bool) {
        if !preservingReadFence || readFence?.scope != port.currentScope { readFence = nil }
        nonce = nil
        expiryTask?.cancel()
        expiryTask = nil
        capturedScope = nil
        leaseStart = nil
        leaseDeadline = nil
        catalog = nil
        entitlement = nil
        phase = .unavailable
    }

    func invalidateIfScopeChanged() {
        if capturedScope != port.currentScope { invalidate() }
    }

    func setForeground(_ value: Bool) {
        foreground = value
        if !value { invalidate() }
    }

    func reload(locale: NativeSubscriptionLocale) async {
        clearProjection(preservingReadFence: true)
        guard foreground, let scope = port.currentScope, scope.valid else { return }
        let requestNonce = UUID()
        nonce = requestNonce
        capturedScope = scope
        phase = .loading
        defer {
            if nonce == requestNonce, phase == .loading { clearProjection(preservingReadFence: true) }
        }
        let requestStart = monotonicNow()
        do {
            let catalogBytes = try await port.read(.init(scope: scope, resource: .catalog(locale), nonce: requestNonce))
            guard owns(scope, requestNonce) else { return }
            let nextCatalog = try NativeSubscriptionCodec.catalog(catalogBytes, locale: locale)
            let entitlementBytes = try await port.read(.init(scope: scope, resource: .entitlement, nonce: requestNonce))
            guard owns(scope, requestNonce) else { return }
            let nextEntitlement = try NativeSubscriptionCodec.entitlement(entitlementBytes, scope: scope)
            guard owns(scope, requestNonce) else { return }
            if nextEntitlement.state == .active {
                let receivedAt = monotonicNow()
                var deadline = requestStart.advanced(by: .milliseconds(nextEntitlement.lifetimeMs))
                guard let checkedAt = nextEntitlement.checkedAt else { throw NativeSubscriptionError.invalidResponse }
                if let readFence, readFence.scope == scope {
                    guard checkedAt >= readFence.checkedAt else { throw NativeSubscriptionError.staleResponse }
                    if checkedAt == readFence.checkedAt { deadline = min(deadline, readFence.deadline) }
                }
                guard requestStart <= receivedAt, receivedAt < deadline else { clearProjection(preservingReadFence: true); return }
                readFence = .init(scope: scope, checkedAt: checkedAt, deadline: deadline)
                leaseStart = requestStart
                leaseDeadline = deadline
            }
            catalog = nextCatalog
            entitlement = nextEntitlement
            phase = .loaded
            armExpiry(scope: scope, nonce: requestNonce)
        } catch {
            guard nonce == requestNonce, capturedScope == scope else { return }
            clearProjection(preservingReadFence: true)
        }
    }

    private func owns(_ scope: NativeSubscriptionScope, _ requestNonce: UUID) -> Bool {
        foreground && !Task.isCancelled && nonce == requestNonce && capturedScope == scope && port.currentScope == scope
    }

    private func armExpiry(scope: NativeSubscriptionScope, nonce: UUID) {
        guard let leaseDeadline else { return }
        let delay = monotonicNow().duration(to: leaseDeadline)
        guard delay > .zero else { clearProjection(preservingReadFence: true); return }
        expiryTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            guard let self, self.owns(scope, nonce) else { return }
            // Lease expiry hides the projection; it never manufactures a new server state.
            self.clearProjection(preservingReadFence: true)
        }
    }
}
