import CoreGraphics
import Foundation
import UIKit
import XCTest
@testable import VisePanda

/// Actual ordinary Auth/HTTP/RPC proof, only under the paired disposable stack.
/// This does not automate the system Files picker or prove a target deployment.
nonisolated final class NativePDFIntegrationTests: XCTestCase {
    @MainActor func testPDFKitCorrectPreviewOriginalConfirmReloadAndReceipt() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_PDF_TEST"] == "1" else { throw XCTSkip("UNRUN: explicit owned PDF integration fixture required") }
        let api = try XCTUnwrap(env["VP_NATIVE_PDF_API_ORIGIN"])
        let url = try XCTUnwrap(URL(string: api))
        XCTAssertEqual(url.scheme, "http"); XCTAssertEqual(url.host, "127.0.0.1")
        let email = try XCTUnwrap(env["VP_NATIVE_PDF_EMAIL"])
        let password = try XCTUnwrap(env["VP_NATIVE_PDF_PASSWORD"])
        let tripID = try XCTUnwrap(env["VP_NATIVE_PDF_TRIP_ID"])
        let suite = "vpj55.actual.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", api], defaults: defaults)
        await session.login(email: email, password: password)
        XCTAssertEqual(session.status, "active", session.failureCode ?? "No login failure detail")
        let actor = try XCTUnwrap(session.dataScope)
        let store = NativeTripStore(); store.reset(for: actor)
        await store.select(tripID, using: session)
        let original = try XCTUnwrap(store.detail, store.notice ?? "No original Trip")
        let originalItems = original.content.days.flatMap(\.items)
        XCTAssertFalse(originalItems.isEmpty, "Fixture retains real original fixed Trip items")

        let bytes = textPDF()
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pdf")
        try bytes.write(to: file, options: [.atomic, .completeFileProtection])
        defer { try? FileManager.default.removeItem(at: file) }
        let model = NativePDFIntakeStore(source: .init(actor: actor, detail: original))
        model.start(using: session)
        XCTAssertNil(model.journal)
        await model.load(file, using: session)
        let document = try XCTUnwrap(model.document, model.message ?? "No readable PDF")
        XCTAssertEqual(document.pages.count, 2)
        let dateLine = try XCTUnwrap(document.pages[0].lines.first { $0.text.contains("2026-10-06") })
        let amountLine = try XCTUnwrap(document.pages[1].lines.first { $0.text.contains("CNY 128") })
        model.keep(kind: "date", value: "2026-10-06", line: dateLine)
        model.keep(kind: "amount", value: "CNY 128 user checked", line: amountLine)
        await model.review(using: session)
        let preview = try XCTUnwrap(model.preview, model.message ?? "No actual preview")
        XCTAssertEqual(preview.relation, "new")
        XCTAssertEqual(preview.orderVerification, "unavailable")
        XCTAssertEqual(preview.fields.first(where: { $0.kind == "amount" })?.locator.page, 2)
        XCTAssertNotNil(preview.patch)
        let adopted = await model.propose(using: session, tripStore: store)
        XCTAssertTrue(adopted, model.message ?? "No original proposal adoption")
        let pending = try XCTUnwrap(store.pending, store.notice ?? "No original Proposal diff")
        XCTAssertEqual(pending.proposal.patch, preview.patch)
        XCTAssertEqual(store.detail?.trip.headVersion, original.trip.headVersion, "Creating a proposal must not apply content")
        XCTAssertNotNil(try session.pdfIntakeRecovery(actor: actor), "Known pending still retains original operation for applied receipt read")
        let reference = try XCTUnwrap(store.confirmationReference)
        await store.confirm(reviewedReference: reference, using: session)
        let confirmed = try XCTUnwrap(store.detail, store.notice ?? "No confirmed Trip")
        XCTAssertEqual(confirmed.trip.headVersion, original.trip.headVersion + 1)
        XCTAssertEqual(confirmed.trip.id, tripID)
        for day in original.content.days {
            let retained = try XCTUnwrap(confirmed.content.days.first { $0.id == day.id })
            XCTAssertEqual(retained.date, day.date); XCTAssertEqual(retained.timeZone, day.timeZone)
            let ids = Set(day.items.map(\.id))
            let kept = retained.items.filter { ids.contains($0.id) }
            XCTAssertEqual(kept.map(\.id), day.items.map(\.id), "Preserve every original item and its relative order")
            for (actual, before) in zip(kept, day.items) {
                XCTAssertEqual(actual.id, before.id); XCTAssertEqual(actual.dayId, before.dayId)
                XCTAssertEqual(actual.title, before.title); XCTAssertEqual(actual.manualOrder, before.manualOrder)
                // The original writer stores timestamptz and snapshot() serializes UTC; offset spelling is not a time change.
                XCTAssertEqual(try strictInstant(actual.startsAt), try strictInstant(before.startsAt), "Preserve exact fixed start instant and nil presence")
                XCTAssertEqual(try strictInstant(actual.endsAt), try strictInstant(before.endsAt), "Preserve exact fixed end instant and nil presence")
            }
        }
        let reloaded = NativeTripStore(); reloaded.reset(for: actor)
        await reloaded.select(tripID, using: session)
        XCTAssertEqual(reloaded.detail?.content, confirmed.content)

        // Process-like feature reconstruction reads the same durable operation and actual applied event.
        let recovery = NativePDFIntakeStore(source: .init(actor: actor, detail: confirmed))
        recovery.start(using: session)
        let journal = try XCTUnwrap(recovery.journal)
        let raw = try await session.pdfIntakeRequest(tripID: tripID, action: "operation", operationID: journal.command.operationId, actor: actor)
        let operation = try JSONDecoder().decode(NativePDFOperation.self, from: raw)
        XCTAssertTrue(operation.matches(journal, actor: actor))
        XCTAssertEqual(operation.state, "confirmed")
        XCTAssertNotNil(operation.confirmationEventId)
        XCTAssertEqual(operation.resultingVersion, confirmed.trip.headVersion)
        let recovered = await recovery.recover(using: session, tripStore: reloaded)
        XCTAssertTrue(recovered, recovery.message ?? "No actual same-Trip receipt recovery")
        XCTAssertNil(try session.pdfIntakeRecovery(actor: actor))

        let repeated = NativePDFIntakeStore(source: .init(actor: actor, detail: confirmed))
        repeated.start(using: session)
        await repeated.load(file, using: session)
        let same = try XCTUnwrap(repeated.document)
        let sameDate = try XCTUnwrap(same.pages[0].lines.first { $0.text.contains("2026-10-06") })
        let sameAmount = try XCTUnwrap(same.pages[1].lines.first { $0.text.contains("CNY 128") })
        repeated.keep(kind: "date", value: "2026-10-06", line: sameDate)
        repeated.keep(kind: "amount", value: "CNY 128 user checked", line: sameAmount)
        await repeated.review(using: session)
        XCTAssertEqual(repeated.preview?.relation, "duplicate", repeated.message ?? "No duplicate preview")
        XCTAssertNil(repeated.preview?.patch)
        repeated.keep(kind: "amount", value: "CNY 129 corrected alternative", line: sameAmount)
        await repeated.review(using: session)
        XCTAssertEqual(repeated.preview?.relation, "conflict", repeated.message ?? "No conflict preview")
        XCTAssertEqual(repeated.preview?.fields.first(where: { $0.kind == "amount" })?.state, "conflict")
        XCTAssertTrue(repeated.clearCopy())
        XCTAssertEqual(try Data(contentsOf: file), bytes, "Closing/deleting app copies never changes the original selected file")
        await session.logout()
        XCTAssertNil(session.dataScope)
    }
    @MainActor private func strictInstant(_ raw: String?) throws -> Date? {
        guard let raw else { return nil }
        _ = try XCTUnwrap(raw.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$"#, options: .regularExpression), "A complete explicit-offset timestamp is required")
        XCTAssertTrue(NativePDFField.validValue(String(raw.prefix(10)), kind: "date"), "Calendar date must be valid")
        return try XCTUnwrap(NativeScopedTripCommand.date(raw), "The full timestamp must parse; malformed time is not absence")
    }
    @MainActor private func textPDF() -> Data {
        let bytes = NSMutableData(); let consumer = CGDataConsumer(data: bytes)!
        var box = CGRect(x: 0, y: 0, width: 400, height: 600)
        let context = CGContext(consumer: consumer, mediaBox: &box, nil)!
        for text in ["2026-10-06", "CNY 128"] {
            context.beginPDFPage(nil); UIGraphicsPushContext(context)
            (text as NSString).draw(at: CGPoint(x: 20, y: 30), withAttributes: [.font: UIFont.systemFont(ofSize: 16)])
            UIGraphicsPopContext(); context.endPDFPage()
        }
        context.closePDF(); return bytes as Data
    }
}
