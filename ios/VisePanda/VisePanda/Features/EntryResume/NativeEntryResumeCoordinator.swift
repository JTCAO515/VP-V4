import Foundation
import Observation

@MainActor
@Observable
final class NativeEntryResumeCoordinator {
    private(set) var state = NativeEntryResumeState()
    private(set) var receipts: [ShareIntakeInbox.Receipt] = []
    private(set) var message: String?
    var presented = false
    private let inbox: ShareIntakeInbox?
    private let hosts: Set<String>
    private var active: NativeDataScope?

    init(inbox: ShareIntakeInbox? = try? ShareIntakeInbox.configured(),
         associatedHosts: Set<String> = NativeEntryResumeLink.configuredHosts(Bundle.main.object(forInfoDictionaryKey: "VPEntryResumeAssociatedHosts") as? String)) {
        self.inbox = inbox; hosts = associatedHosts
    }

    @discardableResult func receive(_ url: URL, scope: NativeDataScope?) -> Bool {
        switch NativeEntryResumeLink.parse(url, associatedHosts: hosts) {
        case .unrelated: return false
        case .unavailable:
            state.unavailable(); message = "unavailable"; presented = true
        case .entry(let link):
            guard state.intent == nil else { presented = true; return true }
            state.receive(link.entryID, identity: scope.map(Self.identity))
            presented = true
            refresh(scope: scope)
        }
        return true
    }

    func openInbox(scope: NativeDataScope?) {
        if state.failure != .cleanupRequired { state.clear(cleanupSucceeded: true) }
        refresh(scope: scope)
    }

    func refresh(scope: NativeDataScope?) {
        if let previous = active, previous != scope {
            do { try erase() } catch { message = "cleanupRequired"; return }
        }
        state.authenticate(scope.map(Self.identity))
        active = scope; receipts = []
        guard let inbox else { message = "unconfigured"; return }
        guard let scope else { message = "loginRequired"; return }
        if let failure = state.failure { message = String(describing: failure); return }
        do {
            let available = try inbox.available(namespace: Self.namespace(scope))
            if let intent = state.intent {
                receipts = available.filter { $0.id == intent.entryID }
                if receipts.isEmpty { state.unavailable(); message = "expiredOrUnavailable"; return }
            } else { receipts = available }
            message = nil
        } catch { message = "cleanupRequired"; receipts = [] }
    }

    /// User must press this action after seeing the currently verified account and original material pointer.
    func claim(_ receipt: ShareIntakeInbox.Receipt, scope: NativeDataScope?) throws -> ShareIntakeInbox.Receipt {
        guard let scope, scope == active, let inbox, receipts.contains(receipt),
              state.failure == nil else { throw ShareIntakeError.scope }
        if state.intent == nil { state.receive(receipt.id, identity: Self.identity(scope)) }
        guard state.intent?.entryID == receipt.id,
              state.bind(Self.identity(scope), entryExpiry: receipt.expiresAt) else { throw ShareIntakeError.expired }
        let claimed = try inbox.claim(receipt, namespace: Self.namespace(scope), userConfirmed: true)
        receipts = [claimed]
        return claimed
    }

    /// Synchronous revalidation immediately before F1 consumes the original private URL.
    func sourceURL(_ receipt: ShareIntakeInbox.Receipt, scope: NativeDataScope?) throws -> URL {
        guard let scope, scope == active, let inbox,
              state.current(Self.identity(scope))?.entryID == receipt.id,
              receipts == [receipt] else { throw ShareIntakeError.scope }
        return try inbox.sourceURL(receipt, namespace: Self.namespace(scope))
    }

    func delete(_ receipt: ShareIntakeInbox.Receipt, scope: NativeDataScope?) throws {
        guard let scope, scope == active, let inbox, receipts.contains(receipt),
              receipt.ownerNamespace == nil || receipt.ownerNamespace == Self.namespace(scope) else { throw ShareIntakeError.scope }
        try inbox.delete(receipt, namespace: receipt.ownerNamespace)
        state.clear(cleanupSucceeded: true); refresh(scope: scope)
    }

    /// Retains exactly one verified anonymous selection during credential-free initial login.
    func initialLoginPreservation() throws -> UUID? {
        guard let value = state.intent, value.identity == nil, value.expiresAt > Date(), let inbox else { return nil }
        let receipt = try inbox.unclaimedReceipt(id: value.entryID)
        guard receipt.ownerNamespace == nil, receipt.expiresAt > Date() else { throw ShareIntakeError.expired }
        return receipt.id
    }

    /// Called by session cleanup before any different account can become active. Missing capability has no files.
    func erase(preservingUnclaimedID: UUID? = nil) throws {
        receipts = []; active = nil; presented = false
        do {
            try inbox?.eraseAll(preservingUnclaimedID: preservingUnclaimedID)
            if preservingUnclaimedID == nil { state.clear(cleanupSucceeded: true) }
            else { presented = true }
            message = nil
        }
        catch { state.clear(cleanupSucceeded: false); message = "cleanupRequired"; throw error }
    }

    func hide() { receipts = [] }

    static func identity(_ scope: NativeDataScope) -> NativeEntryResumeState.Identity {
        .init(endpoint: scope.endpoint, owner: scope.subject, epoch: scope.mobileEpoch, generation: scope.generation)
    }
    static func namespace(_ scope: NativeDataScope) -> String {
        // This namespace follows the existing owner/origin/epoch boundary; no secret or content is published.
        NativePDFWire.namespace(scope)
    }
}
