import XCTest
import UIKit
@testable import VisePanda

nonisolated final class NativeScreenshotInboxTests: XCTestCase {
    func testOwnerIsolationReplayExpiryAndDeletion() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = NativeScreenshotInbox(root: root, lifetime: 2)
        let owner = UUID().uuidString
        let other = UUID().uuidString
        let image = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
        }.pngData()!
        let now = Date()

        let first = try inbox.receive(image, owner: owner, now: now)
        XCTAssertFalse(first.duplicate)
        let folder = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).first)
        XCTAssertFalse(folder.lastPathComponent.contains(owner.lowercased()))
        XCTAssertEqual(try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        let stored = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).first)
        XCTAssertEqual(try stored.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        XCTAssertEqual(try inbox.read(first.digest, owner: owner, now: now), image)
        XCTAssertThrowsError(try inbox.read(first.digest, owner: other, now: now))
        XCTAssertTrue(try inbox.receive(image, owner: owner, now: now).duplicate)
        XCTAssertThrowsError(try inbox.read(first.digest, owner: owner, now: now.addingTimeInterval(3)))
        try inbox.purge(owner: owner, now: now.addingTimeInterval(3))
        XCTAssertThrowsError(try inbox.read(first.digest, owner: owner, now: now))

        let second = try inbox.receive(image, owner: owner, now: now)
        XCTAssertFalse(second.duplicate)
        try inbox.delete(second.digest, owner: owner)
        XCTAssertThrowsError(try inbox.read(second.digest, owner: owner, now: now))
        let oldOwner = try inbox.receive(image, owner: owner, now: now)
        let newOwner = try inbox.receive(image, owner: other, now: now)
        try inbox.deleteAll()
        XCTAssertThrowsError(try inbox.read(oldOwner.digest, owner: owner, now: now))
        XCTAssertThrowsError(try inbox.read(newOwner.digest, owner: other, now: now))
    }

    func testRejectsTraversalAndUnboundedData() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = NativeScreenshotInbox(root: root)
        XCTAssertThrowsError(try inbox.receive(Data([1]), owner: "../other"))
        XCTAssertThrowsError(try inbox.receive(Data(count: 12_000_001), owner: UUID().uuidString))
        XCTAssertThrowsError(try inbox.delete("../other", owner: UUID().uuidString))
    }

    func testNewImageSupersedesAbandonedReceipt() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = NativeScreenshotInbox(root: root)
        let owner = UUID().uuidString
        let white = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }.pngData()!
        let black = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.black.setFill(); context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }.pngData()!
        let first = try inbox.receive(white, owner: owner)
        let second = try inbox.receive(black, owner: owner)
        XCTAssertNotEqual(first.digest, second.digest)
        XCTAssertThrowsError(try inbox.read(first.digest, owner: owner))
        XCTAssertEqual(try inbox.read(second.digest, owner: owner), black)
    }

    @MainActor
    func testDeviceDeliveryOriginalBytesScopeExpiryAndCrashCleanup() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = NativeScreenshotInbox(root: root.appendingPathComponent("inbox"))
        let exportRoot = root.appendingPathComponent("export")
        let materials = NativeDeviceMaterials(inbox: inbox, exportRoot: exportRoot)
        let scope = NativeDataScope(endpoint: "http://localhost", subject: UUID().uuidString, mobileEpoch: 1, generation: 0)
        try materials.firstAccess()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }.pngData()!
        let receipt = try inbox.receive(image, owner: scope.subject)
        XCTAssertThrowsError(try materials.prepare(digest: receipt.digest, scope: scope, confirmed: false))
        let delivery = try materials.prepare(digest: receipt.digest, scope: scope, confirmed: true)
        XCTAssertEqual(delivery.bytes, image.count)
        XCTAssertEqual(try Data(contentsOf: materials.file(for: delivery, scope: scope)), image)
        XCTAssertEqual(try delivery.url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        XCTAssertThrowsError(try materials.file(for: delivery, scope: scope, now: delivery.expiresAt))
        XCTAssertFalse(FileManager.default.fileExists(atPath: delivery.url.path))
        let newDelivery = try materials.prepare(digest: receipt.digest, scope: scope, confirmed: true)
        let wrongScope = NativeDataScope(endpoint: scope.endpoint, subject: UUID().uuidString, mobileEpoch: 1, generation: 0)
        XCTAssertThrowsError(try materials.file(for: newDelivery, scope: wrongScope))
        _ = try materials.prepare(digest: receipt.digest, scope: scope, confirmed: true)
        let restarted = NativeDeviceMaterials(inbox: inbox, exportRoot: exportRoot)
        try restarted.firstAccess()
        XCTAssertTrue(try restarted.receipts(scope: scope).isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: exportRoot.path))
    }

    @MainActor
    func testSessionLogoutCleansMaterialsWithoutMountedTripAndCleanupFailureDeniesAccess() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = NativeScreenshotInbox(root: root.appendingPathComponent("inbox"))
        let materials = NativeDeviceMaterials(inbox: inbox, exportRoot: root.appendingPathComponent("export"))
        let session = NativeSession(arguments: [], bundleConfiguration: [:], deviceMaterials: materials)
        XCTAssertTrue(session.prepareDeviceMaterials())
        let scope = NativeDataScope(endpoint: "http://localhost", subject: UUID().uuidString, mobileEpoch: 1, generation: 0)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }.pngData()!
        let receipt = try inbox.receive(image, owner: scope.subject)
        let delivery = try materials.prepare(digest: receipt.digest, scope: scope, confirmed: true)
        await session.logout()
        XCTAssertNil(materials.delivery)
        XCTAssertThrowsError(try inbox.read(receipt.digest, owner: scope.subject))
        XCTAssertFalse(FileManager.default.fileExists(atPath: delivery.url.path))
        // Simulate a protected-file cleanup error at the dispatcher seam.
        let failedMaterials = NativeDeviceMaterials(inbox: inbox, exportRoot: root.appendingPathComponent("blocked-export"), eraseInbox: { throw InboxError.invalidInput })
        let failedSession = NativeSession(arguments: [], bundleConfiguration: [:], deviceMaterials: failedMaterials)
        await failedSession.logout()
        XCTAssertEqual(failedSession.status, "storageError")
        XCTAssertEqual(failedSession.failureCode, "deviceMaterialCleanupRequired")
        XCTAssertNil(failedSession.dataScope)
        XCTAssertFalse(failedSession.prepareDeviceMaterials())
        XCTAssertThrowsError(try failedMaterials.receipts(scope: scope))
        XCTAssertThrowsError(try failedMaterials.prepare(digest: receipt.digest, scope: scope, confirmed: true))

    }

    func testPhysicalFileProtectionAttribute() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("UNRUN: simulator does not report the file-protection attribute; validate on an unlocked physical device")
#else
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let owner = UUID().uuidString
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }.pngData()!
        _ = try NativeScreenshotInbox(root: root).receive(image, owner: owner)
        let folder = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).first)
        let stored = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).first)
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath: stored.path)[.protectionKey] as? FileProtectionType, .complete)
#endif
    }
}
