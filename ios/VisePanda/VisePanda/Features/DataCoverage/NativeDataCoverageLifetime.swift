import Foundation

/// A coverage receipt is usable only in the actor and foreground generation that requested it.
/// Opening a module's screen is never an operation receipt.
struct NativeDataCoverageLifetime {
    private(set) var generation = UUID()
    private(set) var scope: NativeDataScope?
    private(set) var active = false

    mutating func bind(_ next: NativeDataScope?, active: Bool) {
        if next != scope || self.active != active {
            generation = UUID()
            scope = next
            self.active = active
        }
    }

    mutating func invalidate() { generation = UUID(); active = false }

    func accepts(_ captured: UUID, scope capturedScope: NativeDataScope?, current: NativeDataScope?) -> Bool {
        active && captured == generation && capturedScope != nil && capturedScope == scope && current == scope
    }
}
