import Foundation

/// In-process evidence of an original decoder's verified terminal path, never an RPC or executor.
@MainActor final class NativeJournalDataEvidence {
    struct Ticket {
        let id: UUID
        let source: NativeJournalDataSourceID
        let actor: NativeCommunitySafetyActor
        let originalIdentity: Data
    }
    private var completions: [NativeJournalDataSourceID: NativeJournalDataCompletion] = [:]
    private var tickets: [UUID: Ticket] = [:]
    private var actor: NativeCommunitySafetyActor?
    func bind(_ current: NativeCommunitySafetyActor?) {
        guard current != actor else { return }; actor = current; tickets = [:]; completions = [:]
    }
    func begin(_ source: NativeJournalDataSourceID, using reader: any NativeJournalDataSource,
               current: NativeCommunitySafetyActor?) -> Ticket? {
        bind(current)
        guard let current, let row = try? reader.read(current).first(where: { $0.record.source == source }),
              row.record.state == .pending, let original = row.originalIdentity else { return nil }
        let ticket = Ticket(id: UUID(), source: source, actor: current, originalIdentity: original)
        tickets = tickets.filter { $0.value.source != source }; tickets[ticket.id] = ticket
        completions[source] = nil; return ticket
    }
    /// Call synchronously only after the original module's receipt and projection/complete path.
    /// This checks physical absence itself; a failed remove cannot yield a receipt.
    func finish(_ ticket: Ticket?, originalReceiptIdentity: String, using reader: any NativeJournalDataSource,
                current: NativeCommunitySafetyActor?, now: Date = Date()) {
        bind(current)
        guard let ticket, let armed = tickets.removeValue(forKey: ticket.id), armed.id == ticket.id,
              armed.actor == current, !originalReceiptIdentity.isEmpty, originalReceiptIdentity.count <= 128,
              (try? reader.physicallyAbsent(source: armed.source, actor: armed.actor)) == true else { return }
        completions[armed.source] = .init(source: armed.source, actor: armed.actor,
            originalIdentity: armed.originalIdentity, receiptIdentity: originalReceiptIdentity, completedAt: now)
    }
    func completion(_ source: NativeJournalDataSourceID, current: NativeCommunitySafetyActor?) -> NativeJournalDataCompletion? {
        bind(current); guard let current, completions[source]?.actor == current else { return nil }; return completions[source]
    }
}

/// Injected into an original Store. It observes that Store's existing successful path.
@MainActor struct NativeJournalDataObservation {
    let begin: () -> NativeJournalDataEvidence.Ticket?
    let finish: (NativeJournalDataEvidence.Ticket?, String) -> Void
}
