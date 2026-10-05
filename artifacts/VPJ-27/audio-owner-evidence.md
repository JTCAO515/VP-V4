# VPJ-27 audio core local evidence

Final source: b7bc6f5034d810850c6f650df2277ff518f2de50, branch vpj27-native-audio-core-20261005.
Base: 70a19fd0. Worktree: /Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj27-native-audio-core-20261005.
Scope: 5 production Audio files plus NativeVoiceAudioTests.swift; no UI/Session/pbx/Info edits.

PASS: production Audio iOS 17 simulator / SDK 27 Swift 6 strict-concurrency module emission (typecheck-with-tests-r2.log).
PASS: same target's NativeVoiceAudioTests typecheck with installed Testing.framework/TestingMacros plugin (ios-tests-typecheck-r3.log).
PASS: 9 actual macOS Swift Testing cases against copied production controller/files/state/PCM sources and an exact synthetic NativeDataScope declaration (local-tests.log). This isolated package is not the full app, iOS runtime, microphone, system speech or provider acceptance. AVAudioFile parses generated square-wave PCM, not human audio.
PASS: git diff --check; branch clean.

Retained initial FAIL: emitted production module found nonisolated NSObjectProtocol observer deinit; b7 fixes isolated deinit. Retained iOS standalone test command FAILs: missing Testing search path/plugin, corrected in r3.

UNRUN: whole-app build and CI (sole UI integrator); real iOS driver/runtime; installed language-resource recognition; actual installed-voice playback; microphone/speech permission alerts; physical-device audio quality, route/call/background behavior and human acceptance. No live provider, recording or permission operation performed. Translation cost remains unknown; measured PCM seconds/UTF-16 counts are not price.

Production caller pairing: UI worktree vpj27-native-voice-translation-20261005 has NativeVoiceAudioPanels.swift invoking the concrete session controller, producer beginRecording UUID, typed final callback and selected exact final-text explicit speak/stop. Session registration/full app build remains with sole UI integrator.

Source APIs: NativeVoiceAudioController() concrete system factory; beginRecording(localeIdentifier:) -> UUID? synchronously creates sole currentRecordingID; release during permission wait invalidates identity; endRecording; bind(scope:); onFinalTranscript; selectFinalTranslation(id:text:localeIdentifier:); speak; stopSpeaking; cancel; erase throws for session storage fence.

Bounds: mono 16 kHz int16 PCM 30s; original ASR max600 UTF-16; exact final TTS max2400; temporary lifetime120s, recognition timeout30s; one temporary copy deleted before final publish and on cancel/interruption; startup purges prior captures; deletion failure denies new audio but caller's readable text remains available. Same final-ID cannot start again in the same bound scope; at most64 ephemeral anti-replay IDs, no historical raw text storage.

Commands used:
- xcrun swift test --package-path /tmp/vpj27-audio-check/package
- xcrun swiftc -emit-module -enable-testing -module-name VisePanda -emit-module-path /tmp/vpj27-audio-check/VisePanda.swiftmodule -swift-version 6 -strict-concurrency=complete -target arm64-apple-ios17.0-simulator -sdk /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator27.0.sdk /tmp/vpj27-audio-check/Scope.swift ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/*.swift
- xcrun swiftc -typecheck -swift-version 6 -strict-concurrency=complete -target arm64-apple-ios17.0-simulator -sdk /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator27.0.sdk -F /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks -I /tmp/vpj27-audio-check -load-plugin-library /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/host/plugins/testing/libTestingMacros.dylib ios/VisePanda/VisePandaTests/NativeVoiceAudioTests.swift
