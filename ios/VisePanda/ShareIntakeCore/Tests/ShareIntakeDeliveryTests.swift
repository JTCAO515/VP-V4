import CoreGraphics
import Foundation
import UniformTypeIdentifiers
import XCTest
#if canImport(VisePanda)
@testable import VisePanda
#else
@testable import ShareIntakeCore
#endif

nonisolated final class ShareIntakeDeliveryTests: XCTestCase {
    func testRealItemProviderFileCallbackCommitsPrivateCopyBeforeCompleting() throws {
        try fixture { inbox, original in
            let provider = NSItemProvider()
            provider.registerFileRepresentation(forTypeIdentifier: UTType.pdf.identifier, fileOptions: [], visibility: .all) { completion in
                completion(original, false, nil)
                return nil
            }
            let completed = expectation(description: "provider callback")
            let results = ShareIntakeTestResults<ShareIntakeInbox.Receipt>()
            let delivery = ShareIntakeDelivery(inbox: inbox)
            _ = delivery.start(provider: provider) { result in
                results.append(result.mapError { $0 as Error })
                completed.fulfill()
            }
            wait(for: [completed], timeout: 10)
            let receipt = try XCTUnwrap(results.values().first).get()
            let namespace = String(repeating: "a", count: 64)
            XCTAssertEqual(try inbox.available(namespace: namespace), [receipt])
            XCTAssertEqual(try inbox.unclaimedReceipt(id: receipt.id), receipt)
            XCTAssertNil(receipt.ownerNamespace)
            XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
            try delivery.cancel()
            XCTAssertEqual(try inbox.available(namespace: namespace), [])
            XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
        }
    }

    func testCancelledRealProviderCannotPublishAfterCancellation() throws {
        try fixture { inbox, original in
            let provider = NSItemProvider()
            provider.registerFileRepresentation(forTypeIdentifier: UTType.pdf.identifier, fileOptions: [], visibility: .all) { completion in
                completion(original, false, nil)
                return nil
            }
            let completed = expectation(description: "cancelled provider")
            let results = ShareIntakeTestResults<ShareIntakeInbox.Receipt>()
            let delivery = ShareIntakeDelivery(inbox: inbox)
            try delivery.cancel()
            _ = delivery.start(provider: provider) { result in
                results.append(result.mapError { $0 as Error })
                completed.fulfill()
            }
            wait(for: [completed], timeout: 10)
            XCTAssertThrowsError(try XCTUnwrap(results.values().first).get()) { XCTAssertEqual($0 as? ShareIntakeError, .cancelled) }
            XCTAssertEqual(try inbox.available(namespace: String(repeating: "a", count: 64)), [])
            XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
        }
    }

    func testRealProviderFailureDoesNotPublishOrExposeProviderError() throws {
        try fixture { inbox, _ in
            let provider = NSItemProvider()
            provider.registerFileRepresentation(forTypeIdentifier: UTType.pdf.identifier, fileOptions: [], visibility: .all) { completion in
                completion(nil, false, NSError(domain: "SyntheticProviderFailure", code: 7))
                return nil
            }
            let completed = expectation(description: "provider failure")
            let results = ShareIntakeTestResults<ShareIntakeInbox.Receipt>()
            _ = ShareIntakeDelivery(inbox: inbox).start(provider: provider) { result in
                results.append(result.mapError { $0 as Error })
                completed.fulfill()
            }
            wait(for: [completed], timeout: 10)
            XCTAssertThrowsError(try XCTUnwrap(results.values().first).get()) { XCTAssertEqual($0 as? ShareIntakeError, .unavailable) }
            XCTAssertEqual(try inbox.available(namespace: String(repeating: "a", count: 64)), [])
        }
    }

    private func fixture(_ run: (ShareIntakeInbox, URL) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let container = root.appendingPathComponent("owned-container", isDirectory: true)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let original = root.appendingPathComponent("original.pdf")
        let data = NSMutableData()
        let consumer = try XCTUnwrap(CGDataConsumer(data: data))
        var media = CGRect(x: 0, y: 0, width: 100, height: 100)
        let context = try XCTUnwrap(CGContext(consumer: consumer, mediaBox: &media, nil))
        context.beginPDFPage(nil)
        context.fill(CGRect(x: 1, y: 1, width: 5, height: 5))
        context.endPDFPage(); context.closePDF()
        try (data as Data).write(to: original)
        try run(ShareIntakeInbox(container: container), original)
    }
}
