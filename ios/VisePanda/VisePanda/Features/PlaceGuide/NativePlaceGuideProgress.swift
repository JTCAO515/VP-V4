import Foundation

/// Conservative system-speech position; it never asserts an acoustic listening measurement.
struct NativePlaceGuideProgress: Equatable {
    private(set) var segmentID: String?
    private(set) var characters = 0
    private(set) var completedSegmentIDs: Set<String> = []

    mutating func advance(segmentID: String, characters: Int, total: Int, finished: Bool) {
        guard total > 0, characters >= 0, characters <= total else { return }
        if self.segmentID != segmentID { self.segmentID = segmentID; self.characters = 0 }
        self.characters = max(self.characters, characters)
        if finished && characters == total { completedSegmentIDs.insert(segmentID) }
    }

    mutating func replay() { segmentID = nil; characters = 0; completedSegmentIDs = [] }
}
