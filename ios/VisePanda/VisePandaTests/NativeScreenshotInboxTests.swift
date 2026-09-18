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
