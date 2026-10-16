// Verification dependency only: exact value-type declaration from App/NativeSession.swift at base407082fd.
// The actual App owns this type; never register this helper in PBX.
struct NativeDataScope: Hashable, Sendable {
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let generation: Int
}
