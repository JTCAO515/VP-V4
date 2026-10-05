import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativePlaceGuideAudioTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "guide-synthetic", mobileEpoch: 1, generation: 1)
    private func fixture() -> (NativeVoiceAudioController, GuideSpeechFixture) {
        let driver = GuideSpeechFixture()
        let audio = NativeVoiceAudioController(driver: driver, files: .init(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)))
        audio.bind(scope: scope); return (audio, driver)
    }
    @Test func sourceQualifiedPauseContinueAndExplicitGuideReplayPreserveTranslationSinglePlay() {
        let (audio, driver) = fixture(), expiry = Date().addingTimeInterval(25)
        audio.selectFinalTranslation(id: "original-translation", text: "No peanuts.", localeIdentifier: "en-US")
        audio.speak(); driver.completion?(true, 11)
        audio.speak(); #expect(driver.texts == ["No peanuts."])
        audio.speakGuide(id: "digest:segment", text: "Published fact. No inferred hours.", localeIdentifier: "en-US", expiresAt: expiry)
        audio.pauseGuide(); #expect(audio.guidePaused && driver.pauses == 1)
        audio.resumeGuide(id: "digest:segment", text: "Published fact. No inferred hours.", localeIdentifier: "en-US", expiresAt: expiry)
        #expect(!audio.guidePaused && driver.resumes == 1 && driver.texts.count == 2)
        driver.completion?(true, 33)
        audio.speakGuide(id: "digest:segment", text: "Published fact. No inferred hours.", localeIdentifier: "en-US", expiresAt: expiry)
        #expect(driver.texts.count == 3)
        audio.cancel(); audio.speak(); #expect(driver.texts.count == 3)
    }
    @Test func changedReceiptOrExpiredSourceCannotContinueAndLateCallbacksAreFenced() {
        let (audio, driver) = fixture(), expiry = Date().addingTimeInterval(25)
        var callbacks = 0; audio.onGuideProgress = { _, _, _ in callbacks += 1 }
        audio.speakGuide(id: "old:segment", text: "Original fact", localeIdentifier: "en-US", expiresAt: expiry)
        let late = driver.completion
        audio.pauseGuide()
        audio.resumeGuide(id: "new:segment", text: "Corrected fact", localeIdentifier: "en-US", expiresAt: expiry)
        late?(true, 13)
        #expect(driver.resumes == 0 && audio.phase == .idle && callbacks == 0 && audio.guidePlaybackID == nil)
        audio.speakGuide(id: "old:segment", text: "Original fact", localeIdentifier: "en-US", expiresAt: Date().addingTimeInterval(-1))
        #expect(driver.texts.count == 1)
        audio.speakGuide(id: "old:segment", text: "Original fact", localeIdentifier: "en-US", expiresAt: expiry)
        let previousOwner = driver.completion
        audio.bind(scope: .init(endpoint: scope.endpoint, subject: "other", mobileEpoch: 1, generation: 2))
        previousOwner?(true, 13)
        #expect(callbacks == 0 && audio.phase == .idle && !audio.guidePaused)
    }
    @Test func explicitContinuationUsesWholeUnicodeBoundaryAndConservativePosition() {
        let (audio, driver) = fixture(), expiry = Date().addingTimeInterval(25)
        var position = -1
        audio.onGuideProgress = { _, _, characters in position = characters }
        audio.speakGuide(id: "digest:segment", text: "😀 No peanuts.", localeIdentifier: "en-US", expiresAt: expiry, offset: 1)
        #expect(driver.texts.isEmpty)
        audio.speakGuide(id: "digest:segment", text: "😀 No peanuts.", localeIdentifier: "en-US", expiresAt: expiry, offset: 3)
        #expect(driver.texts == ["No peanuts."])
        driver.completion?(false, 3); #expect(position == 6)
        audio.cancel()
        var progress = NativePlaceGuideProgress()
        progress.advance(segmentID: "segment", characters: 4, total: 10, finished: false)
        progress.advance(segmentID: "segment", characters: 2, total: 10, finished: false)
        #expect(progress.characters == 4 && progress.completedSegmentIDs.isEmpty)
        progress.advance(segmentID: "segment", characters: 11, total: 10, finished: true)
        #expect(progress.completedSegmentIDs.isEmpty)
        progress.advance(segmentID: "segment", characters: 10, total: 10, finished: true)
        #expect(progress.completedSegmentIDs == ["segment"])
    }
}

@MainActor private final class GuideSpeechFixture: NativeVoiceAudioDriver {
    var onInterruption: (@MainActor () -> Void)?
    var onRecordingLimit: (@MainActor () -> Void)?
    var permissionsGranted = true
    var texts: [String] = []
    var pauses = 0
    var resumes = 0
    var completion: (@MainActor @Sendable (Bool, Int) -> Void)?
    func requestPermissions() async -> Bool { true }
    func recognitionAvailable(localeIdentifier: String) -> Bool { false }
    func startRecording(url: URL) throws { throw NativeVoiceAudioFailure.unavailable }
    func stopRecording() throws -> NativeVoiceAudioMeasurement { throw NativeVoiceAudioFailure.unavailable }
    func recognize(url: URL, localeIdentifier: String, completion: @escaping @MainActor @Sendable (String?) -> Void) throws { throw NativeVoiceAudioFailure.unavailable }
    func cancelRecognition() {}
    func installedVoiceAvailable(localeIdentifier: String) -> Bool { true }
    func speak(text: String, localeIdentifier: String, completion: @escaping @MainActor @Sendable (Bool, Int) -> Void) throws { texts.append(text); self.completion = completion }
    func pauseSpeech() -> Bool { pauses += 1; return true }
    func resumeSpeech() -> Bool { resumes += 1; return true }
    func stopAudio() {}
}
