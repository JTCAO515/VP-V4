import Foundation
import AVFoundation
import Speech
import UIKit

/// The only microphone / ASR / speech producer. Always on-device; never creates a network session.
@MainActor final class NativeSystemVoiceAudioDriver: NSObject, NativeVoiceAudioDriver {
    var onInterruption: (@MainActor () -> Void)?
    var onRecordingLimit: (@MainActor () -> Void)?
    private var recorder: AVAudioRecorder?
    private var recognizer: SFSpeechRecognizer?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let synthesizer = AVSpeechSynthesizer()
    private var utteranceIdentity: ObjectIdentifier?
    private var speechCompletion: (@MainActor @Sendable (Bool, Int) -> Void)?
    private var spoken = 0
    private var notificationTokens: [NSObjectProtocol] = []

    override init() {
        super.init()
        synthesizer.delegate = self
        // Every route change cancels; no automatic switching of a recording or private spoken response.
        for name in [AVAudioSession.interruptionNotification, AVAudioSession.routeChangeNotification,
                     AVAudioSession.mediaServicesWereResetNotification, UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification,
                     UIApplication.protectedDataWillBecomeUnavailableNotification] {
            notificationTokens.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                // Ignore our own category changes and the end of an old interruption.
                if name == AVAudioSession.routeChangeNotification,
                   let raw = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue,
                   raw == AVAudioSession.RouteChangeReason.categoryChange.rawValue { return }
                if name == AVAudioSession.interruptionNotification,
                   let raw = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue,
                   raw != AVAudioSession.InterruptionType.began.rawValue { return }
                Task { @MainActor [weak self] in self?.onInterruption?() }
            })
        }
    }

    deinit {
        for token in notificationTokens { NotificationCenter.default.removeObserver(token) }
    }

    var permissionsGranted: Bool {
        AVAudioApplication.shared.recordPermission == .granted && SFSpeechRecognizer.authorizationStatus() == .authorized
    }

    /// Requested only by beginRecording. No initializer or foreground callback asks for permission.
    func requestPermissions() async -> Bool {
        guard !Task.isCancelled, UIApplication.shared.applicationState == .active else { return false }
        let mic = await AVAudioApplication.requestRecordPermission()
        guard mic, !Task.isCancelled, UIApplication.shared.applicationState == .active else { return false }
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in continuation.resume(returning: status == .authorized) }
        }
        return speech && !Task.isCancelled && UIApplication.shared.applicationState == .active
    }

    func recognitionAvailable(localeIdentifier: String) -> Bool {
        guard ["zh-CN", "en-US"].contains(localeIdentifier),
              let value = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else { return false }
        return value.supportsOnDeviceRecognition && value.isAvailable
    }

    func startRecording(url: URL) throws {
        guard UIApplication.shared.applicationState == .active, permissionsGranted, recorder == nil, !synthesizer.isSpeaking else { throw NativeVoiceAudioFailure.permissionDenied }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [])
        try session.setActive(true)
        let value = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16_000.0,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false
        ])
        value.delegate = self
        recorder = value
        guard value.prepareToRecord(), value.record(forDuration: NativeVoiceAudioLimits.maximumRecordingSeconds) else {
            stopAudio(); throw NativeVoiceAudioFailure.unavailable
        }
        // Reassert protection after AVAudioRecorder opens the supplied empty protected file.
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    }

    func stopRecording() throws -> NativeVoiceAudioMeasurement {
        guard let value = recorder else { throw NativeVoiceAudioFailure.invalidAudio }
        recorder = nil; value.delegate = nil; value.stop()
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        return try NativeVoicePCM.measure(url: value.url)
    }

    func recognize(url: URL, localeIdentifier: String, completion: @escaping @MainActor @Sendable (String?) -> Void) throws {
        guard permissionsGranted, recognitionTask == nil,
              let value = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)),
              value.supportsOnDeviceRecognition, value.isAvailable else { throw NativeVoiceAudioFailure.unavailable }
        value.queue = .main
        recognizer = value
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        request.taskHint = .dictation
        // No contextualStrings/history, network fallback or resource/model download API.
        recognitionTask = value.recognitionTask(with: request) { result, error in
            let text = result?.isFinal == true ? result?.bestTranscription.formattedString : nil
            let terminal = result?.isFinal == true || error != nil
            guard terminal else { return }
            Task { @MainActor in completion(text) }
        }
    }

    func cancelRecognition() {
        recognitionTask?.cancel(); recognitionTask = nil; recognizer = nil
    }

    func installedVoiceAvailable(localeIdentifier: String) -> Bool { installedVoice(localeIdentifier) != nil }

    func speak(text: String, localeIdentifier: String, completion: @escaping @MainActor @Sendable (Bool, Int) -> Void) throws {
        guard UIApplication.shared.applicationState == .active, utteranceIdentity == nil, !synthesizer.isSpeaking,
              let voice = installedVoice(localeIdentifier) else { throw NativeVoiceAudioFailure.unavailable }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [])
        try session.setActive(true)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        speechCompletion = completion; spoken = 0
        utteranceIdentity = ObjectIdentifier(utterance)
        synthesizer.speak(utterance)
    }

    func stopAudio() {
        recorder?.delegate = nil; recorder?.stop(); recorder = nil
        // Invalidate callbacks before immediate stop (which may itself enqueue didCancel).
        utteranceIdentity = nil; speechCompletion = nil
        synthesizer.stopSpeaking(at: .immediate)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func installedVoice(_ locale: String) -> AVSpeechSynthesisVoice? {
        // speechVoices enumerates installed voices; never use an implicit default or prompt a download.
        AVSpeechSynthesisVoice.speechVoices().first {
            $0.language == locale && $0.identifier.hasPrefix("com.apple.") && !$0.voiceTraits.contains(.isPersonalVoice)
        }
    }
}

extension NativeSystemVoiceAudioDriver: AVAudioRecorderDelegate {
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let id = ObjectIdentifier(recorder)
        Task { @MainActor [weak self] in
            guard let self, let current = self.recorder, ObjectIdentifier(current) == id else { return }
            self.onRecordingLimit?()
        }
    }
    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        let id = ObjectIdentifier(recorder)
        Task { @MainActor [weak self] in
            guard let self, let current = self.recorder, ObjectIdentifier(current) == id else { return }
            self.onInterruption?()
        }
    }
}

extension NativeSystemVoiceAudioDriver: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString range: NSRange, utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in
            guard let self, self.utteranceIdentity == id else { return }
            // Range start is a conservative spoken-progress boundary, not an asserted acoustic measurement.
            self.spoken = max(self.spoken, range.location)
            self.speechCompletion?(false, self.spoken)
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance); let count = utterance.speechString.utf16.count
        Task { @MainActor [weak self] in
            guard let self, self.utteranceIdentity == id else { return }
            self.speechCompletion?(true, count)
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in
            guard let self, self.utteranceIdentity == id else { return }
            self.onInterruption?()
        }
    }
}

// Production construction is concrete; tests must opt into an injected synthetic driver.
extension NativeVoiceAudioController {
    convenience init() {
        self.init(driver: NativeSystemVoiceAudioDriver(),
                  files: NativeVoiceAudioFiles(root: URL.cachesDirectory.appendingPathComponent("NativeVoiceTranslationAudio", isDirectory: true)))
    }
}
