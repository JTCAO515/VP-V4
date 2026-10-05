import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativeVoiceAudioTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "synthetic-a", mobileEpoch: 1, generation: 1)
    private var other: NativeDataScope { .init(endpoint: scope.endpoint, subject: "synthetic-b", mobileEpoch: 1, generation: 2) }

    private func fixture(manager: FileManager = .default) -> (NativeVoiceAudioController, VoiceDriverFixture, NativeVoiceAudioFiles) {
        let files = NativeVoiceAudioFiles(root: FileManager.default.temporaryDirectory.appendingPathComponent("voice-fixture-" + UUID().uuidString), manager: manager)
        let driver = VoiceDriverFixture()
        let controller = NativeVoiceAudioController(driver: driver, files: files)
        controller.bind(scope: scope)
        return (controller, driver, files)
    }
    private func settle() async { for _ in 0..<12 { await Task.yield() } }

    @Test func releaseBeforePermissionRejectsLateGrantWithSameProducerIdentity() async {
        let (audio, driver, files) = fixture()
        driver.delayPermission = true
        let id = audio.beginRecording(localeIdentifier: "en-US")
        #expect(id != nil && audio.currentRecordingID == id)
        await settle()
        #expect(driver.permissionRequests == 1)
        #expect(audio.phase == .requestingPermission)
        audio.endRecording()
        #expect(audio.currentRecordingID == nil)
        driver.permissionContinuation?.resume(returning: true); driver.permissionContinuation = nil
        await settle()
        #expect(driver.starts == 0 && files.receipt == nil && audio.phase == .idle)
    }

    @Test func duplicateReleasePublishesExactlyOneOriginalFinalAfterDeletingCopy() async throws {
        let (audio, driver, files) = fixture()
        var observed: [NativeVoiceTranscript] = []
        audio.onFinalTranscript = { value in
            #expect(files.receipt == nil && !FileManager.default.fileExists(atPath: files.root.path))
            observed.append(value)
        }
        let id = try #require(audio.beginRecording(localeIdentifier: "en-US"))
        await settle()
        #expect(audio.currentRecordingID == id && driver.starts == 1)
        let receipt = try #require(files.receipt)
        #expect(FileManager.default.fileExists(atPath: receipt.url.path))
        audio.endRecording(); audio.endRecording()
        #expect(driver.recognitions == 1 && driver.stops == 1)
        driver.result?("No peanuts. CNY 50.")
        driver.result?("Late duplicate")
        #expect(observed.count == 1)
        #expect(observed.first?.recordingID == id && observed.first?.scope == scope)
        #expect(observed.first?.text == "No peanuts. CNY 50." && observed.first?.audioSeconds == 1)
        #expect(observed.first?.characters == 19 && audio.recordedSeconds == 1)
        #expect(audio.phase == .idle && audio.currentRecordingID == nil)
    }

    @Test func actorChangeAndCancelDropLateFinalAndClearTemporarySource() async {
        let (audio, driver, files) = fixture()
        var callbacks = 0
        audio.onFinalTranscript = { _ in callbacks += 1 }
        audio.beginRecording(localeIdentifier: "zh-CN"); await settle(); audio.endRecording()
        let old = driver.result
        audio.bind(scope: other)
        old?("Previous owner")
        #expect(callbacks == 0 && audio.transcript == nil && audio.recordedSeconds == nil && files.receipt == nil)
        audio.beginRecording(localeIdentifier: "en-US"); await settle(); audio.endRecording()
        let cancelled = driver.result
        audio.cancel(); cancelled?("Cancelled")
        #expect(callbacks == 0 && audio.transcript == nil && files.receipt == nil)
    }

    @Test func unavailableAndDeniedNeverStartMicrophoneAndInvalidFinalIsNotTruncated() async {
        let (audio, driver, files) = fixture()
        driver.available = false
        #expect(audio.beginRecording(localeIdentifier: "en-US") == nil)
        #expect(audio.failure == .unavailable && driver.permissionRequests == 0)
        driver.available = true; driver.permissionsGranted = false
        audio.beginRecording(localeIdentifier: "en-US"); await settle()
        #expect(audio.failure == .permissionDenied && driver.starts == 0 && audio.currentRecordingID == nil)
        driver.permissionsGranted = true
        audio.beginRecording(localeIdentifier: "en-US"); await settle(); audio.endRecording()
        driver.result?(String(repeating: "a", count: 601))
        #expect(audio.failure == .transcriptTooLong && audio.transcript == nil && files.receipt == nil)
        audio.beginRecording(localeIdentifier: "en-US"); await settle(); audio.endRecording()
        driver.permissionsGranted = false; driver.result?("Revoked")
        #expect(audio.failure == .permissionDenied && audio.transcript == nil && files.receipt == nil)
    }

    @Test func interruptionAndRecordingLimitKeepMeasuredDurationWithoutRestart() async {
        let (audio, driver, files) = fixture()
        audio.beginRecording(localeIdentifier: "en-US"); await settle()
        driver.onInterruption?()
        #expect(audio.phase == .idle && audio.failure == .interrupted && audio.recordedSeconds == 1)
        #expect(files.receipt == nil && driver.starts == 1)
        audio.beginRecording(localeIdentifier: "en-US"); await settle()
        driver.onRecordingLimit?()
        #expect(audio.failure == .timedOut && audio.phase == .idle && files.receipt == nil && driver.starts == 2)
    }

    @Test func exactFinalSpeechRequiresExplicitStartAndNeverReplaysSameID() {
        let (audio, driver, _) = fixture()
        let text = String(repeating: "译", count: 2_400)
        audio.selectFinalTranslation(id: "final-A", text: text, localeIdentifier: "zh-CN")
        #expect(driver.speechTexts.isEmpty)
        audio.speak(); audio.speak()
        #expect(driver.speechTexts == [text] && audio.playbackCharacters == 2_400)
        let stale = driver.speechResult
        stale?(false, 10)
        #expect(audio.spokenCharacters == 10)
        audio.stopSpeaking(); stale?(true, 2_400)
        #expect(audio.phase == .idle && audio.spokenCharacters == 10)
        audio.speak()
        #expect(driver.speechTexts.count == 1)
        audio.selectFinalTranslation(id: "final-B", text: "Second", localeIdentifier: "en-US"); audio.speak()
        driver.onInterruption?()
        audio.selectFinalTranslation(id: "final-A", text: text, localeIdentifier: "zh-CN"); audio.speak()
        #expect(driver.speechTexts.count == 2)
        audio.selectFinalTranslation(id: "too-long", text: String(repeating: "x", count: 2_401), localeIdentifier: "en-US"); audio.speak()
        #expect(driver.speechTexts.count == 2)
        audio.selectFinalTranslation(id: "uninstalled", text: "Exact", localeIdentifier: "en-US")
        driver.voiceAvailable = false; audio.speak()
        #expect(audio.failure == .unavailable && driver.speechTexts.count == 2)
    }

    @Test func finalSpeechFinishRetainsExactCharacterBoundaryAndAccountClearFencesLateCallback() {
        let (audio, driver, _) = fixture()
        audio.selectFinalTranslation(id: "one", text: "é😀", localeIdentifier: "en-US"); audio.speak()
        driver.speechResult?(true, 3)
        #expect(audio.phase == .idle && audio.spokenCharacters == 3)
        audio.selectFinalTranslation(id: "two", text: "Next", localeIdentifier: "en-US"); audio.speak()
        let old = driver.speechResult
        audio.bind(scope: nil); old?(true, 4)
        #expect(audio.spokenCharacters == 0 && audio.playbackCharacters == 0 && audio.phase == .idle)
    }

    @Test func cleanupFailurePreventsFinalPublishNewCaptureAndNewAccountAudio() async throws {
        let (audio, driver, files) = fixture(manager: VoiceDeletionFailureManager())
        var callbacks = 0
        audio.onFinalTranscript = { _ in callbacks += 1 }
        audio.beginRecording(localeIdentifier: "en-US"); await settle(); audio.endRecording()
        driver.result?("Readable original input")
        #expect(audio.cleanupPending && audio.failure == .cleanupRequired && audio.transcript == nil && callbacks == 0)
        #expect(audio.beginRecording(localeIdentifier: "en-US") == nil)
        #expect(throws: NativeVoiceAudioFailure.cleanupRequired) { try audio.erase() }
        audio.bind(scope: other)
        #expect(audio.beginRecording(localeIdentifier: "en-US") == nil)
        // Only the synthetic test removes its temporary root through the real file manager.
        try FileManager.default.removeItem(at: files.root)
    }

    @Test func actualSyntheticPCMFileMeasuresFramesAndRejectsWrongFormatAndExpiredReceipt() throws {
        let files = NativeVoiceAudioFiles(root: FileManager.default.temporaryDirectory.appendingPathComponent("voice-pcm-" + UUID().uuidString))
        defer { try? files.eraseAll() }
        let now = Date()
        let receipt = try files.create(id: UUID(), now: now)
        try VoiceDriverFixture.wave(frames: 16_000).write(to: receipt.url)
        let measured = try NativeVoicePCM.measure(url: files.readable(receipt, now: now))
        #expect(measured.seconds == 1 && measured.frames == 16_000 && measured.valid)
        #expect(throws: NativeVoiceAudioFailure.invalidAudio) { try files.readable(receipt, now: now.addingTimeInterval(120)) }
        try VoiceDriverFixture.wave(frames: 16_000, sampleRate: 8_000).write(to: receipt.url)
        #expect(throws: NativeVoiceAudioFailure.invalidAudio) { try NativeVoicePCM.measure(url: receipt.url) }
        try VoiceDriverFixture.wave(frames: 480_001).write(to: receipt.url)
        #expect(throws: NativeVoiceAudioFailure.invalidAudio) { try NativeVoicePCM.measure(url: receipt.url) }
        try Data("not audio".utf8).write(to: receipt.url)
        #expect(throws: NativeVoiceAudioFailure.invalidAudio) { try NativeVoicePCM.measure(url: receipt.url) }
        // A newly constructed inbox discards prior crash/session material immediately.
        let recovered = NativeVoiceAudioFiles(root: files.root)
        #expect(recovered.receipt == nil && !FileManager.default.fileExists(atPath: files.root.path))
    }
}

