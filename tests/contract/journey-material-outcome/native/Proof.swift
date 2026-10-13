import Foundation

@main struct Proof {
    @MainActor static func main() throws {
        typealias D = NativeJourneyMaterialOutcome
        let id = "12345678-1234-4234-8234-123456789abc"
        let other = "22345678-1234-4234-8234-123456789abc"
        let hash = String(repeating: "a", count: 64)
        let actor = NativeDataScope(endpoint: "https://fixture.invalid", subject: id, mobileEpoch: 1, generation: 1)
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let expiry = NativePDFWire.instant(now.addingTimeInterval(900))
        func context(_ version: Int = 4, _ scope: NativeDataScope? = nil, active: Bool = true, readable: Bool = true) -> D.Context {
            .init(actor: scope ?? actor, tripID: id, tripVersion: version, active: active, readable: readable, editable: true)
        }
        func decode<T: Decodable>(_ type: T.Type, _ object: [String: Any]) throws -> T {
            try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]))
        }
        let command = NativePDFCommand(operationId: id, expectedHeadVersion: 4, contentHash: hash,
            byteCount: 100, pageCount: 1, extraction: "pdfkit_text", expiresAt: expiry,
            fields: [.init(kind: "date", value: "2026-10-14", locator: .init(page: 1, line: 1, sourceTextHash: hash))])
        let bytes = try JSONSerialization.data(withJSONObject: ["command": JSONSerialization.jsonObject(with: command.encoded()), "reviewedPreviewDigest": hash], options: [.sortedKeys, .withoutEscapingSlashes])
        let journal = NativePDFJournal(endpoint: actor.endpoint, owner: actor.subject, epoch: actor.mobileEpoch, tripID: id, command: command, previewDigest: hash, bytes: bytes)
        let summary: [String: Any] = ["id": id, "title": "Synthetic", "headVersion": 4, "updatedAt": expiry]
        let proposal: [String: Any] = ["id": other, "revision": 1, "baseTripVersion": 4, "status": "pending", "createdAt": expiry,
            "expiresAt": expiry, "titleDiff": ["before": "Synthetic", "after": "Synthetic"], "dayDiffs": [],
            "patch": ["expectedVersion": 4, "operations": []], "digest": hash, "stale": false, "evidence": "", "assumptions": ""]
        let pending = try decode(NativeTripPending.self, ["version": 2, "trip": summary, "proposal": proposal])
        let operation: [String: Any] = ["kind": "pdf_intake_operation/1", "operationId": id, "tripId": id, "sessionEpoch": 1,
            "state": "confirmed", "requestDigest": journal.requestDigest, "commandDigest": command.digest!, "previewDigest": hash,
            "expiresAt": expiry, "proposalId": other, "proposalRevision": 1, "baseTripVersion": 4, "confirmationEventId": id, "resultingVersion": 5]
        func detail(_ version: Int = 5, trip: String? = nil, state: String = "confirmed") throws -> NativeTripDetail {
            var current = summary; current["headVersion"] = version; current["id"] = trip ?? id
            return try decode(NativeTripDetail.self, ["version": 2, "trip": current, "content": ["days": []],
                "hardLocks": "not_enabled", "externalOrderStatus": "not_connected", "confirmationState": state])
        }
        let receipt = try decode(NativeTripConfirmed.self, ["version": 2, "outcome": "applied", "resultingVersion": 5])
        var count = 0
        func check(_ condition: Bool, _ label: String) {
            precondition(condition, label); count += 1
        }
        func prepared() -> (NativeJourneyMaterialOutcomeStore, D.Selection) {
            let store = NativeJourneyMaterialOutcomeStore(uptime: { 10 }, now: { now })
            let selected = store.select(context: context(), medium: .pdf)!
            precondition(store.bindPDF(journal, selection: selected, context: context()))
            precondition(store.proposalReady(pending, selection: selected, context: context()))
            precondition(store.confirmStarted(pending: pending, key: UUID().uuidString, selection: selected, context: context()))
            return (store, selected)
        }
        let (store, selection) = prepared()
        check(store.retryJournal(selection: selection, context: context()) == journal, "same selection exact bytes")
        let applied = store.completePDF(operation: try decode(NativePDFOperation.self, operation), receipt: receipt,
            readback: try detail(), selectedID: id, selection: selection, context: context(5))
        guard case .confirmedReadback(let confirmed) = applied else { preconditionFailure("original positive chain") }
        check(confirmed.source.confirmationEventID == id && confirmed.selection.logicalID == selection.logicalID, "original event, immutable logical ID")
        check(store.presented(confirmed, context: context(5)) != nil, "actual render opportunity")
        check(store.presented(confirmed, context: context(5)) == nil, "no duplicate presentation")
        check(NativeJourneyMaterialOutcomeConsumer().measurementQualification(for: applied) == .protectedSourceUnavailable, "missing protected port deny")
        store.invalidate(context: context(6)); check(store.confirmed == nil && store.selection == nil, "later head invalidates")
        for (field, bad) in [("operationId", other as Any), ("requestDigest", hash), ("commandDigest", hash), ("previewDigest", String(repeating: "b", count: 64)), ("proposalId", id), ("proposalRevision", 2), ("sessionEpoch", 2), ("tripId", other), ("confirmationEventId", "unknown"), ("state", "pending")] {
            let (s, v) = prepared(); var badOperation = operation; badOperation[field] = bad
            let result = s.completePDF(operation: try decode(NativePDFOperation.self, badOperation), receipt: receipt, readback: try detail(), selectedID: id, selection: v, context: context(5))
            check(result == .continuation(.originalProofUnavailable), "foreign/binding/unknown ACK: \(field)")
        }
        for readback in [try detail(6), try detail(trip: other), try detail(state: "pending")] {
            let (s,v) = prepared()
            check(s.completePDF(operation: try decode(NativePDFOperation.self, operation), receipt: receipt, readback: readback, selectedID: id, selection: v, context: context(5)) == .continuation(.stale), "exact readback only")
        }
        let (recovered, recoverySelection) = prepared()
        check({ if case .confirmedReadback = recovered.completePDF(operation: try! decode(NativePDFOperation.self, operation), receipt: nil, readback: try! detail(), selectedID: id, selection: recoverySelection, context: context(5)) { return true }; return false }(), "original operation recovery")
        let (retry, retrySelection) = prepared()
        retry.failed(selection: retrySelection, context: context())
        check(retry.phase == .confirmationUnknown && retry.retryJournal(selection: retrySelection, context: context())?.bytes == bytes, "unknown ACK retains original bytes")
        var alias = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]; alias["alias"] = true
        let badJournal = NativePDFJournal(endpoint: actor.endpoint, owner: id, epoch: 1, tripID: id, command: command, previewDigest: hash, bytes: try JSONSerialization.data(withJSONObject: alias))
        check(!retry.bindPDF(badJournal, selection: retrySelection, context: context()), "alias retry refused")
        for exit in [D.Exit.cancelled, .skipped, .rejected] {
            let (s,v) = prepared(); s.exit(exit)
            check(s.selection == nil && s.retryJournal(selection: v, context: context()) == nil, "cancel/skip/refuse cleared")
        }
        for c in [context(active: false), context(readable: false), context(4, NativeDataScope(endpoint: actor.endpoint, subject: other, mobileEpoch: 1, generation: 1)), context(4, NativeDataScope(endpoint: actor.endpoint, subject: id, mobileEpoch: 2, generation: 1)), context(4, NativeDataScope(endpoint: actor.endpoint, subject: id, mobileEpoch: 1, generation: 2))] {
            let (s,v) = prepared(); check(s.retryJournal(selection: v, context: c) == nil && s.selection == nil, "active/permission/actor/epoch/generation clear")
        }
        let screenshot = NativeJourneyMaterialOutcomeStore(uptime: { 10 }, now: { now })
        let shot = screenshot.select(context: context(), medium: .screenshot)!
        check(screenshot.completePDF(operation: try decode(NativePDFOperation.self, operation), receipt: receipt, readback: try detail(), selectedID: id, selection: shot, context: context(5)) == .continuation(.screenshotLineageUnavailable), "screenshot always unobservable")
        let parse = NativeJourneyMaterialOutcomeStore(uptime: { 10 }, now: { now }); let parseSelection = parse.select(context: context(), medium: .pdf)!
        check(parse.completePDF(operation: try decode(NativePDFOperation.self, operation), receipt: receipt, readback: try detail(), selectedID: id, selection: parseSelection, context: context(5)) == .continuation(.originalProofUnavailable), "parse-only no qualification")
        let newer = retry.select(context: context(), medium: .pdf)!
        check(newer.logicalID != retrySelection.logicalID && retry.retryJournal(selection: retrySelection, context: context()) == nil && retry.selection == newer, "explicit selection rotates; late callback preserves new")
        let (wrongReceipt, wr) = prepared()
        let unknownReceipt = try decode(NativeTripConfirmed.self, ["version": 2, "outcome": "unknown", "resultingVersion": 5])
        check(wrongReceipt.completePDF(operation: try decode(NativePDFOperation.self, operation), receipt: unknownReceipt, readback: try detail(), selectedID: id, selection: wr, context: context(5)) == .continuation(.originalProofUnavailable), "unknown confirm receipt")
        let (headTransition, transition) = prepared()
        headTransition.invalidate(context: context(5))
        check(headTransition.selection == transition, "exact resulting head during original ACK permits proof handoff")
        headTransition.invalidate(context: context(6))
        check(headTransition.selection == nil, "later head before proof denies")
        var clock: TimeInterval = 10
        let timed = NativeJourneyMaterialOutcomeStore(uptime: { clock }, now: { now })
        let timedSelection = timed.select(context: context(), medium: .pdf)!
        check(timed.bindPDF(journal, selection: timedSelection, context: context()), "bind immutable clock")
        clock = 1810
        check(timed.retryJournal(selection: timedSelection, context: context()) == nil && timed.selection == nil, "monotonic expiry clears")
        let reversed = NativeJourneyMaterialOutcomeStore(uptime: { clock }, now: { now })
        let reversedSelection = reversed.select(context: context(), medium: .pdf)!
        clock = 1
        check(reversed.retryJournal(selection: reversedSelection, context: context()) == nil && reversed.selection == nil, "clock reset cannot manufacture latency")
        print("PASS \(count) original-model material outcome assertions; Swift strict compile PASS; App/target/device/measurement lifecycle UNRUN")
    }
}
