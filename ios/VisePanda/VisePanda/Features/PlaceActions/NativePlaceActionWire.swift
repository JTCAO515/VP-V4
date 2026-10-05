import Foundation
import CoreFoundation

/// Closed native consumer of the server-owned place-action contract.
enum NativePlaceActionWire {
    static func exact(_ raw: Any, _ keys: [String]) throws -> [String: Any] {
        guard let value = raw as? [String: Any], Set(value.keys) == Set(keys) else { throw NativeDataError.invalidResponse }; return value
    }
    static func digest(_ raw: Any?) -> String? {
        guard let value = raw as? String, value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return nil }; return value
    }
    static func boolean(_ raw: Any?) -> Bool? {
        guard let value = raw as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { return nil }; return value.boolValue
    }
    static func id(_ raw: Any?) -> String? { guard let value = raw as? String, NativeMemoryWire.uuid(value) else { return nil }; return value }
    static func item(_ raw: String) -> Bool { raw.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil }
    static func integer(_ raw: Any?) -> Int? {
        guard let n = NativeFiveResultContent.integer(raw, minimum: 0), (0...2147483647).contains(n) else { return nil }; return n
    }
    static func selection(_ raw: Any) throws -> NativePlaceActionIdentity {
        let value = try exact(raw, ["canonicalPoiId", "provider", "providerPoiId"])
        guard let canonical = id(value["canonicalPoiId"]), let provider = (value["provider"] as? String).flatMap(NativePlaceProvider.init(rawValue:)),
              let providerId = value["providerPoiId"] as? String, !providerId.isEmpty, providerId.utf16.count <= 128,
              providerId == providerId.trimmingCharacters(in: .whitespacesAndNewlines) else { throw NativeDataError.invalidResponse }
        return try NativePlaceActionIdentity(candidate: .init(provider: provider, providerPoiId: providerId, rawName: "identity", matchedCanonicalPoiId: canonical))
    }
    static func object(_ body: Data, maximum: Int = 16384) throws -> [String: Any] {
        guard body.count <= maximum else { throw NativeDataError.invalidResponse }
        guard let raw = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { throw NativeDataError.invalidResponse }; return raw
    }
    static func bytes(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    static func place(_ value: NativePlaceActionIdentity) -> [String: Any] {
        ["canonicalPoiId": value.canonicalPoiId, "provider": value.provider.rawValue, "providerPoiId": value.providerPoiId]
    }
}

struct NativePlaceActionContext {
    struct Saved { let referenceId: String; let revision: Int; let status: String; let mappingDigest: String }
    let tripId: String
    let tripVersion: Int
    let selection: NativePlaceActionIdentity
    let mappingDigest: String
    let contextDigest: String
    let title: String
    let days: [NativeTripDay]
    let saved: Saved?
    let sourceCandidatesStatus: String
    let evaluatedAt: Date
    let expiresAt: Date

