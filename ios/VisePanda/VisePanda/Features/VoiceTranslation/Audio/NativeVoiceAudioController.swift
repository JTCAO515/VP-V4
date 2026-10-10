import Foundation
import Observation

/// System driver seam also permits synthetic PCM and callbacks without requesting device permissions.
@MainActor protocol NativeVoiceAudioDriver: AnyObject {
    var onInterruption: (@MainActor () -> Void)? { get set }
    var onRecordingLimit: (@MainActor () -> Void)? { get set }
    var permissionsGranted: Bool { get }
    func requestPermissions() async -> Bool
    func recognitionAvailable(localeIdentifier: String) -> Bool
    func startRecording(url: URL) throws
    func stopRecording() throws -> NativeVoiceAudioMeasurement
    func recognize(url: URL, localeIdentifier: String, completion: @escaping @MainActor @Sendable (String?) -> Void) throws
    func cancelRecognition()
    func installedVoiceAvailable(localeIdentifier: String) -> Bool
    func speak(text: String, localeIdentifier: String, completion: @escaping @MainActor @Sendable (Bool, Int) -> Void) throws
    func pauseSpeech() -> Bool
    func resumeSpeech() -> Bool
    func stopAudio()
}

extension NativeVoiceAudioDriver {
    func pauseSpeech() -> Bool { false }
    func resumeSpeech() -> Bool { false }
}

/// One push-to-talk capture and one explicitly selected final translation, scoped to the live session.
@MainActor @Observable final class NativeVoiceAudioController: NativeGuideCacheDataRenderer {
    private(set) var phase: NativeVoiceAudioPhase = .idle
    private(set) var failure: NativeVoiceAudioFailure?
    private(set) var transcript: NativeVoiceTranscript?
    private(set) var spokenCharacters = 0
    private(set) var playbackCharacters = 0
    /// Nil means no valid measurement; interrupted captures retain measured PCM duration, never cost=0.
    private(set) var recordedSeconds: Double?
    private(set) var scope: NativeDataScope?
    var cleanupPending: Bool { files.cleanupPending }
    var onFinalTranscript: (@MainActor (NativeVoiceTranscript) -> Void)?
    var onGuideProgress: (@MainActor (String, Bool, Int) -> Void)? { didSet { guideCallbackRevision = UUID() } }
    @ObservationIgnored private var guideCallbackRevision = UUID()
    private(set) var guidePlaybackID: String?
    private(set) var guidePaused = false

    @ObservationIgnored private let driver: any NativeVoiceAudioDriver
    @ObservationIgnored private let files: NativeVoiceAudioFiles
    @ObservationIgnored private var generation = UUID()
    private(set) var currentRecordingID: UUID?
    @ObservationIgnored private var recordingLocale: String?
    @ObservationIgnored private var permissionTask: Task<Void, Never>?
    @ObservationIgnored private var deadlineTask: Task<Void, Never>?
    @ObservationIgnored private var ttlTask: Task<Void, Never>?
    @ObservationIgnored private var finalTranslation: FinalTranslation?
    @ObservationIgnored private var startedTranslationIDs = Set<String>()
    @ObservationIgnored private var guideText: String?
    @ObservationIgnored private var guideLocale: String?
    @ObservationIgnored private var guideExpiresAt: Date?
    @ObservationIgnored private var guidePlaybackDeadline: Date?
    @ObservationIgnored private var guideOffset = 0

    private struct FinalTranslation: Equatable {
        let id: String
        let text: String
        let locale: String
    }

    init(driver: any NativeVoiceAudioDriver, files: NativeVoiceAudioFiles) {
        self.driver = driver; self.files = files
        driver.onInterruption = { [weak self] in self?.interrupt() }
        driver.onRecordingLimit = { [weak self] in self?.cancel(reason: .timedOut) }
        if files.cleanupPending { failure = .cleanupRequired }
    }

    func bind(scope: NativeDataScope?) {
        guard self.scope != scope else { return }
        cancel(); self.scope = scope; transcript = nil
        finalTranslation = nil; startedTranslationIDs = []
        spokenCharacters = 0; playbackCharacters = 0; recordedSeconds = nil
    }

