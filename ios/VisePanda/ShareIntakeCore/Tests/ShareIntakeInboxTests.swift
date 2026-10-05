import CoreGraphics
import Foundation
import XCTest
#if canImport(VisePanda)
@testable import VisePanda
#else
@testable import ShareIntakeCore
#endif

nonisolated final class ShareIntakeInboxTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_791_190_000)
    private let accountA = String(repeating: "a", count: 64)
    private let accountB = String(repeating: "b", count: 64)

    private func fixture(_ run: (ShareIntakeInbox, URL, URL) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let container = root.appendingPathComponent("owned-container", isDirectory: true)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let original = root.appendingPathComponent("original.pdf")
        try pdf(pages: 1).write(to: original)
        try run(ShareIntakeInbox(container: container), original, container)
    }

    private func pdf(pages: Int, encrypted: Bool = false) throws -> Data {
        let buffer = NSMutableData()
        let consumer = try XCTUnwrap(CGDataConsumer(data: buffer))
        var media = CGRect(x: 0, y: 0, width: 100, height: 100)
        let options: [CFString: Any] = encrypted ? [kCGPDFContextOwnerPassword: "synthetic-only", kCGPDFContextUserPassword: "synthetic-only"] : [:]
        let context = try XCTUnwrap(CGContext(consumer: consumer, mediaBox: &media, options as CFDictionary))
        for _ in 0..<pages {
            context.beginPDFPage(nil)
            context.fill(CGRect(x: 5, y: 5, width: 5, height: 5))
            context.endPDFPage()
        }
        context.closePDF()
        return buffer as Data
    }

    func testDeliveryNeedsExplicitClaimAndPreservesOriginalAndExpiry() throws {
        try fixture { inbox, original, _ in
            let bytes = try Data(contentsOf: original)
            let receipt = try inbox.receive(fileAt: original, now: now)
            XCTAssertNil(receipt.ownerNamespace)
            XCTAssertEqual(receipt.digest, ShareIntakeInbox.digest(bytes))
            XCTAssertEqual(receipt.pageCount, 1)
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [receipt])
            XCTAssertThrowsError(try inbox.read(receipt, namespace: accountA, now: now))
            XCTAssertThrowsError(try inbox.claim(receipt, namespace: accountA, userConfirmed: false, now: now))
            let owned = try inbox.claim(receipt, namespace: accountA, userConfirmed: true, now: now.addingTimeInterval(20))
            XCTAssertEqual(owned.id, receipt.id)
            XCTAssertEqual(owned.expiresAt, receipt.expiresAt)
            XCTAssertEqual(try inbox.read(owned, namespace: accountA, now: now.addingTimeInterval(20)), bytes)
            XCTAssertEqual(try Data(contentsOf: original), bytes)
            try inbox.delete(owned, namespace: accountA)
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now.addingTimeInterval(20)), [])
            XCTAssertEqual(try Data(contentsOf: original), bytes)
        }
    }

    func testAccountEndpointOrEpochNamespaceCannotTransferReadOrDelete() throws {
        try fixture { inbox, original, _ in
            let pending = try inbox.receive(fileAt: original, now: now)
            let owned = try inbox.claim(pending, namespace: accountA, userConfirmed: true, now: now)
            XCTAssertEqual(try inbox.available(namespace: accountB, now: now), [])
            XCTAssertThrowsError(try inbox.read(owned, namespace: accountB, now: now))
            XCTAssertThrowsError(try inbox.sourceURL(owned, namespace: accountB, now: now))
            XCTAssertThrowsError(try inbox.claim(owned, namespace: accountB, userConfirmed: true, now: now))
            XCTAssertThrowsError(try inbox.delete(owned, namespace: accountB))
            XCTAssertThrowsError(try inbox.claim(pending, namespace: accountB, userConfirmed: true, now: now))
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [owned])
        }
    }

    func testExpiryRejectsOldLinkAndPurgeDeletesOwnedCopyOnly() throws {
        try fixture { inbox, original, _ in
            let pending = try inbox.receive(fileAt: original, now: now)
            let owned = try inbox.claim(pending, namespace: accountA, userConfirmed: true, now: now)
            XCTAssertThrowsError(try inbox.read(owned, namespace: accountA, now: owned.expiresAt)) { XCTAssertEqual($0 as? ShareIntakeError, .expired) }
            XCTAssertThrowsError(try inbox.claim(pending, namespace: accountA, userConfirmed: true, now: pending.expiresAt))
            XCTAssertEqual(try inbox.available(namespace: accountA, now: owned.expiresAt), [])
            XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
        }
    }

    func testInvalidFormatPageLimitAndEncryptionDoNotPublish() throws {
        try fixture { inbox, original, _ in
            for bytes in [Data("not a PDF".utf8), try pdf(pages: 11), try pdf(pages: 1, encrypted: true)] {
                try bytes.write(to: original)
                XCTAssertThrowsError(try inbox.receive(fileAt: original, now: now))
                XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [])
                XCTAssertEqual(try Data(contentsOf: original), bytes)
            }
        }
    }

    func testByteLimitAndCancellationLeaveNoPublishedOrStagedCopy() throws {
        try fixture { inbox, original, _ in
            XCTAssertThrowsError(try inbox.receive(fileAt: original, now: now, cancelled: { true })) { XCTAssertEqual($0 as? ShareIntakeError, .cancelled) }
            try Data(repeating: 0, count: ShareIntakeInbox.maximumBytes + 1).write(to: original)
            XCTAssertThrowsError(try inbox.receive(fileAt: original, now: now)) { XCTAssertEqual($0 as? ShareIntakeError, .size) }
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [])
        }
    }

    func testDuplicatesAreIndependentReceiptsNeverOverwriteOriginal() throws {
        try fixture { inbox, original, _ in
            let first = try inbox.receive(fileAt: original, now: now)
            let second = try inbox.receive(fileAt: original, now: now)
            XCTAssertNotEqual(first.id, second.id)
            XCTAssertEqual(first.digest, second.digest)
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now).count, 2)
            try inbox.delete(first, namespace: nil)
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [second])
        }
    }

    func testBoundedInboxRejectsNinthWithoutOverwriting() throws {
        try fixture { inbox, original, _ in
            for _ in 0..<ShareIntakeInbox.maximumEntries { _ = try inbox.receive(fileAt: original, now: now) }
            XCTAssertThrowsError(try inbox.receive(fileAt: original, now: now)) { XCTAssertEqual($0 as? ShareIntakeError, .full) }
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now).count, ShareIntakeInbox.maximumEntries)
        }
    }

    func testModifiedPayloadAndIdentityCannotRead() throws {
        try fixture { inbox, original, _ in
            let pending = try inbox.receive(fileAt: original, now: now)
            let owned = try inbox.claim(pending, namespace: accountA, userConfirmed: true, now: now)
            let url = try inbox.sourceURL(owned, namespace: accountA, now: now)
            let bytes = try Data(contentsOf: url)
            try bytes.write(to: url, options: .atomic)
            XCTAssertThrowsError(try inbox.read(owned, namespace: accountA, now: now)) { XCTAssertEqual($0 as? ShareIntakeError, .integrity) }
            try inbox.eraseAll()
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [])
        }
    }

    func testSourceAndNamespaceSymlinksCannotEscapeContainer() throws {
        try fixture { inbox, original, container in
            let link = original.deletingLastPathComponent().appendingPathComponent("linked.pdf")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: original)
            XCTAssertThrowsError(try inbox.receive(fileAt: link, now: now))
            let pending = try inbox.receive(fileAt: original, now: now)
            let owned = try inbox.claim(pending, namespace: accountA, userConfirmed: true, now: now)
            let ownerDirectory = container.appendingPathComponent("ShareIntake-v1/" + accountA)
            let moved = container.appendingPathComponent("moved-namespace")
            try FileManager.default.moveItem(at: ownerDirectory, to: moved)
            try FileManager.default.createSymbolicLink(at: ownerDirectory, withDestinationURL: moved)
            XCTAssertThrowsError(try inbox.read(owned, namespace: accountA, now: now))
            try inbox.eraseAll()
            XCTAssertTrue(FileManager.default.fileExists(atPath: moved.path))
        }
    }

    func testInitialLoginPreservesExactlyOneValidAnonymousEntry() throws {
        try fixture { inbox, original, _ in
            let owned = try inbox.claim(inbox.receive(fileAt: original, now: now), namespace: accountA, userConfirmed: true, now: now)
            let selected = try inbox.receive(fileAt: original, now: now)
            _ = try inbox.receive(fileAt: original, now: now)
            XCTAssertEqual(try inbox.unclaimedReceipt(id: selected.id, now: now), selected)
            try inbox.eraseAll(preservingUnclaimedID: selected.id, now: now)
            XCTAssertEqual(try inbox.available(namespace: accountB, now: now), [selected])
            XCTAssertThrowsError(try inbox.read(owned, namespace: accountA, now: now))
            let claimed = try inbox.claim(selected, namespace: accountB, userConfirmed: true, now: now)
            XCTAssertEqual(claimed.expiresAt, selected.expiresAt)
            try inbox.eraseAll()
            XCTAssertEqual(try inbox.available(namespace: accountB, now: now), [])
        }
    }

    func testSignedOutListingShowsOnlyLiveAnonymousMetadata() throws {
        try fixture { inbox, original, _ in
            _ = try inbox.claim(inbox.receive(fileAt: original, now: now), namespace: accountA, userConfirmed: true, now: now)
            XCTAssertEqual(try inbox.unclaimed(now: now), [])
            let anonymous = try inbox.receive(fileAt: original, now: now.addingTimeInterval(10))
            XCTAssertEqual(try inbox.unclaimed(now: now.addingTimeInterval(10)), [anonymous])
            XCTAssertThrowsError(try inbox.read(anonymous, namespace: accountA, now: now.addingTimeInterval(10)))
            XCTAssertEqual(try inbox.unclaimed(now: anonymous.expiresAt), [])
            XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
        }
    }

    func testInitialLoginCannotPreserveOwnedExpiredForgedOrChangedEntry() throws {
        try fixture { inbox, original, _ in
            let pending = try inbox.receive(fileAt: original, now: now)
            XCTAssertThrowsError(try inbox.eraseAll(preservingUnclaimedID: pending.id, now: pending.expiresAt))
            XCTAssertThrowsError(try inbox.eraseAll(preservingUnclaimedID: UUID(), now: now))
            let owned = try inbox.claim(pending, namespace: accountA, userConfirmed: true, now: now)
            XCTAssertThrowsError(try inbox.eraseAll(preservingUnclaimedID: owned.id, now: now))
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [owned])
        }
    }

    func testInitialLoginRejectsChangedAnonymousCopy() throws {
        try fixture { inbox, original, container in
            let pending = try inbox.receive(fileAt: original, now: now)
            let privateURL = container.appendingPathComponent("ShareIntake-v1/unclaimed/" + pending.id.uuidString + "/source.pdf")
            try Data("changed private copy".utf8).write(to: privateURL)
            XCTAssertThrowsError(try inbox.unclaimed(now: now))
            XCTAssertThrowsError(try inbox.unclaimedReceipt(id: pending.id, now: now))
            XCTAssertThrowsError(try inbox.eraseAll(preservingUnclaimedID: pending.id, now: now))
            XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
            try inbox.eraseAll()
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [])
        }
    }

    func testConcurrentProducersCommitDistinctCompleteEntriesUnderOneLock() throws {
        try fixture { inbox, original, _ in
            let results = ShareIntakeTestResults<ShareIntakeInbox.Receipt>()
            let instant = now
            DispatchQueue.concurrentPerform(iterations: ShareIntakeInbox.maximumEntries) { _ in
                results.append(Result { try inbox.receive(fileAt: original, now: instant) })
            }
            let receipts = try results.values().map { try $0.get() }
            XCTAssertEqual(Set(receipts.map(\.id)).count, ShareIntakeInbox.maximumEntries)
            let actual = try inbox.available(namespace: accountA, now: now)
            XCTAssertEqual(Set(actual.map(\.id)), Set(receipts.map(\.id)))
            for receipt in actual { XCTAssertEqual(try inbox.unclaimedReceipt(id: receipt.id, now: now), receipt) }
        }
    }

    func testKilledProducerStagingNeverAppearsAndPurgeRemovesIt() throws {
        try fixture { inbox, _, container in
            _ = try inbox.available(namespace: accountA, now: now)
            let stage = container.appendingPathComponent("ShareIntake-v1/.stage-" + UUID().uuidString)
            try FileManager.default.createDirectory(at: stage, withIntermediateDirectories: true)
            try Data("unfinished".utf8).write(to: stage.appendingPathComponent("source.pdf"))
            XCTAssertEqual(try inbox.available(namespace: accountA, now: now), [])
            XCTAssertFalse(FileManager.default.fileExists(atPath: stage.path))
        }
    }

    func testConfigurationMissingAndInvalidNamespaceFailClosed() throws {
        XCTAssertThrowsError(try ShareIntakeInbox.configured()) { XCTAssertEqual($0 as? ShareIntakeError, .unavailable) }
        try fixture { inbox, original, _ in
            let pending = try inbox.receive(fileAt: original, now: now)
            for namespace in ["", "../escape", String(repeating: "A", count: 64)] {
                XCTAssertThrowsError(try inbox.available(namespace: namespace, now: now))
                XCTAssertThrowsError(try inbox.claim(pending, namespace: namespace, userConfirmed: true, now: now))
            }
        }
    }
}

nonisolated final class ShareIntakeTestResults<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [Result<Value, Error>] = []
    func append(_ result: Result<Value, Error>) { lock.lock(); defer { lock.unlock() }; stored.append(result) }
    func values() -> [Result<Value, Error>] { lock.lock(); defer { lock.unlock() }; return stored }
}
