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

    @MainActor
    func testExpiredCredentialRefreshKeepsLogoutFencedThroughDelayedFailure() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = NativeScreenshotInbox(root: root.appendingPathComponent("inbox"))
        let materials = NativeDeviceMaterials(inbox: inbox, exportRoot: root.appendingPathComponent("export"))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MaterialLogoutProtocol.self]
        let suite = "vpj36.material-logout." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        MaterialLogoutProtocol.reset()
        let vault = MaterialLogoutVault()
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:63221"], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault, deviceMaterials: materials)
        await session.login(email: "synthetic", password: "synthetic")
        let scope = try XCTUnwrap(session.dataScope)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }.pngData()!
        _ = try session.receiveDeviceScreenshot(image, owner: scope.subject)
        let logout = Task { await session.logout() }
        for _ in 0..<200 {
            if MaterialLogoutProtocol.logoutPending { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertTrue(MaterialLogoutProtocol.logoutPending)
        XCTAssertEqual(MaterialLogoutProtocol.refreshes, 1, "Expired credential exercised accept(refresh)")
        XCTAssertNil(session.dataScope)
        XCTAssertFalse(session.prepareDeviceMaterials())
        XCTAssertThrowsError(try session.receiveDeviceScreenshot(image, owner: scope.subject))
        XCTAssertTrue(try inbox.receipts(owner: scope.subject).isEmpty)
        MaterialLogoutProtocol.failLogout()
        await logout.value
        XCTAssertNil(session.dataScope)
        XCTAssertFalse(session.prepareDeviceMaterials())
        XCTAssertThrowsError(try session.receiveDeviceScreenshot(image, owner: scope.subject))
        XCTAssertTrue(try inbox.receipts(owner: scope.subject).isEmpty)
        let restartConfiguration = URLSessionConfiguration.ephemeral
        restartConfiguration.protocolClasses = [MaterialLogoutProtocol.self]
        let restarted = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:63221"], defaults: defaults, configuration: restartConfiguration, bundleConfiguration: [:], vault: vault, deviceMaterials: materials)
        await restarted.restore()
        XCTAssertEqual(MaterialLogoutProtocol.refreshes, 1, "Persistent logout intent prevents automatic credential validation")
        XCTAssertNil(restarted.dataScope)
        XCTAssertFalse(restarted.prepareDeviceMaterials())
        XCTAssertThrowsError(try restarted.receiveDeviceScreenshot(image, owner: scope.subject))
        await restarted.login(email: "synthetic", password: "synthetic")
        let signedIn = try XCTUnwrap(restarted.dataScope)
        XCTAssertEqual(signedIn.subject, scope.subject)
        XCTAssertTrue(restarted.prepareDeviceMaterials())
        _ = try restarted.receiveDeviceScreenshot(image, owner: signedIn.subject)
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

@MainActor private final class MaterialLogoutVault: NativeCredentialVault {
    private var records: [String: Data] = [:]
    func write(_ data: Data, service: String, owner: String) -> OSStatus { records[service+owner]=data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) { let data=records[service+owner]; return (data == nil ? errSecItemNotFound : errSecSuccess, data) }
    func remove(service: String, owner: String) -> OSStatus { records.removeValue(forKey: service+owner); return errSecSuccess }
}
nonisolated private final class MaterialLogoutProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var pending: MaterialLogoutProtocol?
    nonisolated(unsafe) private static var refreshCount = 0
    static let owner = "11111111-2222-3333-4444-555555555555"
    static var logoutPending: Bool { lock.withLock { pending != nil } }
    static var refreshes: Int { lock.withLock { refreshCount } }
    static func reset() { lock.withLock { pending=nil; refreshCount=0 } }
    static func failLogout() { let value = lock.withLock { let value=pending; pending=nil; return value }; value?.reply(status: 503, body: [:]) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.lastPathComponent
        if path == "logout" { Self.lock.withLock { Self.pending=self }; return }
        if path == "credentials" || path == "refresh" {
            if path == "refresh" { Self.lock.withLock { Self.refreshCount += 1 } }
            reply(status: 200, body: ["subject":Self.owner,"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresAt":Date().timeIntervalSince1970-60,"mobileEpoch":1])
        } else if path == "login" { reply(status: 200, body: ["subject":Self.owner,"mobileEpoch":1]) }
        else if path == "profile" { reply(status: 200, body: ["subject":Self.owner,"displayName":"Fixture"]) }
        else { reply(status: 404, body: [:]) }
    }
    private func reply(status: Int, body: [String: Any]) {
        guard let url=request.url, let response=HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type":"application/json"]), let data=try? JSONSerialization.data(withJSONObject: body) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