    /// Called only from the user's press. Release invalidates a pending permission request as well.
    @discardableResult func beginRecording(localeIdentifier: String) -> UUID? {
        guard scope != nil, phase == .idle, !cleanupPending,
              ["en-US", "zh-CN"].contains(localeIdentifier) else { return nil }
        guard driver.recognitionAvailable(localeIdentifier: localeIdentifier) else { failure = .unavailable; return nil }
        generation = UUID(); let own = generation
        let id = UUID(); currentRecordingID = id; recordingLocale = localeIdentifier
        phase = .requestingPermission; failure = nil
        permissionTask = Task { [weak self] in
            guard let self else { return }
            let granted = await self.driver.requestPermissions()
            guard self.generation == own, self.phase == .requestingPermission, self.scope != nil, !Task.isCancelled else { return }
            self.permissionTask = nil
            guard granted, self.driver.permissionsGranted else { self.cancel(reason: .permissionDenied); return }
            guard self.driver.recognitionAvailable(localeIdentifier: localeIdentifier) else { self.cancel(reason: .unavailable); return }
            do {
                let receipt = try self.files.create(id: id)
                try self.driver.startRecording(url: receipt.url)
                self.phase = .recording; self.transcript = nil; self.recordedSeconds = nil
                self.finalTranslation = nil
                self.armDeadline(seconds: NativeVoiceAudioLimits.maximumRecordingSeconds, own: own)
                self.ttlTask = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(NativeVoiceAudioLimits.temporaryLifetime))
                    guard !Task.isCancelled, let self, self.generation == own else { return }
                    self.cancel(reason: .timedOut)
                }
            } catch { self.cancel(reason: self.audioFailure(error)) }
        }
        return id
    }

    func endRecording() {
        if phase == .requestingPermission { cancel(); return }
        guard phase == .recording, let scope, let id = currentRecordingID,
              let locale = recordingLocale, let receipt = files.receipt else { return }
        let own = generation
        deadlineTask?.cancel(); deadlineTask = nil
        do {
            let measured = try driver.stopRecording()
            guard measured.valid else { throw NativeVoiceAudioFailure.invalidAudio }
            recordedSeconds = measured.seconds
            guard driver.permissionsGranted else { throw NativeVoiceAudioFailure.permissionDenied }
            let url = try files.readable(receipt)
            phase = .recognizing
            armDeadline(seconds: NativeVoiceAudioLimits.recognitionTimeout, own: own)
            try driver.recognize(url: url, localeIdentifier: locale) { [weak self] text in
                guard let self, self.generation == own, self.scope == scope, self.phase == .recognizing,
                      self.currentRecordingID == id else { return }
                guard self.driver.permissionsGranted else { self.cancel(reason: .permissionDenied); return }
                guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    self.cancel(reason: .unavailable); return
                }
                guard text.utf16.count <= NativeVoiceAudioLimits.maximumCharacters else {
                    self.cancel(reason: .transcriptTooLong); return
                }
                let value = NativeVoiceTranscript(recordingID: id, scope: scope, text: text,
                    localeIdentifier: locale, audioSeconds: measured.seconds)
                // The source must be deleted successfully before it can authorize the downstream text lane.
                self.cancel()
                guard !self.cleanupPending, self.scope == scope else { return }
                self.transcript = value
                self.onFinalTranscript?(value)
            }
        } catch { cancel(reason: audioFailure(error)) }
    }

    /// Exact server-final text selected by the caller, never a model-generated back translation.
    func selectFinalTranslation(id: String, text: String, localeIdentifier: String) {
        guard scope != nil, !id.isEmpty, id.utf8.count <= 200,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= NativeVoiceAudioLimits.maximumSpeechCharacters,
              ["en-US", "zh-CN"].contains(localeIdentifier) else { stopSpeaking(); finalTranslation = nil; return }
        let value = FinalTranslation(id: id, text: text, locale: localeIdentifier)
        guard finalTranslation != value else { return }
        guard finalTranslation?.id != id else { stopSpeaking(); failure = .unavailable; return }
        stopSpeaking(); finalTranslation = value
    }

    /// No autoplay and no restart of the same final text ID after finish/interruption/stop.
    func speak() {
        guard scope != nil, phase == .idle, !cleanupPending, let value = finalTranslation,
              !startedTranslationIDs.contains(value.id), startedTranslationIDs.count < 64 else { return }
        guard driver.installedVoiceAvailable(localeIdentifier: value.locale) else { failure = .unavailable; return }
        generation = UUID(); let own = generation
        startedTranslationIDs.insert(value.id); phase = .speaking; failure = nil
        playbackCharacters = value.text.utf16.count; spokenCharacters = 0
        do {
            try driver.speak(text: value.text, localeIdentifier: value.locale) { [weak self] finished, characters in
                guard let self, self.generation == own, self.phase == .speaking else { return }
                self.spokenCharacters = min(max(0, characters), self.playbackCharacters)
                if finished { self.stopSpeaking() }
            }
            // Finite playback lifetime, including a lost system completion callback.
            armDeadline(seconds: NativeVoiceAudioLimits.temporaryLifetime, own: own)
        } catch { cancel(reason: audioFailure(error)) }
    }

    /// Guide-only playback purpose. The caller must freshly qualify the exact source and rights.
    /// The immutable ID contains source digest + segment ID, never a new fabricated translation ID.
    func speakGuide(id: String, text: String, localeIdentifier: String, expiresAt: Date, offset: Int = 0) {
        guard scope != nil, phase == .idle, !cleanupPending, id.utf8.count <= 200, !id.isEmpty,
              ["en-US", "zh-CN"].contains(localeIdentifier), !text.isEmpty,
              text.utf16.count <= NativeVoiceAudioLimits.maximumSpeechCharacters,
              expiresAt > Date(), offset >= 0, offset < text.utf16.count,
              let boundary = String.Index(text.utf16.index(text.utf16.startIndex, offsetBy: offset), within: text) else { return }
        guard driver.installedVoiceAvailable(localeIdentifier: localeIdentifier) else { failure = .unavailable; return }
        generation = UUID(); let own = generation
        guidePlaybackID = id; guideText = text; guideLocale = localeIdentifier
        guideExpiresAt = expiresAt; guideOffset = offset; guidePaused = false
        guidePlaybackDeadline = Date().addingTimeInterval(NativeVoiceAudioLimits.temporaryLifetime)
        playbackCharacters = text.utf16.count; spokenCharacters = offset; phase = .speaking; failure = nil
        do {
            try driver.speak(text: String(text[boundary...]), localeIdentifier: localeIdentifier) { [weak self] finished, characters in
                guard let self, self.generation == own, self.phase == .speaking, self.guidePlaybackID == id,
                      let expiry = self.guideExpiresAt, expiry > Date() else { return }
                self.spokenCharacters = min(self.playbackCharacters, max(self.spokenCharacters, self.guideOffset + characters))
                self.onGuideProgress?(id, finished, self.spokenCharacters)
                if finished { self.stopSpeaking() }
            }
            armDeadline(seconds: min(NativeVoiceAudioLimits.temporaryLifetime, expiresAt.timeIntervalSinceNow), own: own)
        } catch { cancel(reason: audioFailure(error)) }
    }

    func guideCacheRendererState(current: NativeDataScope) -> NativeGuideCacheDataRendererState? {
        // An unbound, never-used renderer is verifiably empty; another actor is unavailable.
        guard scope == nil || scope == current else { return nil }
        return .init(generation: generation, callbackRevision: guideCallbackRevision, playbackID: guidePlaybackID, hasText: guideText != nil,
            hasProgressCallback: onGuideProgress != nil, paused: guidePaused,
            characters: guidePlaybackID == nil ? 0 : spokenCharacters)
    }
    func clearGuideCacheRenderer(expected: NativeGuideCacheDataRendererState, current: NativeDataScope) -> Bool {
        guard guideCacheRendererState(current: current) == expected else { return false }
        if guidePlaybackID != nil || guideText != nil {
            // Guide TTS has no recording file. Do not call generic cancel()/eraseAll() on other-purpose audio.
            generation = UUID(); deadlineTask?.cancel(); deadlineTask = nil
            driver.stopAudio(); phase = .idle; spokenCharacters = 0; playbackCharacters = 0
            guidePlaybackID = nil; guideText = nil; guideLocale = nil; guideExpiresAt = nil
            guidePlaybackDeadline = nil; guideOffset = 0; guidePaused = false
        }
        onGuideProgress = nil
        return guideCacheRendererIsEmpty(current: current)
    }
    func guideCacheRendererIsEmpty(current: NativeDataScope) -> Bool {
        (scope == nil || scope == current) && guidePlaybackID == nil && guideText == nil && guideLocale == nil
        && guideExpiresAt == nil && guidePlaybackDeadline == nil && guideOffset == 0 && !guidePaused && onGuideProgress == nil
    }

    func pauseGuide() {
        guard phase == .speaking, guidePlaybackID != nil, !guidePaused else { return }
        guard driver.pauseSpeech() else { cancel(reason: .unavailable); return }
        guidePaused = true
    }

    /// Continue the actual paused utterance only after a fresh identical source receipt.
    func resumeGuide(id: String, text: String, localeIdentifier: String, expiresAt: Date) {
        guard scope != nil, phase == .speaking, guidePaused, guidePlaybackID == id,
              guideText == text, guideLocale == localeIdentifier, expiresAt > Date(),
              let deadline = guidePlaybackDeadline, deadline > Date(), !cleanupPending else {
            if guidePlaybackID != nil { cancel(reason: .unavailable) }; return
        }
        guideExpiresAt = expiresAt
        guard driver.resumeSpeech() else { cancel(reason: .unavailable); return }
        guidePaused = false
        armDeadline(seconds: min(deadline.timeIntervalSinceNow, expiresAt.timeIntervalSinceNow), own: generation)
    }

    /// A foreground read can renew a still-running source lease, never start or continue speech.
    func renewGuide(id: String, text: String, localeIdentifier: String, expiresAt: Date) {
        guard scope != nil, phase == .speaking, guidePlaybackID == id, guideText == text,
              guideLocale == localeIdentifier, expiresAt > Date(), let deadline = guidePlaybackDeadline,
              deadline > Date(), !cleanupPending else { cancel(reason: .unavailable); return }
        guideExpiresAt = expiresAt
        armDeadline(seconds: min(deadline.timeIntervalSinceNow, expiresAt.timeIntervalSinceNow), own: generation)
    }

    func stopSpeaking() {
        guard phase == .speaking else { return }
        cancel()
    }

    /// Scope changes, consent withdrawal and navigation must call this before accepting more input.
    func cancel(reason: NativeVoiceAudioFailure? = nil) {
        generation = UUID()
        permissionTask?.cancel(); permissionTask = nil
        deadlineTask?.cancel(); deadlineTask = nil
        ttlTask?.cancel(); ttlTask = nil
        if phase == .recording, let measured = try? driver.stopRecording(), measured.valid {
            recordedSeconds = measured.seconds
        }
        driver.stopAudio(); driver.cancelRecognition()
        guidePlaybackID = nil; guideText = nil; guideLocale = nil; guideExpiresAt = nil; guidePlaybackDeadline = nil; guideOffset = 0; guidePaused = false
        currentRecordingID = nil; recordingLocale = nil; phase = .idle
        do { try files.eraseAll(); failure = reason }
        catch { failure = .cleanupRequired }
    }

    /// Does not resume recording or playback when a system interruption ends.
    func interrupt() { cancel(reason: .interrupted) }

    /// Session sign-out cleanup may throw to prevent another account becoming active.
    func erase() throws {
        bind(scope: nil); cancel(); transcript = nil; finalTranslation = nil
        if cleanupPending { throw NativeVoiceAudioFailure.cleanupRequired }
    }

    private func armDeadline(seconds: Double, own: UUID) {
        deadlineTask?.cancel()
        deadlineTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled, let self, self.generation == own else { return }
            self.cancel(reason: .timedOut)
        }
    }
    private func audioFailure(_ error: Error) -> NativeVoiceAudioFailure {
        error as? NativeVoiceAudioFailure ?? .unavailable
    }
}
