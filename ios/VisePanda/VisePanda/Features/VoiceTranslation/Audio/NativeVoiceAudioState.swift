import Foundation

/// Ephemeral measured usage, never a provider price or a durable audio history.
struct NativeVoiceTranscript: Equatable, Sendable {
    let recordingID: UUID
    let scope: NativeDataScope
    let text: String
    let localeIdentifier: String
    let audioSeconds: Double
    var characters: Int { text.utf16.count }
}

enum NativeVoiceAudioFailure: String, Error, Sendable {
    case unavailable, permissionDenied, invalidAudio, transcriptTooLong, timedOut, interrupted, cleanupRequired
}

enum NativeVoiceAudioPhase: String, Sendable {
    case idle, requestingPermission, recording, recognizing, speaking
}

struct NativeVoiceAudioMeasurement: Equatable, Sendable {
    let seconds: Double
    let frames: Int64
    let sampleRate: Double
    let channels: UInt32

    var valid: Bool {
        seconds.isFinite && sampleRate == 16_000 && channels == 1 && frames > 0 &&
        frames <= Int64(NativeVoiceAudioLimits.maximumRecordingSeconds * sampleRate) &&
        abs(seconds - Double(frames) / sampleRate) < 0.000_001
    }
}

enum NativeVoiceAudioLimits {
    static let maximumRecordingSeconds = 30.0
    static let temporaryLifetime = 120.0
    static let recognitionTimeout = 30.0
    static let maximumCharacters = 600
    static let maximumSpeechCharacters = 2_400
}
