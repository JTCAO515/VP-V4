import Foundation
import Testing
@testable import VisePanda

private final class NotificationDataCatalogFixtureMarker: NSObject {}

@MainActor struct NativeNotificationDataCatalogTests {
    @Test func immutableProducerHasThirtyFourVisibleScopesAndOnlyExactNotificationHandlersOpenConsumer() throws {
        let url = try #require(Bundle(for: NotificationDataCatalogFixtureMarker.self).url(forResource: "native-catalog-v4", withExtension: "json"))
        let bytes = try Data(contentsOf: url)
        let raw = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["schemaVersion", "catalogVersion", "actorId", "sessionId", "mobileEpoch", "modules", "allUserDataCompleted"])
        let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "https://fixture.invalid/", subject: try NativeNotificationDataCommand.id(raw["actorId"]),
            mobileEpoch: try NativeCommunityWire.integer(raw["mobileEpoch"]), generation: 1), sessionID: try NativeNotificationDataCommand.id(raw["sessionId"]))
        let catalog = try NativeDataCoverageCatalog(bytes: bytes, actor: actor)
        #expect(catalog.modules.count == 34)
        #expect(catalog.modules.map(\.id) == NativeDataCoverageCopy.order)
        let ids = ["notifications", "notification_devices", "notification_exit_progress"]
        let scopes: [NativeNotificationDataScope] = [.trip, .device, .progress]
        let rows = try #require(raw["modules"] as? [[String: Any]])
        let index = try #require(NativeDataCoverageCopy.order.firstIndex(of: "notifications"))
        #expect(Array(NativeDataCoverageCopy.order[index..<(index + 4)]) == ids + ["lifecycle"])
        for (id, scope) in zip(ids, scopes) {
            let module = try #require(catalog.modules.first { $0.id == id })
            #expect(NativeNotificationDataScope.catalogScope(module) == scope)
            #expect(NativeDataCoverageCopy.title(id, chinese: true) == NativeNotificationDataCopy.title(scope, chinese: true))
            #expect(NativeDataCoverageCopy.title(id, chinese: false) != "Unknown module")
            let original = try #require(rows.first { $0["id"] as? String == id })
            for key in ["scope", "version", "exportHandler", "deleteHandler", "selection"] {
                var bad = original
                bad[key] = key == "scope" ? "notification-metadata/1" : key == "selection" ? "owner" : key == "version" ? "coverage-module-export/1" : "notifications"
                let decoded = try NativeDataCoverageModule(bad)
                #expect(NativeNotificationDataScope.catalogScope(decoded) == nil)
            }
        }
        #expect(catalog.modules.contains { $0.id == "financial_records" && $0.deleteHandler == nil })
        #expect(catalog.modules.contains { $0.id == "case_attachments" && $0.deleteHandler == nil })
    }
}
