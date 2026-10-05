import Foundation

/// A local preview only. Neither an identity claim nor permission to publish.
struct NativeCommunityDraft: Equatable {
    var title = ""
    var content = ""
    var consent = false
    var kind = "experience"
    var benefitDisclosure = ""
    var place: NativeCommunityPlaceSelection?
    var associationConfirmed = false
    var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.utf16.count <= 160
        && !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && content.utf16.count <= 4000
        && benefitDisclosure.utf16.count <= 400 && !benefitDisclosure.contains("\u{0}")
        && ["experience", "help"].contains(kind) && !title.contains("\u{0}") && !content.contains("\u{0}") && associationConfirmed && consent
    }
}

struct NativeCommunityPlaceSelection: Equatable {
    let tripID: String
    let referenceID: String
    let label: String
    let actor: NativeCommunityActor
    let tripVersion: Int
    let row: NativeSavedPlaceRow
    let cursor: NativeSavedPlaceCursor?
}
