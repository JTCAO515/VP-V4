import Foundation
import Observation

/// One feature-owned family, initialized once per process. Crash recovery can only
/// remove this feature's old clips; another live sheet cannot erase an active clip.
@MainActor final class NativeLocalVoiceResources {
    static let shared = NativeLocalVoiceResources(files: NativeVoiceAudioFiles(
        root: URL.cachesDirectory.appendingPathComponent("NativeLocalDraftVoice", isDirectory: true)))
    let files: NativeVoiceAudioFiles
    private(set) var owner: UUID?
    private(set) var cleanupFailed = false
    func blockAfterCleanupFailure() { cleanupFailed = true }
    init(files: NativeVoiceAudioFiles) { self.files = files }
    func acquire(_ id: UUID) -> Bool {
        guard owner == nil, !files.cleanupPending, !cleanupFailed else { return false }
        owner = id; return true
    }
    func release(_ id: UUID) { if owner == id { owner = nil } }
}

enum NativeLocalVoiceFailure: Equatable {
    case audio(NativeVoiceAudioFailure), empty, contextChanged, busy
}

/// No transport, durable transcript, Goal, Task or automatic send authority.
@MainActor @Observable final class NativeLocalVoiceCapture {
    private(set) var phase: NativeVoiceAudioPhase = .idle
    private(set) var transcript: String?
    private(set) var failure: NativeLocalVoiceFailure?
    private(set) var context: NativeLocalVoiceContext?
    @ObservationIgnored private let driver: any NativeVoiceAudioDriver
    @ObservationIgnored private let resources: NativeLocalVoiceResources
    @ObservationIgnored private let current: () -> NativeLocalVoiceContext
    @ObservationIgnored private let eligible: () -> Bool
    @ObservationIgnored private let wait: @Sendable (Double) async throws -> Void
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var audioStarted = false
    @ObservationIgnored private var resourceOwner: UUID?
    @ObservationIgnored private var permissionTask: Task<Void, Never>?
    @ObservationIgnored private var deadline: Task<Void, Never>?
    @ObservationIgnored private var lifetime: Task<Void, Never>?
    var cleanupPending: Bool { resources.files.cleanupPending || resources.cleanupFailed }

    init(driver: any NativeVoiceAudioDriver, resources: NativeLocalVoiceResources,
         current: @escaping () -> NativeLocalVoiceContext, eligible: @escaping () -> Bool,
         wait: @escaping @Sendable (Double) async throws -> Void = { try await Task.sleep(for: .seconds($0)) }) {
        self.driver = driver; self.resources = resources
        self.current = current; self.eligible = eligible; self.wait = wait
        driver.onInterruption = { [weak self] in self?.cancel(.audio(.interrupted)) }
        driver.onRecordingLimit = { [weak self] in self?.cancel(.audio(.timedOut)) }
        if cleanupPending { failure = .audio(.cleanupRequired) }
    }

    isolated deinit {
        permissionTask?.cancel(); deadline?.cancel(); lifetime?.cancel()
        if let resourceOwner {
            driver.cancelRecognition()
            if audioStarted { driver.stopAudio() }
            do { try resources.files.eraseAll() } catch { resources.blockAfterCleanupFailure() }
            resources.release(resourceOwner)
        }
    }

    /// Called only by an explicit Start button, never appearance/foreground.
    func begin() {
        guard phase == .idle else { return }
        guard !cleanupPending else { failure = .audio(.cleanupRequired); return }
        cancel()
        let stamp = current()
        guard eligible(), let locale = stamp.identity.recognitionLocale,
              driver.recognitionAvailable(localeIdentifier: locale) else {
            failure = .audio(.unavailable); return
        }
        let own = UUID()
        guard resources.acquire(own) else { failure = .busy; return }
        generation = own; resourceOwner = own; context = stamp
        phase = .requestingPermission
        armDeadline(NativeVoiceAudioLimits.recognitionTimeout, own: own)
        permissionTask = Task { [weak self] in
            guard let self else { return }
            let granted = await self.driver.requestPermissions()
            guard self.generation == own, self.phase == .requestingPermission, !Task.isCancelled else { return }
            guard self.valid(own) else { self.cancel(.contextChanged); return }
            self.permissionTask = nil
            guard granted, self.driver.permissionsGranted else { self.cancel(.audio(.permissionDenied)); return }
            guard self.driver.recognitionAvailable(localeIdentifier: locale) else { self.cancel(.audio(.unavailable)); return }
            do {
                let clip = try self.resources.files.create(id: own)
                self.audioStarted = true
                try self.driver.startRecording(url: clip.url)
                self.phase = .recording
                self.armDeadline(NativeVoiceAudioLimits.maximumRecordingSeconds, own: own)
                let wait = self.wait
                self.lifetime = Task { [weak self] in
                    try? await wait(NativeVoiceAudioLimits.temporaryLifetime)
                    guard !Task.isCancelled, let self, self.generation == own else { return }
                    self.cancel(.audio(.timedOut))
                }
            } catch { self.cancel(.audio(self.audioFailure(error))) }
        }
    }

