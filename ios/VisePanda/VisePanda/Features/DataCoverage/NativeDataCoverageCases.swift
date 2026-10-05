import Foundation
import Observation

struct NativeDataCoverageCase: Identifiable, Equatable {
    let id: String
    let problem: String
    let grantRevision: Int
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["caseId", "category", "problem", "status", "accepted", "grantRevision", "recipientId", "expiresAt", "grantState", "sharedFields"])
        id = try w.id(v["caseId"]); problem = try w.text(v["problem"], max: 1000)
        grantRevision = try w.integer(v["grantRevision"], max: 2_147_483_647, minimum: 0)
        _ = try w.optional(v["recipientId"], w.id); _ = try w.optional(v["expiresAt"], w.date)
        guard ["general", "transport", "accommodation", "on_trip"].contains(v["category"] as? String ?? ""),
              v["status"] as? String == "requested", try !w.bool(v["accepted"]),
              ["active", "revoked", "expired"].contains(v["grantState"] as? String ?? ""),
              let fields = v["sharedFields"] as? [String], fields.isEmpty || fields == ["problem"] else { throw NativeDataError.invalidResponse }
    }
}

/// Explicitly paged original owner reader. No hidden traversal or typed UUID input.
@MainActor @Observable final class NativeDataCoverageCases {
    private(set) var rows: [NativeDataCoverageCase] = []
    private(set) var hasMore = false
    private(set) var busy = false
    private(set) var unavailable = false
    private var generation = UUID()
    private var actor: NativeCommunitySafetyActor?
    private var deadline: TimeInterval = 0
    private var offset = 0
    func clear() { generation = UUID(); rows = []; actor = nil; deadline = 0; offset = 0; hasMore = false; busy = false; unavailable = false }
    func visible(_ current: NativeCommunitySafetyActor?) -> [NativeDataCoverageCase] {
        actor != nil && actor == current && ProcessInfo.processInfo.systemUptime < deadline ? rows : []
    }
    func load(actor: NativeCommunitySafetyActor, next: Bool = false, current: () -> NativeCommunitySafetyActor?, request: (Data) async throws -> Data) async {
        guard !busy, current() == actor else { return }
        if next && (self.actor != actor || !hasMore || visible(actor).isEmpty) { return }
        if !next { clear() }; self.actor = actor
        let own = generation, start = ProcessInfo.processInfo.systemUptime, requested = next ? offset + 50 : 0
        busy = true; unavailable = false
        defer { if own == generation { busy = false } }
        do {
            let bytes = try await request(NativeCommunityWire.bytes(["action": "list", "offset": requested]))
            guard own == generation, current() == actor, !Task.isCancelled, ProcessInfo.processInfo.systemUptime - start < 30,
                  bytes.count <= 131_072 else { throw NativeDataError.staleSessionResponse }
            let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
            let page = try NativeCommunityWire.object(outer["data"] as Any, ["cases", "staff"])
            let values = try NativeCommunityWire.rows(page["cases"], max: 50, NativeDataCoverageCase.init)
            guard page["staff"] is [Any], Set(values.map(\.id)).count == values.count else { throw NativeDataError.invalidResponse }
            rows = values; offset = requested; hasMore = values.count == 50; deadline = start + 30
        } catch { if own == generation { rows = []; deadline = 0; hasMore = false; unavailable = true } }
    }
}
