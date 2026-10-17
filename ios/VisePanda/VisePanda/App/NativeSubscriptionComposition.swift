import Foundation

/// Development-only composition: the bundled public projection comes from the sole catalog
/// generator. Private verification has no configured authority, credentials or network path.
@MainActor struct NativeSubscriptionDevelopmentPort: NativeSubscriptionReadPort {
    let scope: @MainActor () -> NativeSubscriptionScope?
    var currentScope: NativeSubscriptionScope? { scope() }

    func read(_ request: NativeSubscriptionRequest) async throws -> Data {
        guard !Task.isCancelled else { throw NativeSubscriptionError.staleResponse }
        switch request.resource {
        case .catalog(let locale):
            guard let url = Bundle.main.url(forResource: "presentation.\(locale.rawValue)", withExtension: "json") else {
                throw NativeSubscriptionError.unavailable
            }
            let bytes = try Data(contentsOf: url)
            guard bytes.count <= 16_384 else { throw NativeSubscriptionError.invalidResponse }
            let projection = try JSONSerialization.jsonObject(with: bytes)
            return try JSONSerialization.data(withJSONObject: ["data": projection])
        case .entitlement:
            // No false none/active projection. Ordinary SQL roles remain denied and this
            // development composition does not acquire an administrator or legacy Pass port.
            throw NativeSubscriptionError.unavailable
        }
    }
}

extension NativeSession {
    var subscriptionReadScope: NativeSubscriptionScope? {
        guard let dataScope else { return nil }
        return .init(endpoint: dataScope.endpoint, ownerID: dataScope.subject,
                     mobileEpoch: dataScope.mobileEpoch, generation: dataScope.generation)
    }
    var subscriptionDevelopmentPort: NativeSubscriptionDevelopmentPort {
        .init(scope: { [weak self] in self?.subscriptionReadScope })
    }
}
