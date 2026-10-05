import Foundation
import AVFoundation

/// The same file-format gate is used for ended recordings and local synthetic-PCM tests.
@MainActor enum NativeVoicePCM {
    static func measure(url: URL) throws -> NativeVoiceAudioMeasurement {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let size = attributes[.size] as? NSNumber, size.intValue > 44,
              size.intValue <= Int(NativeVoiceAudioLimits.maximumRecordingSeconds * 16_000 * 2) + 4_096 else {
            throw NativeVoiceAudioFailure.invalidAudio
        }
        let file = try AVAudioFile(forReading: url)
        let format = file.fileFormat
        let measured = NativeVoiceAudioMeasurement(seconds: Double(file.length) / format.sampleRate,
            frames: file.length, sampleRate: format.sampleRate, channels: format.channelCount)
        guard format.commonFormat == .pcmFormatInt16, measured.valid else { throw NativeVoiceAudioFailure.invalidAudio }
        return measured
    }
}
