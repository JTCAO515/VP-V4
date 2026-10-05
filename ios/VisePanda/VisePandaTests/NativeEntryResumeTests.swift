import XCTest
import CoreGraphics
import CoreText
@testable import VisePanda

nonisolated final class NativeEntryResumeTests: XCTestCase {
    @MainActor func testOpaqueLinksAndConfiguredDomainsOnly() {
        let id = UUID().uuidString.lowercased()
        guard case .entry = NativeEntryResumeLink.parse(URL(string: "visepanda://resume/\(id)")!, associatedHosts: []) else { return XCTFail("valid pointer") }
        for link in ["visepanda://resume/\(id)?owner=x", "visepanda://resume/\(id)#data", "visepanda://u@resume/\(id)", "visepanda://resume/\(id)/", "https://unconfigured.example/resume/\(id)"] {
            XCTAssertEqual(NativeEntryResumeLink.parse(URL(string: link)!, associatedHosts: []), .unavailable)
        }
        XCTAssertEqual(NativeEntryResumeLink.parse(URL(string: "visepanda://trip")!, associatedHosts: []), .unrelated)
        XCTAssertEqual(NativeEntryResumeLink.configuredHosts("good.example,*.bad.example,host/path,user@host"), ["good.example"])
    }
    @MainActor func testLoginCannotRetargetBoundMaterialOrExtendTTL() {
        let now = Date(timeIntervalSince1970: 1_000)
        let a = NativeEntryResumeState.Identity(endpoint: "http://localhost", owner: "A", epoch: 1, generation: 1)
        let b = NativeEntryResumeState.Identity(endpoint: "http://localhost", owner: "B", epoch: 1, generation: 1)
        let id = UUID()
        var state = NativeEntryResumeState()
        state.receive(id, identity: nil, now: now)
        state.authenticate(a, now: now)
        XCTAssertTrue(state.bind(a, entryExpiry: now.addingTimeInterval(30), now: now))
        XCTAssertEqual(state.current(a, now: now)?.entryID, id)
        XCTAssertTrue(state.bind(a, entryExpiry: now.addingTimeInterval(100), now: now))
        XCTAssertEqual(state.intent?.expiresAt, now.addingTimeInterval(30))
        state.authenticate(b, now: now)
        XCTAssertNil(state.intent)
        XCTAssertEqual(state.failure, .accountChanged)
    }
    @MainActor func testExpiryAndCleanupFencePreventReplay() {
        let now = Date(timeIntervalSince1970: 1_000)
        let a = NativeEntryResumeState.Identity(endpoint: "http://localhost", owner: "A", epoch: 1, generation: 1)
        var state = NativeEntryResumeState()
        state.receive(UUID(), identity: a, now: now)
        state.authenticate(a, now: now.addingTimeInterval(901))
        XCTAssertEqual(state.failure, .expired)
        state.clear(cleanupSucceeded: false)
        state.receive(UUID(), identity: a, now: now)
        XCTAssertNil(state.intent)
        XCTAssertEqual(state.failure, .cleanupRequired)
        state.unavailable()
        state.receive(UUID(), identity: a, now: now)
        XCTAssertNil(state.intent)
        XCTAssertEqual(state.failure, .cleanupRequired, "A malformed new link cannot clear the storage fence")
    }
}

