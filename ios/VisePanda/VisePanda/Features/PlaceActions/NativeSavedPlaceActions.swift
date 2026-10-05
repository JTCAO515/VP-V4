import Foundation
import Observation

struct NativeSavedPlaceRow: Identifiable, Equatable {
    let referenceId: String
    let revision: Int
    let selection: NativePlaceActionIdentity
    let mappingDigest: String
    let displayTitle: String?
    let mappingStatus: String
    var id: String { referenceId }
    func label(chinese: Bool) -> String {
        if mappingStatus == "current", let displayTitle { return displayTitle }
        return chinese ? "已收藏地点引用（名称暂不可用）" : "Saved place reference (name unavailable)"
    }
}
struct NativeSavedPlaceOpen: Identifiable {
    let scope: NativeDataScope
    let tripId: String
    let tripVersion: Int
    let row: NativeSavedPlaceRow
    var id: String { row.referenceId }
    var candidate: NativePlaceCandidate {
        .init(provider: row.selection.provider, providerPoiId: row.selection.providerPoiId,
              rawName: row.label(chinese: false), matchedCanonicalPoiId: row.selection.canonicalPoiId)
    }
}
struct NativeSavedPlaceCursor: Equatable {
    let contextDigest: String
    let afterCanonicalPoiId: String
    var object: [String: Any] { ["contextDigest": contextDigest, "afterCanonicalPoiId": afterCanonicalPoiId] }
}
@MainActor @Observable final class NativeSavedPlaceStore {
    private(set) var items: [NativeSavedPlaceRow] = []
    private(set) var busy = false
    private(set) var unavailable = false
    private(set) var nextCursor: NativeSavedPlaceCursor?
    private(set) var hasMore = false
    private var scope: NativeDataScope?
    private var tripId: String?
    private var version: Int?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func clear() { generation = UUID(); items = []; scope = nil; tripId = nil; version = nil; deadline = 0; busy = false; unavailable = false; nextCursor = nil; hasMore = false }
    func visible(scope: NativeDataScope?, tripId: String?, version: Int?) -> [NativeSavedPlaceRow]? {
        guard scope != nil, self.scope == scope, self.tripId == tripId, self.version == version, uptime() < deadline else { return nil }; return items
    }
    func load(scope: NativeDataScope, tripId: String, version: Int, locale: String, cursor: NativeSavedPlaceCursor? = nil, current: () -> Bool, request: (Data) async throws -> Data) async {
        clear(); guard current(), NativeMemoryWire.uuid(tripId), version >= 0 else { return }
        self.scope = scope; self.tripId = tripId; self.version = version
        let own = generation, started = uptime(); busy = true
        defer { if own == generation { busy = false } }
        do {
            let body = try NativePlaceActionWire.bytes(["action": "saved", "expectedTripVersion": version, "locale": locale, "limit": 20, "cursor": cursor.map { $0.object as Any } ?? NSNull()])
            let bytes = try await request(body)
            guard own == generation, current(), !Task.isCancelled else { return }
            guard uptime() - started < 30, bytes.count <= 262144 else { throw NativeDataError.invalidResponse }
            let value = try NativePlaceActionWire.exact(JSONSerialization.jsonObject(with: bytes), ["kind", "tripId", "tripVersion", "contextDigest", "items", "hasMore", "nextCursor"])
            guard value["kind"] as? String == "saved_place_actions", value["tripId"] as? String == tripId, NativePlaceActionWire.integer(value["tripVersion"]) == version,
                  let contextDigest = NativePlaceActionWire.digest(value["contextDigest"]), cursor == nil || cursor?.contextDigest == contextDigest,
                  let more = NativePlaceActionWire.boolean(value["hasMore"]), let rows = value["items"] as? [[String: Any]], rows.count <= 20 else { throw NativeDataError.invalidResponse }
            let result = try rows.map { row -> NativeSavedPlaceRow in
                _ = try NativePlaceActionWire.exact(row, ["referenceId", "revision", "status", "selection", "mappingDigest", "displayTitle", "mappingStatus"])
                guard let ref = NativePlaceActionWire.id(row["referenceId"]), let revision = NativePlaceActionWire.integer(row["revision"]), revision > 0, row["status"] as? String == "saved",
                      let digest = NativePlaceActionWire.digest(row["mappingDigest"]), let status = row["mappingStatus"] as? String, ["current", "changed", "unavailable"].contains(status),
                      row["displayTitle"] is NSNull || NativeFiveResultContent.text(row["displayTitle"], max: 160) != nil else { throw NativeDataError.invalidResponse }
                return .init(referenceId: ref, revision: revision, selection: try NativePlaceActionWire.selection(row["selection"] as Any), mappingDigest: digest,
                             displayTitle: row["displayTitle"] as? String, mappingStatus: status)
            }
            let canonicalIds = result.map { $0.selection.canonicalPoiId }
            guard Set(result.map(\.id)).count == result.count, Set(canonicalIds).count == result.count,
                  canonicalIds == canonicalIds.sorted(), cursor == nil || canonicalIds.allSatisfy({ $0 > cursor!.afterCanonicalPoiId }) else { throw NativeDataError.invalidResponse }
            if more {
                let next = try NativePlaceActionWire.exact(value["nextCursor"] as Any, ["contextDigest", "afterCanonicalPoiId"])
                guard !result.isEmpty, next["contextDigest"] as? String == contextDigest,
                      let last = NativePlaceActionWire.id(next["afterCanonicalPoiId"]), last == canonicalIds.last else { throw NativeDataError.invalidResponse }
                nextCursor = .init(contextDigest: contextDigest, afterCanonicalPoiId: last)
            } else { guard value["nextCursor"] is NSNull else { throw NativeDataError.invalidResponse }; nextCursor = nil }
            hasMore = more; items = result; deadline = started + 30
        } catch { if own == generation { items = []; deadline = 0; unavailable = true } }
    }
}
