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
    private let now: @MainActor () -> Date

    init(port: any NativeSubscriptionReadPort = NativeSubscriptionUnavailablePort(),
         now: @escaping @MainActor () -> Date = { Date() }) {
        self.port = port
        self.now = now
    }

    /// Rechecks the live scope at render time, before SwiftUI's account-change task can run.
    var visibleEntitlement: NativeSubscriptionEntitlement? {
        guard foreground, phase == .loaded, capturedScope == port.currentScope,
              capturedScope?.valid == true, let entitlement else { return nil }
        if entitlement.state == .active, let period = entitlement.period,
           !(period.purchaseAt <= now() && now() < period.expiresAt) { return nil }
        return entitlement
    }

    var currentScope: NativeSubscriptionScope? { port.currentScope }

    /// Also used on sign out, view dismissal and backgrounding; old private bytes are discarded.
    func invalidate() {
        nonce = nil
        expiryTask?.cancel()
        expiryTask = nil
        capturedScope = nil
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
        invalidate()
        guard foreground, let scope = port.currentScope, scope.valid else { return }
        let requestNonce = UUID()
        nonce = requestNonce
        capturedScope = scope
        phase = .loading
        defer {
            if nonce == requestNonce, phase == .loading { invalidate() }
        }
        do {
            let catalogBytes = try await port.read(.init(scope: scope, resource: .catalog(locale), nonce: requestNonce))
            guard owns(scope, requestNonce) else { return }
            let nextCatalog = try NativeSubscriptionCodec.catalog(catalogBytes, locale: locale)
            let entitlementBytes = try await port.read(.init(scope: scope, resource: .entitlement, nonce: requestNonce))
            guard owns(scope, requestNonce) else { return }
            let nextEntitlement = try NativeSubscriptionCodec.entitlement(entitlementBytes, scope: scope, now: now())
            guard owns(scope, requestNonce) else { return }
            catalog = nextCatalog
            entitlement = nextEntitlement
            phase = .loaded
            armExpiry(nextEntitlement, scope: scope, nonce: requestNonce)
        } catch {
            guard nonce == requestNonce, capturedScope == scope else { return }
            invalidate()
        }
    }

    private func owns(_ scope: NativeSubscriptionScope, _ requestNonce: UUID) -> Bool {
        foreground && !Task.isCancelled && nonce == requestNonce && capturedScope == scope && port.currentScope == scope
    }

    private func armExpiry(_ value: NativeSubscriptionEntitlement, scope: NativeSubscriptionScope, nonce: UUID) {
        guard value.state == .active, let end = value.period?.expiresAt else { return }
        let delay = end.timeIntervalSince(now())
        guard delay > 0, delay <= 366 * 24 * 3_600 else { invalidate(); return }
        expiryTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard let self, self.owns(scope, nonce) else { return }
            // The device clock cannot manufacture an authoritative expired snapshot.
            self.invalidate()
        }
    }
}