    func stop() {
        guard phase == .recording else {
            if phase == .requestingPermission { cancel() }
            return
        }
        let own = generation
        guard valid(own), let context, let locale = context.identity.recognitionLocale,
              let clip = resources.files.receipt else { cancel(.contextChanged); return }
        do {
            let measurement = try driver.stopRecording()
            audioStarted = false
            guard measurement.valid else { throw NativeVoiceAudioFailure.invalidAudio }
            phase = .recognizing
            armDeadline(NativeVoiceAudioLimits.recognitionTimeout, own: own)
            try driver.recognize(url: resources.files.readable(clip), localeIdentifier: locale) { [weak self] text in
                self?.finish(text, own: own)
            }
        } catch { cancel(.audio(audioFailure(error))) }
    }

    private func finish(_ text: String?, own: UUID) {
        guard generation == own, phase == .recognizing else { return }
        guard valid(own) else { cancel(.contextChanged); return }
        guard driver.permissionsGranted else { cancel(.audio(.permissionDenied)); return }
        let value = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !value.isEmpty else { cancel(.empty); return }
        guard value.utf16.count <= NativeVoiceAudioLimits.maximumCharacters else { cancel(.audio(.transcriptTooLong)); return }
        // Delete audio successfully before exposing a reviewable transcript.
        guard cleanOwnedAudio() else { cancel(.audio(.cleanupRequired)); return }
        permissionTask?.cancel(); permissionTask = nil
        deadline?.cancel(); deadline = nil
        phase = .idle; transcript = value
        // Keep the TTL while review is open, and generation until explicit adoption.
    }

    /// Synchronous MainActor transaction: recheck identity + original revision,
    /// then write only the local draft. No suspension between check and write.
    @discardableResult func adopt(into state: NativeFrontendState) -> Bool {
        guard let text = transcript, let context,
              context.state == ObjectIdentifier(state), valid(generation),
              state.draft == context.originalDraft,
              state.localDraftRevision == context.revision else {
            cancel(.contextChanged); return false
        }
        let draft = context.originalDraft.isEmpty ? text : context.originalDraft + "\n" + text
        guard draft.count <= 2_000 else { cancel(.audio(.transcriptTooLong)); return false }
        cancel()
        state.draft = draft
        return true
    }

    func invalidateIfChanged() {
        guard context != nil else { return }
        if !eligible() || current() != context { cancel(.contextChanged) }
    }

    func cancel(_ reason: NativeLocalVoiceFailure? = nil) {
        generation = UUID()
        permissionTask?.cancel(); permissionTask = nil
        deadline?.cancel(); deadline = nil
        lifetime?.cancel(); lifetime = nil
        transcript = nil; context = nil; phase = .idle
        failure = cleanOwnedAudio() ? reason : .audio(.cleanupRequired)
    }

    private func valid(_ own: UUID) -> Bool {
        generation == own && eligible() && context == current()
    }
    private func cleanOwnedAudio() -> Bool {
        guard let owner = resourceOwner else { return !cleanupPending }
        guard resources.owner == owner else { return false }
        driver.cancelRecognition()
        if audioStarted { driver.stopAudio(); audioStarted = false }
        do {
            try resources.files.eraseAll()
            resources.release(owner); resourceOwner = nil
            return true
        } catch { resources.blockAfterCleanupFailure(); return false }
    }
    private func armDeadline(_ seconds: Double, own: UUID) {
        deadline?.cancel()
        deadline = Task { [weak self] in
            guard let wait = self?.wait else { return }
            try? await wait(seconds)
            guard !Task.isCancelled, let self, self.generation == own else { return }
            self.cancel(.audio(.timedOut))
        }
    }
    private func audioFailure(_ error: Error) -> NativeVoiceAudioFailure {
        error as? NativeVoiceAudioFailure ?? .unavailable
    }
}
