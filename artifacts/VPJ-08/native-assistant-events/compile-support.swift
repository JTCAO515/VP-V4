import Foundation
struct NativeDataScope: Hashable, Sendable {
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let generation: Int
}
enum NativeDataError: Error { case invalidResponse, staleSessionResponse }