    static func decode(_ bytes: Data, expected: NativePlaceActionSelection, now: Date = Date()) throws -> Self {
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let value = try NativePlaceActionWire.exact(JSONSerialization.jsonObject(with: bytes), ["kind", "tripId", "tripVersion", "selection", "mappingDigest", "contextDigest", "snapshot", "displayTitle", "referenceId", "saved", "sourceCandidates", "sourceCandidatesStatus", "evaluatedAt", "expiresAt"])
        guard value["kind"] as? String == "place_action_context", value["tripId"] as? String == expected.tripId,
              NativePlaceActionWire.integer(value["tripVersion"]) == expected.baseVersion,
              try NativePlaceActionWire.selection(value["selection"] as Any) == expected.place,
              let mapping = NativePlaceActionWire.digest(value["mappingDigest"]), let digest = NativePlaceActionWire.digest(value["contextDigest"]),
              let title = value["displayTitle"] as? String, !title.isEmpty, title.utf16.count <= 160,
              let evaluated = (value["evaluatedAt"] as? String).flatMap(NativeKnowledgeRead.date),
              let expires = (value["expiresAt"] as? String).flatMap(NativeKnowledgeRead.date),
              evaluated <= now.addingTimeInterval(5), expires > now, expires > evaluated, expires.timeIntervalSince(evaluated) <= 30.001
        else { throw NativeDataError.invalidResponse }
        guard value["referenceId"] is NSNull || NativePlaceActionWire.id(value["referenceId"]) != nil,
              let candidates = value["sourceCandidates"] as? [[String: Any]], candidates.count <= 24, ["complete", "unavailable"].contains(value["sourceCandidatesStatus"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        // Source candidates are never rendered or used as local qualification. The
        // server rechecks them when creating the original Proposal; UI stays pending.
        for row in candidates { _ = try NativePlaceActionWire.exact(row, ["mappingId", "mappingVersion", "mappingDigest", "statementId", "claimRevision", "payloadHash", "sourceDigest", "scope", "claim", "city", "scene", "locale"]) }
        let snapshot = try NativePlaceActionWire.exact(value["snapshot"] as Any, ["version", "title", "days"])
        guard NativePlaceActionWire.integer(snapshot["version"]) == expected.baseVersion,
              let rows = snapshot["days"] as? [[String: Any]], rows.count <= 100,
              let snapshotTitle = snapshot["title"] as? String, !snapshotTitle.isEmpty else { throw NativeDataError.invalidResponse }
        let days: [NativeTripDay] = try rows.map { row in
            guard Set(row.keys).isSubset(of: ["id", "date", "timeZone", "items"]), let id = row["id"] as? String, NativePlaceActionWire.item(id),
                  let date = row["date"] as? String, date.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }
            let itemRows = row["items"] as? [[String: Any]] ?? []
            guard row["items"] == nil || row["items"] is [[String: Any]], itemRows.count <= 100 else { throw NativeDataError.invalidResponse }
            let items = try itemRows.map { item -> NativeTripItem in
                guard Set(item.keys).isSubset(of: ["id", "dayId", "title", "startsAt", "endsAt", "manualOrder"]), let itemId = item["id"] as? String, NativePlaceActionWire.item(itemId), item["dayId"] as? String == id,
                      let name = item["title"] as? String, !name.isEmpty else { throw NativeDataError.invalidResponse }
                for key in ["startsAt", "endsAt"] { if let timestamp = item[key] { guard let text = timestamp as? String, NativeKnowledgeRead.date(text) != nil else { throw NativeDataError.invalidResponse } } }
                let manualOrder: Int?
                if let raw = item["manualOrder"] {
                    guard NativePlaceActionWire.boolean(raw) == nil, let value = NativePlaceActionWire.integer(raw) else { throw NativeDataError.invalidResponse }
                    manualOrder = value
                } else { manualOrder = nil }
                return .init(id: itemId, dayId: id, title: name, startsAt: item["startsAt"] as? String, endsAt: item["endsAt"] as? String, manualOrder: manualOrder)
            }
            guard Set(items.map(\.id)).count == items.count, row["timeZone"] == nil || (row["timeZone"] as? String).flatMap(TimeZone.init(identifier:)) != nil else { throw NativeDataError.invalidResponse }
            return .init(id: id, date: date, timeZone: row["timeZone"] as? String, items: items)
        }
        guard Set(days.map(\.id)).count == days.count, Set(days.flatMap(\.items).map(\.id)).count == days.flatMap(\.items).count, days.flatMap(\.items).count <= 500 else { throw NativeDataError.invalidResponse }
        var saved: Saved?
        if !(value["saved"] is NSNull) {
            let raw = try NativePlaceActionWire.exact(value["saved"] as Any, ["referenceId", "revision", "status", "mappingDigest"])
            guard let ref = NativePlaceActionWire.id(raw["referenceId"]), let revision = NativePlaceActionWire.integer(raw["revision"]), revision > 0,
                  let status = raw["status"] as? String, ["saved", "unsaved"].contains(status), let savedMapping = NativePlaceActionWire.digest(raw["mappingDigest"]) else { throw NativeDataError.invalidResponse }
            saved = .init(referenceId: ref, revision: revision, status: status, mappingDigest: savedMapping)
        }
        return .init(tripId: expected.tripId, tripVersion: expected.baseVersion, selection: expected.place, mappingDigest: mapping, contextDigest: digest, title: title, days: days, saved: saved, sourceCandidatesStatus: value["sourceCandidatesStatus"] as! String, evaluatedAt: evaluated, expiresAt: expires)
    }
}

struct NativePlaceActionCommand: Codable, Equatable {
    let tripId: String
    let body: Data
    var object: [String: Any] { get throws { try NativePlaceActionWire.object(body) } }
    var operationId: String { get throws { guard let value = try object["operationId"] as? String else { throw NativeDataError.invalidResponse }; return value } }
    var action: String { get throws { guard let value = try object["action"] as? String else { throw NativeDataError.invalidResponse }; return value } }
    func validate() throws {
        let raw = try object
        guard NativeMemoryWire.uuid(tripId), NativePlaceActionWire.id(raw["operationId"]) != nil,
              NativePlaceActionWire.integer(raw["expectedTripVersion"]) != nil, NativePlaceActionWire.digest(raw["expectedMappingDigest"]) != nil else { throw NativeDataError.invalidResponse }
        _ = try NativePlaceActionWire.selection(raw["selection"] as Any)
        let common = ["action", "operationId", "expectedTripVersion", "selection", "expectedMappingDigest"]
        switch try action {
        case "save":
            _ = try NativePlaceActionWire.exact(raw, common + ["expectedSaveRevision"])
            guard NativePlaceActionWire.integer(raw["expectedSaveRevision"]) != nil else { throw NativeDataError.invalidResponse }
        case "unsave":
            _ = try NativePlaceActionWire.exact(raw, common + ["referenceId", "expectedSaveRevision"])
            guard NativePlaceActionWire.id(raw["referenceId"]) != nil, let n = NativePlaceActionWire.integer(raw["expectedSaveRevision"]), n > 0 else { throw NativeDataError.invalidResponse }
        case "add":
            _ = try NativePlaceActionWire.exact(raw, common + ["dayId", "itemId", "startsAt", "endsAt", "locale"])
            guard let day = raw["dayId"] as? String, NativePlaceActionWire.item(day), let item = raw["itemId"] as? String, NativePlaceActionWire.item(item),
                  let start = (raw["startsAt"] as? String).flatMap(NativeKnowledgeRead.date), let end = (raw["endsAt"] as? String).flatMap(NativeKnowledgeRead.date),
                  end > start, end.timeIntervalSince(start) <= 86400, ["zh", "en"].contains(raw["locale"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
    }
    func recoveryBody() throws -> Data { try validate(); return try NativePlaceActionWire.bytes(["action": "receipt", "request": object]) }
}

struct NativePlaceActionReceipt {
    let tripId: String
    let operationId: String
    let action: String
    let place: NativePlaceActionIdentity
    let tripVersion: Int
    let mappingDigest: String
    let referenceId: String
    let savedRevision: Int?
    let savedStatus: String?
    let proposalId: String?
    let proposalRevision: Int?
    let proposalReview: NativePlaceActionProposal?
    let preview: NativePlaceActionPreview?

    static func decode(_ bytes: Data, pending: NativePlaceActionPending) throws -> Self? {
        let value = try NativePlaceActionWire.object(bytes, maximum: 262144), command = try pending.command.object
        let op = try pending.command.operationId, action = try pending.command.action
        if value["kind"] as? String == "receipt_absent" {
            _ = try NativePlaceActionWire.exact(value, ["kind", "tripId", "operationId"])
            guard value["tripId"] as? String == pending.command.tripId, value["operationId"] as? String == op else { throw NativeDataError.invalidResponse }; return nil
        }
        _ = try NativePlaceActionWire.exact(value, ["kind", "tripId", "operationId", "action", "selection", "tripVersion", "mappingDigest", "requestDigest", "referenceId", "savedRevision", "savedStatus", "proposal", "proposalReview", "preview", "historicalOnly", "currentEligibilityRequiresRead"])
        let place = try NativePlaceActionWire.selection(command["selection"] as Any)
        guard value["kind"] as? String == "place_action_receipt", value["tripId"] as? String == pending.command.tripId,
              value["operationId"] as? String == op, value["action"] as? String == action,
              try NativePlaceActionWire.selection(value["selection"] as Any) == place,
              let version = NativePlaceActionWire.integer(value["tripVersion"]), version == NativePlaceActionWire.integer(command["expectedTripVersion"]),
              let mapping = NativePlaceActionWire.digest(value["mappingDigest"]), mapping == command["expectedMappingDigest"] as? String,
              NativePlaceActionWire.digest(value["requestDigest"]) != nil, let ref = NativePlaceActionWire.id(value["referenceId"]),
              NativePlaceActionWire.boolean(value["historicalOnly"]) == true, NativePlaceActionWire.boolean(value["currentEligibilityRequiresRead"]) == true
        else { throw NativeDataError.invalidResponse }
        var proposalId: String?, revision: Int?, review: NativePlaceActionProposal?
        let savedRevision = NativePlaceActionWire.integer(value["savedRevision"]), status = value["savedStatus"] as? String
        if action == "add" {
            guard value["savedRevision"] is NSNull, value["savedStatus"] is NSNull else { throw NativeDataError.invalidResponse }
            let proposal = try NativePlaceActionWire.exact(value["proposal"] as Any, ["proposalId", "revision", "baseTripVersion"])
            guard let id = NativePlaceActionWire.id(proposal["proposalId"]), let rev = NativePlaceActionWire.integer(proposal["revision"]), rev > 0,
                  NativePlaceActionWire.integer(proposal["baseTripVersion"]) == version else { throw NativeDataError.invalidResponse }
            proposalId = id; revision = rev
            if !(value["proposalReview"] is NSNull) {
                let raw = try NativePlaceActionWire.exact(value["proposalReview"] as Any, ["id", "revision", "digest", "baseVersion"])
                guard raw["id"] as? String == id, NativePlaceActionWire.integer(raw["revision"]) == rev,
                      NativePlaceActionWire.integer(raw["baseVersion"]) == version,
                      let digest = raw["digest"] as? String, digest.hasPrefix("trip-v2:"), NativePlaceActionWire.digest(String(digest.dropFirst(8))) != nil else { throw NativeDataError.invalidResponse }
                // Scope generation is attached by the store after the authoritative read.
                review = .init(scope: .init(endpoint: pending.endpoint, subject: pending.owner, mobileEpoch: pending.epoch, generation: 0), tripId: pending.command.tripId, baseVersion: version, proposalId: id, revision: rev, digest: digest)
            }
        } else {
            guard let savedRevision, let expected = NativePlaceActionWire.integer(command["expectedSaveRevision"]), savedRevision == expected + 1,
                  status == (action == "save" ? "saved" : "unsaved"), value["proposal"] is NSNull, value["proposalReview"] is NSNull,
                  action != "unsave" || command["referenceId"] as? String == ref else { throw NativeDataError.invalidResponse }
        }
        return .init(tripId: pending.command.tripId, operationId: op, action: action, place: place, tripVersion: version,
                     mappingDigest: mapping, referenceId: ref, savedRevision: savedRevision, savedStatus: status,
                     proposalId: proposalId, proposalRevision: revision, proposalReview: review, preview: try NativePlaceActionPreview.decode(value["preview"] as Any, pending: pending))
    }
}

struct NativePlaceActionPreview {
    struct Edge { let fromItemId: String; let toItemId: String; let departureAt: Date }
    let status: String
    let edges: [Edge]
    let removed: [Edge]
    let pendingCount: Int
    let newItemId: String
    let sourceExpiresAt: Date
    static func decode(_ raw: Any, pending: NativePlaceActionPending) throws -> Self? {
        if raw is NSNull { return nil }
        let value = try NativePlaceActionWire.exact(raw, ["kind", "tripId", "baseVersion", "selection", "mappingDigest", "contextDigest", "status", "lines", "affectedDirectedEdges", "removedDirectedEdges", "matrix", "routeObservedAt", "sourceExpiresAt", "tripMutation", "confirmation", "userWindow"])
        let command = try pending.command.object
        guard try pending.command.action == "add", value["kind"] as? String == "place_add_preview/1", value["tripId"] as? String == pending.command.tripId,
              NativePlaceActionWire.integer(value["baseVersion"]) == NativePlaceActionWire.integer(command["expectedTripVersion"]),
              try NativePlaceActionWire.selection(value["selection"] as Any) == NativePlaceActionWire.selection(command["selection"] as Any),
              value["mappingDigest"] as? String == command["expectedMappingDigest"] as? String,
              NativePlaceActionWire.digest(value["contextDigest"]) != nil, let status = value["status"] as? String, ["pending", "infeasible"].contains(status),
              let lines = value["lines"] as? [[String: Any]], (1...2048).contains(lines.count),
              value["routeObservedAt"] is NSNull, let expiry = (value["sourceExpiresAt"] as? String).flatMap(NativeKnowledgeRead.date),
              value["tripMutation"] as? String == "none", value["confirmation"] as? String == "original_proposal_diff_confirm",
              value["userWindow"] as? String == "explicit_choice_not_source_evidence" else { throw NativeDataError.invalidResponse }
        for line in lines {
            _ = try NativePlaceActionWire.exact(line, ["itemId", "constraint", "status", "reason"])
            guard line["itemId"] is NSNull || (line["itemId"] as? String).map(NativePlaceActionWire.item) == true,
                  let constraint = line["constraint"] as? String, !constraint.isEmpty, constraint.utf16.count <= 128,
                  let reason = line["reason"] as? String, !reason.isEmpty, reason.utf16.count <= 256,
                  ["supported", "pending", "violated"].contains(line["status"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        }
        let actual = lines.contains { $0["status"] as? String == "violated" } ? "infeasible" : "pending"
        guard status == actual, lines.contains(where: { $0["status"] as? String == "pending" }) else { throw NativeDataError.invalidResponse }
        func edges(_ raw: Any) throws -> [Edge] {
            guard let rows = raw as? [[String: Any]], rows.count <= 2 else { throw NativeDataError.invalidResponse }
            return try rows.map { row in
                _ = try NativePlaceActionWire.exact(row, ["fromItemId", "toItemId", "departureAt"])
                guard let from = row["fromItemId"] as? String, NativePlaceActionWire.item(from), let to = row["toItemId"] as? String, NativePlaceActionWire.item(to), from != to,
                      let departure = (row["departureAt"] as? String).flatMap(NativeKnowledgeRead.date) else { throw NativeDataError.invalidResponse }
                return .init(fromItemId: from, toItemId: to, departureAt: departure)
            }
        }
        let affected = try edges(value["affectedDirectedEdges"] as Any), removed = try edges(value["removedDirectedEdges"] as Any)
        let matrix = try NativePlaceActionWire.exact(value["matrix"] as Any, ["candidates", "affectedElements", "concurrency", "providerCalls", "billingUnit", "cost"])
        guard NativePlaceActionWire.integer(matrix["candidates"]) == 1, NativePlaceActionWire.integer(matrix["affectedElements"]) == affected.count,
              NativePlaceActionWire.integer(matrix["concurrency"]) == 0, NativePlaceActionWire.integer(matrix["providerCalls"]) == 0,
              matrix["billingUnit"] as? String == "unknown", matrix["cost"] as? String == "unknown",
              let item = command["itemId"] as? String, affected.allSatisfy({ $0.fromItemId == item || $0.toItemId == item }) else { throw NativeDataError.invalidResponse }
        return .init(status: status, edges: affected, removed: removed, pendingCount: lines.filter { $0["status"] as? String == "pending" }.count, newItemId: item, sourceExpiresAt: expiry)
    }
}
