import Foundation

/// Independent consumer validation of the exact original projection. No opaque
/// server success badge substitutes for validating every selected object.
enum NativeMaterialReferenceRows {
    static func parse(_ raw: Any, scope: NativeMaterialReferenceScope, tripID: String,
                      epoch: Int, now: Date) throws -> NativeMaterialReferenceItem {
        switch scope {
        case .reservations: return try reservation(raw, tripID: tripID)
        case .pdf: return try pdf(raw, tripID: tripID, epoch: epoch, now: now)
        case .progress: return try progress(raw, tripID: tripID)
        }
    }

    private static func reservation(_ raw: Any, tripID: String) throws -> NativeMaterialReferenceItem {
        let w = NativeCommunityWire.self
        let row = try w.object(raw, ["current", "events", "operations", "historical"])
        let current = try NativeReservationWire.current(row["current"] as Any)
        guard current.tripId == tripID, try w.bool(row["historical"]),
              let events = row["events"] as? [Any], let operations = row["operations"] as? [Any],
              events.count <= 100, operations.count <= 100,
              events.count == current.revision, operations.count == current.revision else { throw NativeDataError.invalidResponse }
        var revision = 0
        for event in events {
            let v = try w.object(event, ["revision", "operationId", "tripVersion", "status", "evidenceTier", "sourceKind", "contentDigest", "confirmedAt"])
            let next = try w.integer(v["revision"], max: 9_007_199_254_740_991)
            _ = try NativeMaterialReferenceCommand.id(v["operationId"])
            _ = try w.integer(v["tripVersion"], max: 9_007_199_254_740_991, minimum: 0)
            _ = try w.hash(v["contentDigest"]); _ = try instant(v["confirmedAt"])
            guard next > revision, next <= current.revision, ["reserved", "amended", "cancelled", "unknown"].contains(v["status"] as? String ?? ""),
                  v["evidenceTier"] as? String == "user_reported", v["sourceKind"] as? String == "user_reported" else { throw NativeDataError.invalidResponse }
            revision = next
        }
        revision = 0; var ids = Set<String>()
        for operation in operations {
            let v = try w.object(operation, ["operationId", "referenceId", "tripId", "appliedRevision"])
            let id = try NativeMaterialReferenceCommand.id(v["operationId"])
            let next = try w.integer(v["appliedRevision"], max: 9_007_199_254_740_991)
            guard ids.insert(id).inserted, v["referenceId"] as? String == current.referenceId, v["tripId"] as? String == tripID,
                  next > revision, next <= current.revision else { throw NativeDataError.invalidResponse }
            revision = next
        }
        var fields: [NativeMaterialReferenceField] = []
        for name in NativeReservationFields.keys {
            if let value = current.fields.object[name] as? String { fields.append(.init(name: name, value: value)) }
        }
        fields.append(.init(name: "evidenceTier", value: current.evidenceTier))
        fields.append(.init(name: "sourceQualification", value: current.sourceQualification))
        if let locator = current.source.locator { fields.append(.init(name: "locator", value: locator)) }
        fields.append(.init(name: "revision", value: String(current.revision)))
        return .init(id: current.referenceId, fields: fields)
    }

    private static func pdf(_ raw: Any, tripID: String, epoch: Int, now: Date) throws -> NativeMaterialReferenceItem {
        let w = NativeCommunityWire.self
        let row = try w.object(raw, ["operationId", "tripId", "sessionEpoch", "requestDigest", "commandDigest", "previewDigest", "proposalId",
            "proposalRevision", "baseTripVersion", "expiresAt", "cancelled", "fields", "contentHash", "rawPdfIncluded", "fullTextIncluded",
            "evidenceTier", "sourceAvailability", "orderVerification", "operation"])
        let id = try NativeMaterialReferenceCommand.id(row["operationId"])
        let originalEpoch = try w.integer(row["sessionEpoch"], max: 9_007_199_254_740_991)
        for name in ["requestDigest", "commandDigest", "previewDigest"] { _ = try w.optional(row[name], w.hash) }
        let proposalID = try w.optional(row["proposalId"], NativeMaterialReferenceCommand.id)
        let revision = try w.optional(row["proposalRevision"], { try w.integer($0, max: 9_007_199_254_740_991) })
        let version = try w.optional(row["baseTripVersion"], { try w.integer($0, max: 9_007_199_254_740_991, minimum: 0) })
        let expires = try w.optional(row["expiresAt"], instant)
        let cancelled = try w.bool(row["cancelled"])
        guard row["tripId"] as? String == tripID, try !w.bool(row["rawPdfIncluded"]), try !w.bool(row["fullTextIncluded"]),
              row["evidenceTier"] as? String == "user_checked_local_pdf", row["sourceAvailability"] as? String == "local_only",
              row["orderVerification"] as? String == "unavailable",
              proposalID == nil && revision == nil && version == nil || proposalID != nil && revision != nil && version != nil else { throw NativeDataError.invalidResponse }
        let operation = try pdfOperation(row["operation"] as Any, row: row, id: id, tripID: tripID, epoch: originalEpoch)
        guard !cancelled || ["cancelled", "confirmed"].contains(operation.state) else { throw NativeDataError.invalidResponse }
        var fields: [NativeMaterialReferenceField] = []
        if row["fields"] is NSNull {
            guard row["contentHash"] is NSNull else { throw NativeDataError.invalidResponse }
        } else {
            _ = try w.hash(row["contentHash"])
            guard originalEpoch == epoch, !cancelled, let expires, expires > now,
                  let values = row["fields"] as? [Any], (1...4).contains(values.count) else { throw NativeDataError.invalidResponse }
            var kinds = Set<String>()
            for value in values {
                let field = try w.object(value, ["kind", "value", "locator"])
                let locator = try w.object(field["locator"] as Any, ["page", "line", "sourceTextHash"])
                let page = try w.integer(locator["page"], max: 10), line = try w.integer(locator["line"], max: 1000)
                _ = try w.hash(locator["sourceTextHash"])
                guard let kind = field["kind"] as? String, let text = field["value"] as? String,
                      NativePDFField.validValue(text, kind: kind), kinds.insert(kind).inserted else { throw NativeDataError.invalidResponse }
                fields.append(.init(name: kind, value: text))
                fields.append(.init(name: kind + ".locator", value: "\(page):\(line)"))
            }
            guard kinds.contains("date") else { throw NativeDataError.invalidResponse }
        }
        fields.append(.init(name: "cancelled", value: cancelled ? "true" : "false"))
        fields.append(.init(name: "originalState", value: operation.state))
        return .init(id: id, fields: fields)
    }

