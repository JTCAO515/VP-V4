// Exact unchanged production boundary declarations; standalone compile only. No Keychain implementation.
import Foundation
import Security
struct NativeDataScope: Hashable, Sendable {
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let generation: Int
}

@MainActor
protocol NativeCredentialVault {
    func write(_ data: Data, service: String, owner: String) -> OSStatus
    func read(service: String, owner: String) -> (OSStatus, Data?)
    func remove(service: String, owner: String) -> OSStatus
}
