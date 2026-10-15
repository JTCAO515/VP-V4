import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativeSubscriptionCompositionTests {
    @Test func actualAppBundleUsesCanonicalPublicCatalogWithoutAccount() async throws {
        let port = NativeSubscriptionDevelopmentPort(scope: { nil })
        for locale in [NativeSubscriptionLocale.en, .zh] {
            let bytes = try await port.read(.init(scope: nil, resource: .catalog(locale), nonce: UUID()))
            let catalog = try NativeSubscriptionCodec.catalog(bytes, locale: locale)
            #expect(catalog.locale == locale)
            #expect(!catalog.subscriptionDescription.isEmpty)
        }
        #expect(port.currentScope == nil)
    }
    @Test func actualCompositionNeverInventsPrivateEntitlement() async throws {
        let scope = NativeSubscriptionScope(endpoint: "https://example.invalid", ownerID: "00000000-0000-4000-8000-000000000001", mobileEpoch: 1, generation: 1)
        let port = NativeSubscriptionDevelopmentPort(scope: { scope })
        await #expect(throws: (any Error).self) {
            try await port.read(.init(scope: scope, resource: .entitlement, nonce: UUID()))
        }
    }
}
