import CoreGraphics
import PDFKit
import Security
import UIKit
import XCTest
@testable import VisePanda

nonisolated final class NativePDFIntakeTests: XCTestCase {
    @MainActor private func pdf(pages: Int = 1, text: Bool = true, encrypted: Bool = false) -> Data {
        let result = NSMutableData()
        let consumer = CGDataConsumer(data: result)!
        var box = CGRect(x: 0, y: 0, width: 400, height: 600)
        let options: [String: Any] = encrypted ? [kCGPDFContextOwnerPassword as String: "owned-test", kCGPDFContextUserPassword as String: "test"] : [:]
        let context = CGContext(consumer: consumer, mediaBox: &box, options as CFDictionary)!
        for number in 1...pages {
            context.beginPDFPage(nil)
            if text {
                UIGraphicsPushContext(context)
                ("2026-10-05\nPage \(number) fare 99" as NSString).draw(at: CGPoint(x: 20, y: 30), withAttributes: [.font: UIFont.systemFont(ofSize: 16)])
                UIGraphicsPopContext()
            }
            context.endPDFPage()
        }
        context.closePDF()
        return result as Data
    }
    @MainActor func testRealPDFTextAndPageLocators() throws {
        let document = try NativePDFDocument.extract(pdf(pages: 2))
        XCTAssertEqual(document.pages.map(\.id), [1, 2])
        XCTAssertTrue(document.pages[0].lines.contains { $0.text.contains("2026-10-05") && $0.page == 1 })
        XCTAssertTrue(document.pages[1].lines.contains { $0.text.contains("Page 2") && $0.page == 2 })
        XCTAssertEqual(document.digest.count, 64)
    }
    @MainActor func testNoSilentPageTruncationOrScannedTextInvention() throws {
        XCTAssertThrowsError(try NativePDFDocument.extract(pdf(pages: 11))) { XCTAssertEqual($0 as? NativePDFError, .pages) }
        let document = try NativePDFDocument.extract(pdf(pages: 2, text: false))
        XCTAssertEqual(document.pages.count, 2)
        XCTAssertTrue(document.pages.allSatisfy { $0.lines.isEmpty })
    }
    @MainActor func testEncryptedInvalidAndOversizedAreRejected() throws {
        XCTAssertThrowsError(try NativePDFDocument.extract(pdf(encrypted: true))) { XCTAssertEqual($0 as? NativePDFError, .encrypted) }
        XCTAssertThrowsError(try NativePDFDocument.extract(Data("%PDF-1.7 not a document".utf8)))
        XCTAssertThrowsError(try NativePDFDocument.extract(Data(repeating: 0, count: 20_000_001))) { XCTAssertEqual($0 as? NativePDFError, .size) }
    }
    @MainActor func testCopyIsOwnerScopedExpiresAndNeverDeletesOriginal() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let original = root.appendingPathComponent("original.pdf")
        let bytes = pdf()
        try bytes.write(to: original)
        let inbox = NativePDFInbox(root: root.appendingPathComponent("owned"), lifetime: 60)
        let now = Date()
        let namespace = String(repeating: "a", count: 64)
        let (receipt, document) = try inbox.receive(NativePDFDocument.readSelectedURL(original), namespace: namespace, now: now)
        XCTAssertEqual(document.digest, NativePDFDocument.digest(bytes))
        try inbox.validate(receipt, namespace: namespace, now: now)
        XCTAssertThrowsError(try inbox.validate(receipt, namespace: String(repeating: "b", count: 64), now: now))
        XCTAssertThrowsError(try inbox.validate(receipt, namespace: namespace, now: now.addingTimeInterval(61)))
        try inbox.purge(now: now.addingTimeInterval(61))
        XCTAssertThrowsError(try inbox.validate(receipt, namespace: namespace, now: now))
        XCTAssertEqual(try Data(contentsOf: original), bytes)
    }
    @MainActor func testCanonicalDigestMatchesTypeScriptForUnicodeAndSlashes() throws {
        let command = NativePDFCommand(operationId: "11111111-1111-4111-8111-111111111111", expectedHeadVersion: 0,
            contentHash: String(repeating: "a", count: 64), byteCount: 1234, pageCount: 2, extraction: "pdfkit_text", expiresAt: "2026-10-06T00:00:00.000Z",
            fields: [.init(kind: "date", value: "2026-10-05", locator: .init(page: 1, line: 2, sourceTextHash: String(repeating: "b", count: 64))),
                     .init(kind: "address", value: "广州/海珠 \"测试\" 🐼", locator: .init(page: 2, line: 3, sourceTextHash: String(repeating: "c", count: 64)))])
        XCTAssertTrue(command.valid)
        // Independently generated with pdfCanonical/Node SHA256, not the Swift encoder under test.
        XCTAssertEqual(command.digest, "83aabfc5f66675aaf72267cb3f42d31087491c4eeec84f77fee824eb588baa93")
        XCTAssertFalse(NativePDFField.validValue(String(repeating: "🐼", count: 49), kind: "status"))
        XCTAssertFalse(NativePDFField.validValue("2026-02-30", kind: "date"))
    }
    @MainActor func testJournalRetainsExactBytesAndRejectsChangedOperationOrActor() throws {
        let actor = NativeDataScope(endpoint: "http://127.0.0.1:59988/", subject: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", mobileEpoch: 1, generation: 0)
        let command = NativePDFCommand(operationId: "11111111-1111-4111-8111-111111111111", expectedHeadVersion: 0,
            contentHash: String(repeating: "a", count: 64), byteCount: 1234, pageCount: 1, extraction: "pdfkit_text", expiresAt: "2026-10-06T00:00:00.000Z",
            fields: [.init(kind: "date", value: "2026-10-05", locator: .init(page: 1, line: 2, sourceTextHash: String(repeating: "b", count: 64)))])
        let object = try JSONSerialization.jsonObject(with: command.encoded())
        let digest = String(repeating: "d", count: 64)
        let bytes = try JSONSerialization.data(withJSONObject: ["command": object, "reviewedPreviewDigest": digest], options: [.prettyPrinted])
        let journal = NativePDFJournal(endpoint: actor.endpoint, owner: actor.subject, epoch: actor.mobileEpoch,
            tripID: "22222222-2222-4222-8222-222222222222", command: command, previewDigest: digest, bytes: bytes)
        let memory = PDFTestVault(); let vault = NativePDFJournalVault(vault: memory)
        try vault.remember(journal, actor: actor)
        XCTAssertEqual(try vault.read(actor)?.bytes, bytes, "Original whitespace/bytes are part of idempotency; never reencode a retry")
        XCTAssertNotEqual(journal.requestDigest, command.digest)
        let replacement = NativeDataScope(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: 2, generation: 1)
        XCTAssertThrowsError(try vault.read(replacement))
        let changed = NativePDFJournal(endpoint: actor.endpoint, owner: actor.subject, epoch: actor.mobileEpoch, tripID: journal.tripID,
            command: command, previewDigest: String(repeating: "e", count: 64), bytes: bytes)
        XCTAssertThrowsError(try vault.remember(changed, actor: actor))
        try vault.complete(journal, actor: actor)
        XCTAssertNil(try vault.read(actor))
    }
    @MainActor func testActiveActionDictionaryIsRejected() throws {
        // A valid, text-free PDF with an actual parsed catalog action (not a string heuristic).
        var data = Data("%PDF-1.4\n".utf8)
        var offsets = [0]
        let objects = ["<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] >>"]
        for (index, object) in objects.enumerated() {
            offsets.append(data.count)
            data.append(Data("\(index + 1) 0 obj\n\(object)\nendobj\n".utf8))
        }
        let xref = data.count
        data.append(Data("xref\n0 4\n0000000000 65535 f \n".utf8))
        for offset in offsets.dropFirst() { data.append(Data(String(format: "%010d 00000 n \n", offset).utf8)) }
        data.append(Data("trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n\(xref)\n%%EOF\n".utf8))
        XCTAssertNotNil(PDFDocument(data: data))
        XCTAssertThrowsError(try NativePDFDocument.extract(data)) { XCTAssertEqual($0 as? NativePDFError, .activeContent) }
    }
}

@MainActor private final class PDFTestVault: NativeCredentialVault {
    var entries: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        let value = entries[service + "|" + owner]; return (value == nil ? errSecItemNotFound : errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { entries[service + "|" + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { entries.removeValue(forKey: service + "|" + owner); return errSecSuccess }
}
