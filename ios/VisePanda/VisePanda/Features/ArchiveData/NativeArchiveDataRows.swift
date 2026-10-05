import Foundation

enum NativeArchiveDataRows {
    private static let w = NativeCommunityWire.self
    private static let s = NativeArchiveDataWire.self
    static func content(_ raw: Any) throws {
        let v = try w.object(raw, ["days"])
        guard let days = v["days"] as? [[String: Any]] else { throw NativeDataError.invalidResponse }
        for day in days {
            _ = try w.object(day, Set(["id", "date", "items"] + (day.keys.contains("timeZone") ? ["timeZone"] : [])))
            let dayID = try w.text(day["id"], max: 160)
            guard let date = day["date"] as? String, date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
                  let items = day["items"] as? [[String: Any]] else { throw NativeDataError.invalidResponse }
            if day.keys.contains("timeZone") { _ = try w.text(day["timeZone"], max: 160) }
            for item in items {
                _ = try w.object(item, Set(["id", "dayId", "title"] + ["startsAt", "endsAt"].filter { item.keys.contains($0) }))
                _ = try w.text(item["id"], max: 160); _ = try w.text(item["title"], max: 160)
                guard item["dayId"] as? String == dayID else { throw NativeDataError.invalidResponse }
                for key in ["startsAt", "endsAt"] where item.keys.contains(key) { try instant(item[key]) }
            }
        }
    }
    private static func instant(_ raw: Any?) throws {
        guard let value = raw as? String, value.range(of: #"^\d{4}-\d{2}-\d{2}T"#, options: .regularExpression) != nil,
              NativeKnowledgeRead.date(value) != nil else { throw NativeDataError.invalidResponse }
    }
    private static func cursor(_ raw: Any?, section: String, digest: String) throws {
        if raw is NSNull { return }
        let v = try w.object(raw as Any, ["sourceDigest", "afterKey"])
        guard try w.hash(v["sourceDigest"]) == digest else { throw NativeDataError.invalidResponse }
        if section == "snapshots" {
            guard let key = v["afterKey"] as? String, key.range(of: #"^\d{10}$"#, options: .regularExpression) != nil,
                  let version = Int(key), version <= Int(Int32.max) else { throw NativeDataError.invalidResponse }
        } else { _ = try NativeArchiveDataCommand.id(v["afterKey"]) }
    }
    static func sections(_ raw: Any?, binding: NativeArchiveDataBinding) throws -> [String: Int] {
        guard let sections = raw as? [[String: Any]], sections.count == binding.scope.sections.count else { throw NativeDataError.invalidResponse }
        var counts = ["trip": 0, "snapshots": 0, "operations": 0, "progress": 0]
        var trip: [String: Any]?, head: [String: Any]?
        for (index, section) in sections.enumerated() {
            _ = try w.object(section, ["section", "items"])
            let name = binding.scope.sections[index]
            guard section["section"] as? String == name, let items = section["items"] as? [[String: Any]],
                  items.count <= (name == "trip" ? 1 : 10000) else { throw NativeDataError.invalidResponse }
            var last = ""
            for row in items {
                let key = try key(name, row: row, binding: binding)
                guard key > last else { throw NativeDataError.invalidResponse }; last = key
                if name == "trip" { trip = row }
                if name == "snapshots", row["version"] as? Int == binding.tripVersion { head = row }
            }
            counts[name] = items.count
            if name == "progress" {
                guard items.compactMap({ $0["objectId"] as? String }) == binding.objectIDs else { throw NativeDataError.invalidResponse }
            }
        }
        if binding.scope == .trip {
            guard let trip, let head, trip["title"] as? String == head["title"] as? String,
                  let current = trip["content"], let saved = head["content"],
                  try JSONSerialization.data(withJSONObject: current, options: [.sortedKeys, .withoutEscapingSlashes]) == JSONSerialization.data(withJSONObject: saved, options: [.sortedKeys, .withoutEscapingSlashes]) else { throw NativeDataError.invalidResponse }
        }
        return counts
    }
    private static func key(_ section: String, row v: [String: Any], binding: NativeArchiveDataBinding) throws -> String {
        if section == "trip" {
            _ = try w.object(v, ["tripId", "title", "headVersion", "confirmationState", "content", "lifecycle"])
            let trip = try NativeTripLifecycleWire.trip(v["lifecycle"])
            guard trip.state == .archived, trip.id == binding.tripID, trip.headVersion == binding.tripVersion,
                  v["tripId"] as? String == trip.id, v["title"] as? String == trip.title,
                  try s.integer(v["headVersion"], max: Int(Int32.max)) == trip.headVersion,
                  ["initial", "confirmed", "unknown"].contains(v["confirmationState"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            try content(v["content"] as Any); return trip.id
        }
        if section == "snapshots" {
            _ = try w.object(v, ["tripId", "version", "title", "createdAt", "content"])
            guard let head = binding.tripVersion, v["tripId"] as? String == binding.tripID else { throw NativeDataError.invalidResponse }
            let version = try s.integer(v["version"], max: head, minimum: 0)
            _ = try w.text(v["title"], max: 160); try instant(v["createdAt"])
            try content(v["content"] as Any)
            return String(format: "%010d", version)
        }
        if section == "operations" {
            let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "", subject: binding.ownerID, mobileEpoch: binding.epoch, generation: 0), sessionID: binding.sessionID)
            let id = try NativeDataCoverageLifecycleRow.key(v, actor: actor)
            _ = try NativeArchiveDataCommand.id(id)
            if !(v["receipt"] is NSNull) {
                guard let receipt = v["receipt"] as? [String: Any], receipt["tripId"] as? String == binding.tripID else { throw NativeDataError.invalidResponse }
            }
            return id
        }
        guard section == "progress" else { throw NativeDataError.invalidResponse }
        return try progress(v, binding: binding)
    }
    private static func progress(_ v: [String: Any], binding: NativeArchiveDataBinding) throws -> String {
        _ = try w.object(v, ["objectId", "ownerId", "sessionId", "mobileEpoch", "originalScope", "tripId", "tripVersion", "objectIds", "sourceDigest", "previewDigest", "requestDigest", "state", "capturedAt", "expiresAt", "decidedAt", "progressErased", "progress", "receipt"])
        let id = try NativeArchiveDataCommand.id(v["objectId"]), owner = try NativeArchiveDataCommand.id(v["ownerId"])
        _ = try NativeArchiveDataCommand.id(v["sessionId"]); _ = try s.integer(v["mobileEpoch"])
        guard binding.objectIDs.contains(id), owner == binding.ownerID,
              let scope = (v["originalScope"] as? String).flatMap(NativeArchiveDataScope.init(rawValue:)),
              let state = v["state"] as? String, ["previewed", "exporting", "exported", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
        _ = try NativeArchiveDataCommand(body: w.bytes(["action": "preview", "scope": scope.rawValue, "requestId": id,
            "tripId": v["tripId"] as Any, "tripVersion": v["tripVersion"] as Any, "objectIds": v["objectIds"] as Any]))
        let source = try w.hash(v["sourceDigest"]); _ = try w.hash(v["previewDigest"])
        let requestDigest = try w.optional(v["requestDigest"]) { try w.hash($0) }
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        let decided = try w.optional(v["decidedAt"]) { try s.integer($0) }
        guard expiry == capture + 30000, decided == nil || decided! >= capture && decided! < expiry,
              let pages = v["progress"] as? [[String: Any]], pages.count <= 3 else { throw NativeDataError.invalidResponse }
        let erased = try w.bool(v["progressErased"])
        var previous = -1, totalRows = 0, totalPages = 0
        for p in pages {
            _ = try w.object(p, ["section", "pages", "rows", "lastCursor", "nextCursor", "lastLimit", "terminal"])
            guard let name = p["section"] as? String, let index = scope.sections.firstIndex(of: name), index > previous else { throw NativeDataError.invalidResponse }
            previous = index
            let count = try s.integer(p["pages"], max: 201, minimum: 0), rows = try s.integer(p["rows"], max: name == "trip" ? 1 : 10000, minimum: 0)
            let terminal = try w.bool(p["terminal"])
            try cursor(p["lastCursor"], section: name, digest: source); try cursor(p["nextCursor"], section: name, digest: source)
            let limit = try w.optional(p["lastLimit"]) { try s.integer($0, max: 50) }
            guard limit == nil || limit == 50, !terminal || p["nextCursor"] is NSNull,
                  count == 0 ? rows == 0 && !terminal && p["lastCursor"] is NSNull && p["nextCursor"] is NSNull && limit == nil : limit == 50 else { throw NativeDataError.invalidResponse }
            totalRows += rows; totalPages += count
        }
        guard totalRows <= 20001, totalPages <= 402, !erased || pages.isEmpty,
              state == "previewed" ? requestDigest == nil && decided == nil && v["receipt"] is NSNull : requestDigest != nil else { throw NativeDataError.invalidResponse }
        if state == "erased" {
            let r = try w.object(v["receipt"] as Any, ["requestDigest", "decidedAt", "clearedProgress", "sourceTrip", "externalCopies"])
            guard scope == .progress, try w.hash(r["requestDigest"]) == requestDigest,
                  try s.integer(r["decidedAt"]) == decided, r["sourceTrip"] as? String == "not_modified",
                  r["externalCopies"] as? String == "not_erased" else { throw NativeDataError.invalidResponse }
            _ = try s.integer(r["clearedProgress"], max: 60, minimum: 0)
        } else { guard v["receipt"] is NSNull else { throw NativeDataError.invalidResponse } }
        return id
    }
}
