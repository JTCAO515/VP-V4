import Foundation

/// Ephemeral identity supplied by the existing Session. Never persisted by this feature.
struct NativeSubscriptionScope: Equatable, Sendable {
    let endpoint: String
    let ownerID: String
    let mobileEpoch: Int
    let generation: Int

    var valid: Bool {
        !endpoint.isEmpty && endpoint.utf8.count <= 2_048 && UUID(uuidString: ownerID) != nil
            && ownerID == ownerID.lowercased() && mobileEpoch > 0 && generation >= 0
    }
}

enum NativeSubscriptionLocale: String, Sendable { case zh, en }
enum NativeSubscriptionResource: Equatable, Sendable { case catalog(NativeSubscriptionLocale), entitlement }

struct NativeSubscriptionRequest: Equatable, Sendable {
    /// Only public catalog reads may omit scope. Private entitlement reads must bind a valid scope.
    let scope: NativeSubscriptionScope?
    let resource: NativeSubscriptionResource
    let nonce: UUID
}

enum NativeSubscriptionError: Error { case unavailable, invalidResponse, staleResponse }

/// GET-only capability: no purchase, restore, account operation, receipt or grant write exists here.
/// Main's Session adapter must retain its existing Bearer/Origin/endpoint and response-scope checks.
@MainActor protocol NativeSubscriptionReadPort {
    var currentScope: NativeSubscriptionScope? { get }
    func read(_ request: NativeSubscriptionRequest) async throws -> Data
}

/// Unconfigured means unavailable. It never supplies a sample entitlement or a synthetic balance.
@MainActor struct NativeSubscriptionUnavailablePort: NativeSubscriptionReadPort {
    var currentScope: NativeSubscriptionScope? { nil }
    func read(_ request: NativeSubscriptionRequest) async throws -> Data { throw NativeSubscriptionError.unavailable }
}

/// Concrete injection seam for Main's existing authenticated, read-only Session factory.
@MainActor struct NativeSubscriptionSessionReadPort: NativeSubscriptionReadPort {
    let scope: @MainActor () -> NativeSubscriptionScope?
    let get: @MainActor (NativeSubscriptionRequest) async throws -> Data
    var currentScope: NativeSubscriptionScope? { scope() }

    func read(_ request: NativeSubscriptionRequest) async throws -> Data {
        if case .entitlement = request.resource {
            guard let captured = request.scope, captured.valid, currentScope == captured else {
                throw NativeSubscriptionError.staleResponse
            }
        }
        let bytes = try await get(request)
        guard !Task.isCancelled else { throw NativeSubscriptionError.staleResponse }
        if case .entitlement = request.resource {
            guard currentScope == request.scope else { throw NativeSubscriptionError.staleResponse }
        }
        return bytes
    }
}
