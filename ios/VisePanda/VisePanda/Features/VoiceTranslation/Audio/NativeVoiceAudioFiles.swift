import Foundation

/// A single local, protected copy. No uploaded audio, export, account-named folders or reusable history.
@MainActor final class NativeVoiceAudioFiles {
    struct Receipt: Equatable {
        let id: UUID
        let url: URL
        let expiresAt: Date
    }
    let root: URL
    private let manager: FileManager
    private(set) var receipt: Receipt?
    private(set) var cleanupPending = false

    init(root: URL, manager: FileManager = .default) {
        self.root = root; self.manager = manager
        // Crash recovery expires all prior captures rather than reviving a previous account's audio.
        do { try eraseAll() } catch { cleanupPending = true }
    }

    func create(id: UUID, now: Date = Date()) throws -> Receipt {
        guard !cleanupPending else { throw NativeVoiceAudioFailure.cleanupRequired }
        try eraseAll()
        do {
            #if os(iOS)
            try manager.createDirectory(at: root, withIntermediateDirectories: true,
                                        attributes: [.protectionKey: FileProtectionType.complete])
            #else
            try manager.createDirectory(at: root, withIntermediateDirectories: true)
            #endif
            var writable = root
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true
            try writable.setResourceValues(excluded)
            let url = root.appendingPathComponent(id.uuidString).appendingPathExtension("wav")
            #if os(iOS)
            try Data().write(to: url, options: [.atomic, .completeFileProtection])
            #else
            try Data().write(to: url, options: [.atomic])
            #endif
            let value = Receipt(id: id, url: url, expiresAt: now.addingTimeInterval(NativeVoiceAudioLimits.temporaryLifetime))
            receipt = value
            return value
        } catch {
            do { try eraseAll() } catch { cleanupPending = true; throw NativeVoiceAudioFailure.cleanupRequired }
            throw error
        }
    }

    func readable(_ expected: Receipt, now: Date = Date()) throws -> URL {
        guard !cleanupPending, receipt == expected, expected.expiresAt > now,
              manager.fileExists(atPath: expected.url.path) else { throw NativeVoiceAudioFailure.invalidAudio }
        return expected.url
    }

    func eraseAll() throws {
        do {
            if manager.fileExists(atPath: root.path) { try manager.removeItem(at: root) }
            receipt = nil; cleanupPending = false
        } catch {
            cleanupPending = true
            throw NativeVoiceAudioFailure.cleanupRequired
        }
    }
}