    private static func pdfOperation(_ raw: Any, row: [String: Any], id: String, tripID: String, epoch: Int) throws -> NativePDFOperation {
        let w = NativeCommunityWire.self
        let value = try w.object(raw, ["kind", "operationId", "tripId", "sessionEpoch", "state", "requestDigest", "commandDigest", "previewDigest",
            "expiresAt", "proposalId", "proposalRevision", "baseTripVersion", "confirmationEventId", "resultingVersion"])
        let op = try JSONDecoder().decode(NativePDFOperation.self, from: JSONSerialization.data(withJSONObject: value))
        guard op.kind == "pdf_intake_operation/1", op.operationId == id, op.tripId == tripID, op.sessionEpoch == epoch,
              ["pending", "confirmed", "rejected", "cancelled", "expired"].contains(op.state) else { throw NativeDataError.invalidResponse }
        let binding = ["requestDigest", "commandDigest", "previewDigest", "expiresAt", "proposalId", "proposalRevision", "baseTripVersion"]
        for key in binding {
            guard NativeReservationWire.equal(row[key]!, value[key]!) else { throw NativeDataError.invalidResponse }
        }
        let emptyCancel = op.state == "cancelled" && binding.allSatisfy { value[$0] is NSNull }
        if !emptyCancel {
            for key in ["requestDigest", "commandDigest", "previewDigest"] { _ = try w.hash(value[key]) }
            _ = try instant(value["expiresAt"])
            _ = try NativeMaterialReferenceCommand.id(value["proposalId"])
            _ = try w.integer(value["proposalRevision"], max: 9_007_199_254_740_991)
            _ = try w.integer(value["baseTripVersion"], max: 9_007_199_254_740_991, minimum: 0)
        }
        if op.state == "confirmed" {
            _ = try NativeMaterialReferenceCommand.id(value["confirmationEventId"])
            guard let base = op.baseTripVersion, let resulting = op.resultingVersion, resulting == base + 1,
                  resulting <= 9_007_199_254_740_991 else { throw NativeDataError.invalidResponse }
        } else {
            guard value["confirmationEventId"] is NSNull, value["resultingVersion"] is NSNull else { throw NativeDataError.invalidResponse }
        }
        return op
    }

    private static func progress(_ raw: Any, tripID: String) throws -> NativeMaterialReferenceItem {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["objectId", "tripId", "originalScope", "objectIds", "referenceOperationIds", "sourceDigest", "previewDigest", "requestDigest",
            "state", "capturedAt", "expiresAt", "decidedAt", "pages", "rows", "progressErased"])
        let id = try NativeMaterialReferenceCommand.id(v["objectId"])
        guard v["tripId"] as? String == tripID, NativeMaterialReferenceScope(rawValue: v["originalScope"] as? String ?? "") != nil,
              let ids = v["objectIds"] as? [String], (1...20).contains(ids.count), ids == ids.sorted(), Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
        for id in ids { _ = try NativeMaterialReferenceCommand.id(id) }
        guard let referenceOperations = v["referenceOperationIds"] as? [String], referenceOperations.count <= 2000,
              referenceOperations == referenceOperations.sorted(), Set(referenceOperations).count == referenceOperations.count else { throw NativeDataError.invalidResponse }
        for id in referenceOperations { _ = try NativeMaterialReferenceCommand.id(id) }
        _ = try w.hash(v["sourceDigest"]); _ = try w.hash(v["previewDigest"]); _ = try w.optional(v["requestDigest"], w.hash)
        let state = try w.text(v["state"], max: 9)
        let captured = try NativeMaterialReferenceWire.time(v["capturedAt"] as Any)
        _ = try NativeMaterialReferenceWire.time(v["expiresAt"] as Any)
        let decided = try w.optional(v["decidedAt"], NativeMaterialReferenceWire.time)
        let pages = try w.integer(v["pages"], max: 9_007_199_254_740_991, minimum: 0)
        let rows = try w.integer(v["rows"], max: 9_007_199_254_740_991, minimum: 0)
        let erased = try w.bool(v["progressErased"])
        guard ["previewed", "exporting", "exported", "erased", "expired"].contains(state), decided == nil || decided! >= captured else { throw NativeDataError.invalidResponse }
        return .init(id: id, fields: [.init(name: "state", value: state), .init(name: "pages", value: String(pages)),
            .init(name: "rows", value: String(rows)), .init(name: "progressErased", value: erased ? "true" : "false")])
    }

    private static func instant(_ raw: Any?) throws -> Date {
        guard let text = raw as? String, text.range(of: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", options: .regularExpression) != nil,
              let value = NativePDFWire.date(text) else { throw NativeDataError.invalidResponse }
        return value
    }
}
