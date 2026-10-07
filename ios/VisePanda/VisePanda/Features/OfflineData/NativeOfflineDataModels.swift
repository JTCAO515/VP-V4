import Foundation

/// Only the three sources actually managed by NativeOfflineTripStore.
/// An index entry is a selection aid, never an authorization to read cached text.
enum NativeOfflineDataSource: String, Codable, CaseIterable, Identifiable {
    case userDraft, confirmedText, lodging
    var id: String { rawValue }
    var suffix: String {
        switch self {
        case .userDraft: return ".draft.aesgcm"
        case .confirmedText: return ".confirmed.aesgcm"
        case .lodging: return ".lodging.aesgcm"
        }
    }
}

struct NativeOfflineDataInventory: Equatable {
    let namespace: NativeOfflineTripNamespace
    let indexed: Bool
    let sources: Set<NativeOfflineDataSource>
    /// Hashes ciphertext, so preview CAS does not read expired text.
    let fingerprint: String
    let fenced: Bool
}

/// Captured before a user action suspends. The nonce belongs to this request only.
struct NativeOfflineDataWriteTicket {
    let namespace: NativeOfflineTripNamespace
    let generation: Int
    let nonce: String
    let startedUptime: TimeInterval
}

/// Current namespace generation and cleanup admission; no content or command body.
struct NativeOfflineDataFence: Codable, Equatable {
    let schemaVersion: String
    let namespace: NativeOfflineTripNamespace
    let operationID: String
    let generation: Int
    let cleanup: Bool
    let startedAt: Date
    var valid: Bool {
        schemaVersion == "native-offline-cleanup-fence/1" && namespace.valid && UUID(uuidString: operationID) != nil && generation > 0
    }
}

/// Immutable, local evidence. It makes no server deletion or external-copy claim.
struct NativeOfflineDataCleanupReceipt: Codable, Equatable {
    let schemaVersion: String
    let namespace: NativeOfflineTripNamespace
    let operationID: String
    let verifiedAt: Date
    let absentSources: [NativeOfflineDataSource]
    var valid: Bool {
        schemaVersion == "native-offline-cleanup-receipt/1" && namespace.valid && UUID(uuidString: operationID) != nil &&
        absentSources == NativeOfflineDataSource.allCases
    }
}

struct NativeOfflineDataSourceReceipt: Codable, Equatable, Identifiable {
    enum State: String, Codable { case absent, included, blocked }
    let source: NativeOfflineDataSource
    let state: State
    let reason: String
    let sourceDigest: String?
    var id: String { source.rawValue }
}

/// Original user records plus the exact signed permit wire; never arbitrary file bytes.
struct NativeOfflineDataExport: Encodable {
    let schemaVersion = "native-selected-trip-offline-export/1"
    let namespace: NativeOfflineTripNamespace
    let operationID: String
    let createdAt: Date
    let expiresAt: Date
    let receipts: [NativeOfflineDataSourceReceipt]
    let draft: NativeOfflineTripDraft?
    let confirmedPermitWire: Data?
    let lodging: NativeLodgingLocalRecord?
    let boundaries = ["SELECTED_DEVICE_TRIP_ONLY", "SERVER_TRIP_UNCHANGED", "OTHER_TRIPS_UNCHANGED", "PENDING_COMMANDS_UNCHANGED", "EXTERNAL_COPIES_NOT_RECALLED"]
}
