import Foundation
import UniformTypeIdentifiers

/// Item-provider URLs expire when their callback returns. Commit the bounded private copy inside it.
/// NSLock synchronizes cancellation with the provider callback; no unchecked shared field is read unlocked.
nonisolated final class ShareIntakeDelivery: @unchecked Sendable {
    private let lock = NSLock()
    private var isCancelled = false
    private var receipt: ShareIntakeInbox.Receipt?
    private let inbox: ShareIntakeInbox

    init(inbox: ShareIntakeInbox) { self.inbox = inbox }

    func start(provider: NSItemProvider,
               completion: @escaping @Sendable (Result<ShareIntakeInbox.Receipt, ShareIntakeError>) -> Void) -> Progress {
        provider.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { [self] url, error in
            guard error == nil, let url else { completion(.failure(.unavailable)); return }
            do {
                let saved = try inbox.receive(fileAt: url, cancelled: { self.cancelled() })
                lock.lock()
                let cancelledAfterCommit = isCancelled
                receipt = saved
                lock.unlock()
                if cancelledAfterCommit {
                    do { try cancel(); completion(.failure(.cancelled)) }
                    catch { completion(.failure(.integrity)) }
                } else {
                    completion(.success(saved))
                }
            } catch {
                completion(.failure(error as? ShareIntakeError ?? .unavailable))
            }
        }
    }

    func cancel() throws {
        lock.lock()
        isCancelled = true
        let saved = receipt
        lock.unlock()
        if let saved {
            try inbox.delete(saved, namespace: nil)
            lock.lock()
            if receipt == saved { receipt = nil }
            lock.unlock()
        }
    }

    private func cancelled() -> Bool {
        lock.lock(); defer { lock.unlock() }
        return isCancelled
    }
}
