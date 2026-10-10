import Foundation
import CryptoKit

/// Fixed source set: no Keychain enumeration, arbitrary service, or credential envelope.
enum NativeJournalDataSourceID: String, CaseIterable, Codable, Identifiable {
    case coverage, materialReference, profile, conversation, serviceOperation, turn, reservation
    case community, recovery, tripLifecycle, travelerBrief, pdf, communitySafety
    case notificationData, coverageProgress, archive, experience, placeAction, scopedTrip, result
    case notification, guide, ask, tripSupport, deviceDelete, readinessSave, linkedTripDelete, memoryDelete, tripDelete
    case assistantEventsCursor
    var id: String { rawValue }
}

enum NativeJournalDataReadState: String, Codable { case absent, pending, projection, unavailable }
enum NativeJournalDataExportKind: String, Codable { case originalOperation, metadataOnly }

/// Only validated operation bytes or explicitly selected, non-secret metadata can enter this wire.
struct NativeJournalDataExportRecord: Codable, Equatable {
    let source: NativeJournalDataSourceID
    let state: NativeJournalDataReadState
    let kind: NativeJournalDataExportKind
    let operationID: String?
    let tripID: String?
    let action: String?
    let originalOperationBytes: Data?
    let contentBoundary: String
    var objectID: String? = nil
    var assistantEventsCursor: NativeAssistantEventsCursor.Metadata? = nil
}

struct NativeJournalDataSnapshot: Equatable {
    let record: NativeJournalDataExportRecord
    /// Process-private CAS. This is never serialized, traced or logged.
    let originalIdentity: Data?
    /// Original immutable request identity. Only original acknowledgement fields may differ.
    let operationIdentity: Data?
    init(record: NativeJournalDataExportRecord, originalIdentity: Data?, operationIdentity: Data? = nil) {
        self.record = record; self.originalIdentity = originalIdentity
        self.operationIdentity = operationIdentity ?? originalIdentity
    }
    var valid: Bool {
        guard record.contentBoundary.utf8.count <= 128,
              [record.operationID, record.tripID, record.objectID].allSatisfy({ $0 == nil || UUID(uuidString: $0!) != nil }),
              record.action == nil || record.action!.utf8.count <= 64 else { return false }
        switch record.state {
        case .absent, .unavailable:
            return record.assistantEventsCursor == nil && originalIdentity == nil && operationIdentity == nil && record.originalOperationBytes == nil
                && record.operationID == nil && record.tripID == nil && record.objectID == nil && record.action == nil && record.kind == .metadataOnly
        case .projection:
            return record.source == .assistantEventsCursor && record.kind == .metadataOnly &&
                record.assistantEventsCursor?.valid == true && originalIdentity != nil && !originalIdentity!.isEmpty && originalIdentity!.count <= 4096 &&
                operationIdentity == originalIdentity && record.originalOperationBytes == nil &&
                record.operationID == nil && record.tripID == nil && record.action == nil && record.objectID == nil
        case .pending:
            guard record.assistantEventsCursor == nil, record.source != .assistantEventsCursor else { return false }
            let byteSources: Set<NativeJournalDataSourceID> = [.materialReference, .profile, .conversation, .turn, .notificationData, .coverageProgress, .archive, .result]
            return originalIdentity != nil && !originalIdentity!.isEmpty && originalIdentity!.count <= 262_144
            && operationIdentity != nil && !operationIdentity!.isEmpty && operationIdentity!.count <= 262_144
            && (record.kind == .metadataOnly ? record.originalOperationBytes == nil
                : byteSources.contains(record.source) && record.originalOperationBytes != nil && !record.originalOperationBytes!.isEmpty && record.originalOperationBytes!.count <= 8192)
        }
    }
}

struct NativeJournalDataSelection: Equatable {
    let id: UUID
    let actor: NativeCommunitySafetyActor
    let createdAt: Date
    let uptime: TimeInterval
    let snapshots: [NativeJournalDataSnapshot]
    func valid(current: NativeCommunitySafetyActor?, now: Date, uptime clock: TimeInterval) -> Bool {
        current == actor && now >= createdAt && now.timeIntervalSince(createdAt) < 30
        && clock >= uptime && clock - uptime < 30 && !snapshots.isEmpty
        && snapshots.count <= 10_000 && snapshots.allSatisfy(\.valid)
        && Set(snapshots.map { $0.record.source }).count == snapshots.count
    }
}

/// An original module emits this only after its own receipt decoder/projection/complete succeeds.
/// A disappeared key, cancellation, expiry or logout alone is not evidence of completion.
struct NativeJournalDataCompletion: Equatable {
    let source: NativeJournalDataSourceID
    let actor: NativeCommunitySafetyActor
    let operationIdentity: Data
    let receiptIdentity: String
    let completedAt: Date
}

struct NativeJournalDataReceipt: Codable, Equatable, Identifiable {
    let id: UUID
    let source: NativeJournalDataSourceID
    let completedAt: Date
    let originalReceiptIdentity: String
    let actorBinding: String
    let physicalPendingAbsent: Bool
    let scope: String
    let serverData: String
    let externalCopies: String
}

func nativeJournalDataActorBinding(_ actor: NativeCommunitySafetyActor) -> String {
    let fields = [actor.scope.endpoint, actor.scope.subject, String(actor.scope.mobileEpoch),
                  String(actor.scope.generation), actor.sessionID]
    return SHA256.hash(data: Data(fields.joined(separator: "\n").utf8)).map { String(format: "%02x", $0) }.joined()
}

@MainActor protocol NativeJournalDataSource: AnyObject {
    func read(_ actor: NativeCommunitySafetyActor) throws -> [NativeJournalDataSnapshot]
    func snapshot(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) throws -> NativeJournalDataSnapshot?
    func completion(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) -> NativeJournalDataCompletion?
    func physicallyAbsent(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) throws -> Bool
}

extension NativeJournalDataSource {
    func snapshot(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) throws -> NativeJournalDataSnapshot? {
        try read(actor).first { $0.record.source == source }
    }
}
