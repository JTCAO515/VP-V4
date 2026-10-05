import Foundation
import Testing
@testable import VisePanda

private final class NotificationRetainedFenceFixtureMarker: NSObject {}

@MainActor struct NativeNotificationRetainedFenceTests {
    @Test func soleProducerRetainedFencesPreviewAndExportWithoutRelaxingOriginalGuards() throws {
        let url = try #require(Bundle(for: NotificationRetainedFenceFixtureMarker.self).url(forResource: "native-trip-retained-preview", withExtension: "json"))
        let raw = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let w = NativeCommunityWire.self
        let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "https://fixture.invalid/", subject: try NativeNotificationDataCommand.id(raw["ownerId"]),
            mobileEpoch: try w.integer(raw["mobileEpoch"]), generation: 1), sessionID: try NativeNotificationDataCommand.id(raw["sessionId"]))
        let now = try NativeNotificationDataWire.time(raw["capturedAt"])
        let command = try NativeNotificationDataCommand(body: w.bytes(["action": "preview", "scope": raw["scope"] as Any,
            "requestId": raw["requestId"] as Any, "objectIds": raw["objectIds"] as Any]))
        let preview = try NativeNotificationDataProtocol.preview(w.bytes(["data": raw]), command: command, actor: actor, now: now)
        let fields = try #require(preview.items.first?.fields.first { $0.name == "fences" }?.value)
        #expect(fields.contains("outbox_parent") && fields.contains("watch_semantic"))
        let export = try command.confirmed(action: "export", previewDigest: preview.binding.previewDigest)
        var bundle = raw
        bundle.removeValue(forKey: "requiresExplicitConfirmation")
        bundle["kind"] = "bundle"; bundle["requestDigest"] = NativeNotificationDataProtocol.digest(export.body)
        bundle["proof"] = ["coverage": "complete", "pages": 1, "rows": 1]
        let bytes = try w.bytes(["data": bundle])
        let binding = try NativeNotificationDataProtocol.bundle(bytes, command: export, preview: preview.binding, actor: actor, now: now)
        #expect(binding == preview.binding)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("vpj58-retained-fence-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let generation = UUID()
        let file = NativeNotificationDataExportFile(root: root, uptime: { 10 }, now: { now })
        try file.write(bytes, actor: actor, generation: generation, started: 10, expiresAt: binding.expiresAt, current: { actor }, currentGeneration: { generation })
        let output = try #require(file.visible(current: actor, generation: generation))
        let written = try Data(contentsOf: output)
        #expect(written == bytes)
        #expect(throws: (any Error).self) {
            try NativeNotificationDataProtocol.preview(w.bytes(["data": raw]), command: command, actor: actor, now: binding.expiresAt)
        }
        var foreign = raw; foreign["ownerId"] = "00000000-0000-4000-8000-000000000099"
        #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.preview(w.bytes(["data": foreign]), command: command, actor: actor, now: now) }
        let sourceItems = try #require(raw["items"] as? [[String: Any]])
        let sourceFences = try #require(sourceItems.first?["fences"] as? [[String: Any]])
        for mutation in ["kind", "uuid", "hash", "trip", "key", "sort"] {
            var bad = raw, items = sourceItems, fences = sourceFences
            switch mutation {
            case "kind": fences[0]["kind"] = "unregistered_fence"
            case "uuid": fences[0]["objectId"] = "invalid"
            case "hash": fences[0]["requestDigest"] = "invalid"
            case "trip": fences[0]["tripId"] = "00000000-0000-4000-8000-000000000099"
            case "key": fences[0]["unexpected"] = true
            default: fences.reverse()
            }
            items[0]["fences"] = fences; bad["items"] = items
            #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.preview(w.bytes(["data": bad]), command: command, actor: actor, now: now) }
        }
    }
}
