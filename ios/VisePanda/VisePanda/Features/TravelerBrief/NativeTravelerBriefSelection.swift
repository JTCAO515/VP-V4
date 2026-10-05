import Foundation

/// An owner review is local to one Case and starts with no fields selected.
/// A refreshed source, recipient, grant or session invalidates the entire review.
struct NativeTravelerBriefSelection: Equatable {
    struct Boundary: Equatable {
        let actor: NativeDataScope
        let caseID: String
        let purpose: String
        let recipientID: String
        let grantRevision: Int
        let briefRevision: Int
        let sourceFrontier: String
    }

    let boundary: Boundary
    let availableKeys: Set<String>
    private(set) var selectedKeys: Set<String> = []
    private(set) var confirmed = false

    init(boundary: Boundary, availableKeys: Set<String>) {
        self.boundary = boundary
        self.availableKeys = availableKeys
    }

    mutating func select(_ key: String, include: Bool) {
        guard availableKeys.contains(key) else { return }
        confirmed = false
        if include { selectedKeys.insert(key) } else { selectedKeys.remove(key) }
    }

    mutating func confirm() { confirmed = !selectedKeys.isEmpty }

    func authorizedKeys(current: Boundary) throws -> [String] {
        guard current == boundary, confirmed, !selectedKeys.isEmpty,
              selectedKeys.isSubset(of: availableKeys) else {
            throw NativeDataError.staleSessionResponse
        }
        return selectedKeys.sorted()
    }
}