@MainActor private final class VoiceDriverFixture: NativeVoiceAudioDriver {
    var onInterruption: (@MainActor () -> Void)?
    var onRecordingLimit: (@MainActor () -> Void)?
    var permissionsGranted = true
    var available = true
    var voiceAvailable = true
    var delayPermission = false
    var permissionContinuation: CheckedContinuation<Bool, Never>?
    var permissionRequests = 0
    var starts = 0
    var stops = 0
    var recognitions = 0
    var speechTexts: [String] = []
    var result: (@MainActor @Sendable (String?) -> Void)?
    var speechResult: (@MainActor @Sendable (Bool, Int) -> Void)?
    var url: URL?

    func requestPermissions() async -> Bool {
        permissionRequests += 1
        if delayPermission { return await withCheckedContinuation { permissionContinuation = $0 } }
        return permissionsGranted
    }
    func recognitionAvailable(localeIdentifier: String) -> Bool { available }
    func startRecording(url: URL) throws { starts += 1; self.url = url; try Self.wave(frames: 16_000).write(to: url) }
    func stopRecording() throws -> NativeVoiceAudioMeasurement {
        stops += 1
        return try NativeVoicePCM.measure(url: #require(url))
    }
    func recognize(url: URL, localeIdentifier: String, completion: @escaping @MainActor @Sendable (String?) -> Void) throws {
        recognitions += 1; result = completion
    }
    func cancelRecognition() {}
    func installedVoiceAvailable(localeIdentifier: String) -> Bool { voiceAvailable }
    func speak(text: String, localeIdentifier: String, completion: @escaping @MainActor @Sendable (Bool, Int) -> Void) throws {
        speechTexts.append(text); speechResult = completion
    }
    func stopAudio() {}
    static func wave(frames: Int, sampleRate: UInt32 = 16_000) -> Data {
        var data = Data()
        func word<T: FixedWidthInteger>(_ value: T) {
            var little = value.littleEndian; withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        data.append(Data("RIFF".utf8)); word(UInt32(36 + frames * 2)); data.append(Data("WAVEfmt ".utf8))
        word(UInt32(16)); word(UInt16(1)); word(UInt16(1)); word(sampleRate); word(sampleRate * 2)
        word(UInt16(2)); word(UInt16(16)); data.append(Data("data".utf8)); word(UInt32(frames * 2))
        // Generated square wave, never microphone or human audio.
        for frame in 0..<frames { word(Int16(frame % 32 < 16 ? 1_000 : -1_000)) }
        return data
    }
}

/// Immutable fail-all remover; there is no shared mutable state behind this test-only FileManager subclass.
private nonisolated final class VoiceDeletionFailureManager: FileManager, @unchecked Sendable {
    override func removeItem(at URL: URL) throws { throw NativeVoiceAudioFailure.cleanupRequired }
}