nonisolated final class NativeEntryResumeInboxTests: XCTestCase {
    @MainActor private func fixture() throws -> (ShareIntakeInbox, URL, URL) {
        let container = FileManager.default.temporaryDirectory.appendingPathComponent("F2-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        let url = container.appendingPathComponent("original.pdf")
        let bytes = NSMutableData()
        var box = CGRect(x: 0, y: 0, width: 200, height: 200)
        let consumer = try XCTUnwrap(CGDataConsumer(data: bytes))
        let context = try XCTUnwrap(CGContext(consumer: consumer, mediaBox: &box, nil))
        context.beginPDFPage(nil)
        context.textPosition = CGPoint(x: 20, y: 20)
        let font = CTFontCreateWithName("Helvetica" as CFString, 12, nil)
        let text = NSAttributedString(string: "2026-10-05", attributes: [NSAttributedString.Key(rawValue: kCTFontAttributeName as String): font])
        CTLineDraw(CTLineCreateWithAttributedString(text), context)
        context.endPDFPage(); context.closePDF()
        try (bytes as Data).write(to: url)
        return (try ShareIntakeInbox(container: container), container, url)
    }
    @MainActor func testInitialLoginPreservesOnlyVerifiedOriginalAndClaimKeepsTTL() async throws {
        let (inbox, container, file) = try fixture()
        defer { try? FileManager.default.removeItem(at: container) }
        let original = try inbox.receive(fileAt: file)
        _ = try inbox.receive(fileAt: file)
        let coordinator = NativeEntryResumeCoordinator(inbox: inbox, associatedHosts: [])
        XCTAssertTrue(coordinator.receive(try XCTUnwrap(URL(string: "visepanda://resume/" + original.id.uuidString)), scope: nil))
        let preserved = try XCTUnwrap(coordinator.initialLoginPreservation())
        XCTAssertEqual(preserved, original.id)
        try coordinator.erase(preservingUnclaimedID: preserved)
        let a = NativeDataScope(endpoint: "http://localhost", subject: UUID().uuidString, mobileEpoch: 1, generation: 1)
        coordinator.refresh(scope: a)
        XCTAssertEqual(coordinator.receipts, [original])
        let claimed = try coordinator.claim(original, scope: a)
        XCTAssertEqual(claimed.id, original.id)
        XCTAssertEqual(claimed.expiresAt, original.expiresAt)
        XCTAssertEqual(claimed.ownerNamespace, NativePDFWire.namespace(a))
        XCTAssertEqual(try Data(contentsOf: coordinator.sourceURL(claimed, scope: a)), try Data(contentsOf: file))
        let b = NativeDataScope(endpoint: a.endpoint, subject: UUID().uuidString, mobileEpoch: 1, generation: 1)
        coordinator.refresh(scope: b)
        XCTAssertThrowsError(try coordinator.sourceURL(claimed, scope: b))
        XCTAssertTrue(try inbox.available(namespace: NativePDFWire.namespace(a)).isEmpty)
    }
    @MainActor func testForgedAnonymousPointerCannotAuthorizeLoginPreservation() async throws {
        let (inbox, container, _) = try fixture()
        defer { try? FileManager.default.removeItem(at: container) }
        let coordinator = NativeEntryResumeCoordinator(inbox: inbox, associatedHosts: [])
        let link = try XCTUnwrap(URL(string: "visepanda://resume/" + UUID().uuidString))
        XCTAssertTrue(coordinator.receive(link, scope: nil))
        XCTAssertNil(try coordinator.initialLoginPreservation())
        XCTAssertEqual(coordinator.message, "expiredOrUnavailable")
    }
    @MainActor func testSharedExpiryPersistsIntoF1AndNeverRenewsCommand() async throws {
        let (_, container, file) = try fixture()
        defer { try? FileManager.default.removeItem(at: container) }
        let bytes = try Data(contentsOf: file)
        let document = try NativePDFDocument.extract(bytes)
        let now = Date(); let expiry = now.addingTimeInterval(5)
        let root = container.appendingPathComponent("F1")
        let namespace = String(repeating: "a", count: 64)
        let inbox = NativePDFInbox(root: root)
        let receipt = try inbox.receiveValidated(bytes, document: document, namespace: namespace, now: now, expiresNoLaterThan: expiry)
        XCTAssertEqual(receipt.expiresAt, expiry)
        try NativePDFInbox(root: root).validate(receipt, namespace: namespace, now: now.addingTimeInterval(1))
        let metadataURL = root.appendingPathComponent(namespace).appendingPathComponent(receipt.id.uuidString).appendingPathComponent("receipt.json")
        let persisted = try JSONDecoder().decode(NativePDFInbox.Receipt.self, from: Data(contentsOf: metadataURL))
        XCTAssertEqual(persisted.expiresAt, expiry)
        let command = NativePDFCommand(operationId: UUID().uuidString.lowercased(), expectedHeadVersion: 0,
            contentHash: document.digest, byteCount: bytes.count, pageCount: 1, extraction: "pdfkit_text",
            expiresAt: NativePDFWire.instant(persisted.expiresAt), fields: [.init(kind: "date", value: "2026-10-05", locator: .init(page: 1,
                line: try XCTUnwrap(document.pages.first?.lines.first).number,
                sourceTextHash: NativePDFDocument.digest(Data(try XCTUnwrap(document.pages.first?.lines.first).text.utf8))))])
        XCTAssertTrue(command.valid)
        _ = try command.encoded()
        XCTAssertLessThanOrEqual(try XCTUnwrap(NativePDFWire.date(command.expiresAt)), expiry)
        XCTAssertThrowsError(try inbox.receiveValidated(bytes, document: document, namespace: namespace, now: now, expiresNoLaterThan: now))
        XCTAssertThrowsError(try inbox.receiveValidated(bytes, document: document, namespace: namespace, now: now, expiresNoLaterThan: Date(timeIntervalSince1970: .infinity)))
        XCTAssertThrowsError(try inbox.validate(receipt, namespace: namespace, now: expiry))
    }
    @MainActor func testExportRequiresClaimAndCleansIndependentCopiesOnBackground() async throws {
        let (inbox, container, file) = try fixture()
        defer { try? FileManager.default.removeItem(at: container) }
        let original = try inbox.receive(fileAt: file)
        let export = NativeEntryResumeExport(root: container.appendingPathComponent("export"))
        let coordinator = NativeEntryResumeCoordinator(inbox: inbox, associatedHosts: [], exports: export)
        let a = NativeDataScope(endpoint: "http://localhost", subject: UUID().uuidString, mobileEpoch: 1, generation: 1)
        coordinator.openInbox(scope: a)
        XCTAssertThrowsError(try coordinator.prepareExport(original, scope: a))
        let claimed = try coordinator.claim(original, scope: a)
        try coordinator.prepareExport(claimed, scope: a)
        let copy = try XCTUnwrap(export.current(scope: a))
        XCTAssertLessThanOrEqual(copy.expiresAt, original.expiresAt)
        XCTAssertNotEqual(copy.files.first, try inbox.sourceURL(claimed, namespace: NativePDFWire.namespace(a)))
        XCTAssertEqual(try Data(contentsOf: copy.files[0]), try Data(contentsOf: file))
        let manifest = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: copy.files[1])) as? [String: Any])
        XCTAssertEqual(manifest["coverage"] as? String, "local_original_shared_pdf_only")
        XCTAssertNil(manifest["owner"]); XCTAssertNil(manifest["endpoint"])
        let b = NativeDataScope(endpoint: a.endpoint, subject: UUID().uuidString, mobileEpoch: 1, generation: 1)
        XCTAssertThrowsError(try coordinator.prepareExport(claimed, scope: b))
        coordinator.hide()
        XCTAssertNil(export.copy)
        XCTAssertTrue(copy.files.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
        XCTAssertEqual(try Data(contentsOf: file), try inbox.read(claimed, namespace: NativePDFWire.namespace(a)))
    }
    @MainActor func testUnconfiguredBuildShowsFilesFallback() async {
        let coordinator = NativeEntryResumeCoordinator(inbox: nil, associatedHosts: [])
        coordinator.openInbox(scope: nil)
        XCTAssertEqual(coordinator.message, "unconfigured")
        XCTAssertTrue(coordinator.receipts.isEmpty)
    }
}
