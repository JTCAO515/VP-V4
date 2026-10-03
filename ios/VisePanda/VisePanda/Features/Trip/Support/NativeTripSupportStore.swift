import Foundation
import Observation

@MainActor @Observable
final class NativeTripSupportStore {
    private(set) var target: NativeTripSupportTarget?
    private(set) var read: NativeTripSupportRead?
    private(set) var prepared: [NativePreparedTripSupport] = []
    private(set) var selectedIDs: Set<String> = []
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var confirmationUnknown = false
    private var generation = 0
    private var proposalReference: String?
    private var frozenChoices: [NativeTripSupportChoice]?
    private(set) var confirmationKey: String?

    static func reference(_ proposal: NativeTripPending.Proposal) -> String {
        "\(proposal.id):\(proposal.revision):\(proposal.baseTripVersion):\(proposal.digest)"
    }
    var selectionReference: String? {
        guard let proposalReference, !selectedIDs.isEmpty else { return nil }
        return proposalReference + "|" + prepared.filter { selectedIDs.contains($0.id) }.sorted { $0.id<$1.id }.map { "\($0.receiptId):\($0.version):\($0.sourceDigest)" }.joined(separator:"|")
    }
    func bind(_ target: NativeTripSupportTarget?, proposal: NativeTripPending.Proposal? = nil) {
        let reference=proposal.map(Self.reference)
        guard self.target != target || proposalReference != reference else { return }
        let sameProposal = target?.actor == self.target?.actor && target?.tripID == self.target?.tripID && target?.tripVersion == self.target?.tripVersion && reference != nil && proposalReference == reference
        generation += 1
        self.target=target
        proposalReference=reference
        read=nil; busy=false; notice=nil
        if !sameProposal {
            prepared=[]; selectedIDs=[]; frozenChoices=nil; confirmationKey=nil; confirmationUnknown=false
        }
    }
    func refresh(current: () -> NativeDataScope?, get: (NativeTripSupportTarget) async throws -> Data) async {
        guard !busy, let target, target.valid, current()==target.actor else { return }
        let epoch=generation
        busy=true; read=nil; notice=nil
        defer { if generation==epoch { busy=false } }
        do {
            let bytes=try await get(target)
            guard generation==epoch, self.target==target, current()==target.actor else { return }
            read=try NativeTripSupportRead.decode(bytes,target:target)
            notice=read?.entries.isEmpty == true ? "noMappedSupport" : nil
        } catch {
            guard generation==epoch, current()==target.actor else { return }
            read=nil; notice="supportUnavailable"
        }
    }
    /// Only server-issued receipts for the currently visible proposal may enter selection.
    func installPrepared(_ bytes: [Data], target: NativeTripSupportTarget, proposal: NativeTripPending.Proposal) throws {
        guard !confirmationUnknown, self.target==target, proposalReference==Self.reference(proposal), bytes.count<=8 else { throw NativeDataError.invalidResponse }
        let receipts=try bytes.map { try NativePreparedTripSupport.decode($0,target:target,proposal:proposal) }
        let identities=receipts.map { "\($0.dayId):\($0.itemId):\($0.scope.rawValue)" }
        guard Set(receipts.map(\.id)).count==receipts.count, Set(identities).count==receipts.count else { throw NativeDataError.invalidResponse }
        let other=prepared.filter { $0.dayId != target.dayID || $0.itemId != target.itemID }
        guard other.count+receipts.count<=64 else { throw NativeDataError.invalidResponse }
        let replaced=Set(prepared.filter { $0.dayId==target.dayID && $0.itemId==target.itemID }.map(\.id))
        selectedIDs.subtract(replaced)
        prepared=other+receipts; frozenChoices=nil; confirmationKey=nil
        notice=receipts.isEmpty ? "noMappedSupport" : nil
    }
    func select(_ receiptID: String, chosen: Bool, now: Date=Date()) {
        guard !busy, !confirmationUnknown, let receipt=prepared.first(where:{ $0.id==receiptID }),
              NativeKnowledgeRead.date(receipt.expiresAt).map({ $0>now })==true else { return }
        if chosen { if selectedIDs.count<8 { selectedIDs.insert(receiptID) } }
        else { selectedIDs.remove(receiptID) }
        confirmationKey=nil; frozenChoices=nil
    }
    /// Call only after the original proposal diff and this exact receipt selection were reviewed.
    func freezeConfirmation(reviewedSelection: String, proposal: NativeTripPending.Proposal, current: NativeDataScope?, now: Date=Date()) throws -> [NativeTripSupportChoice] {
        guard !confirmationUnknown, let target, target.actor==current, target.tripVersion==proposal.baseTripVersion,
              !proposal.stale, proposal.status=="pending", proposalReference==Self.reference(proposal), selectionReference==reviewedSelection,
              (1...8).contains(selectedIDs.count) else { throw NativeDataError.invalidResponse }
        let receipts=prepared.filter { selectedIDs.contains($0.id) }.sorted { $0.id<$1.id }
        guard receipts.count==selectedIDs.count, receipts.allSatisfy({ NativeKnowledgeRead.date($0.expiresAt).map({ $0>now })==true && $0.tripId==target.tripID && $0.proposalId==proposal.id && $0.proposalRevision==proposal.revision && $0.baseVersion==target.tripVersion }) else { throw NativeDataError.invalidResponse }
        let choices=receipts.map(\.selection)
        frozenChoices=choices
        confirmationKey=UUID().uuidString.lowercased()
        confirmationUnknown=true
        return choices
    }
    func confirmed(key: String, choices: [NativeTripSupportChoice]) throws {
        guard confirmationUnknown, key==confirmationKey, choices==frozenChoices else { throw NativeDataError.invalidResponse }
        confirmationUnknown=false; frozenChoices=nil; confirmationKey=nil; prepared=[]; selectedIDs=[]
    }
    func unavailable() { notice="supportUnavailable" }
}
