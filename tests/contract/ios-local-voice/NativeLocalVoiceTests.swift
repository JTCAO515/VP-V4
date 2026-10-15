import Foundation
import Testing
import Security
@testable import VisePanda

private nonisolated final class LocalVoiceDeletionFailureManager: FileManager, @unchecked Sendable {
    override func removeItem(at URL: URL) throws { throw NativeVoiceAudioFailure.cleanupRequired }
}

@MainActor struct NativeLocalVoiceTests {
    struct EmptyVault: NativeCredentialVault {
        func write(_ data: Data, service: String, owner: String) -> OSStatus { errSecSuccess }
        func read(service: String, owner: String) -> (OSStatus, Data?) { (errSecItemNotFound, nil) }
        func remove(service: String, owner: String) -> OSStatus { errSecSuccess }
    }
    @MainActor final class Driver: NativeVoiceAudioDriver {
        var onInterruption: (@MainActor () -> Void)?
        var onRecordingLimit: (@MainActor () -> Void)?
        var permissionsGranted = true
        var available = true
        var delayed = false
        var permission: CheckedContinuation<Bool, Never>?
        var requests = 0
        var starts = 0
        var recognitions = 0
        var result: (@MainActor @Sendable (String?) -> Void)?
        var url: URL?
        func requestPermissions() async -> Bool {
            requests += 1
            if delayed { return await withCheckedContinuation { permission = $0 } }
            return permissionsGranted
        }
        func recognitionAvailable(localeIdentifier: String) -> Bool { available }
        func startRecording(url: URL) throws {
            self.url = url; starts += 1
            // Synthetic mono PCM WAV, no microphone or speech framework calls.
            var data = Data("RIFF".utf8)
            func u16(_ x: UInt16) { var y = x.littleEndian; withUnsafeBytes(of: &y) { data.append(contentsOf: $0) } }
            func u32(_ x: UInt32) { var y = x.littleEndian; withUnsafeBytes(of: &y) { data.append(contentsOf: $0) } }
            u32(32036); data.append(Data("WAVEfmt ".utf8)); u32(16); u16(1); u16(1)
            u32(16000); u32(32000); u16(2); u16(16); data.append(Data("data".utf8)); u32(32000)
            data.append(Data(repeating: 0, count: 32000)); try data.write(to: url)
        }
        func stopRecording() throws -> NativeVoiceAudioMeasurement { try NativeVoicePCM.measure(url: #require(url)) }
        func recognize(url: URL, localeIdentifier: String, completion: @escaping @MainActor @Sendable (String?) -> Void) throws { recognitions += 1; result = completion }
        func cancelRecognition() {}
        func stopAudio() {}
        func installedVoiceAvailable(localeIdentifier: String) -> Bool { false }
        func speak(text: String, localeIdentifier: String, completion: @escaping @MainActor @Sendable (Bool, Int) -> Void) throws { Issue.record("Local draft must never invoke TTS") }
    }
    @MainActor final class Fixture {
        let state = NativeFrontendState()
        let driver = Driver()
        let settings: AppSettings
        let resources: NativeLocalVoiceResources
        var identity: NativeLocalVoiceIdentity
        var active = true
        lazy var capture = NativeLocalVoiceCapture(driver: driver, resources: resources,
            current: { self.context }, eligible: { self.active }, wait: wait)
        let wait: @Sendable (Double) async throws -> Void
        var context: NativeLocalVoiceContext { .init(state: state, identity: identity) }
        init(manager: FileManager = .default,
             wait: @escaping @Sendable (Double) async throws -> Void = { try await Task.sleep(for: .seconds($0)) }) {
            let defaults = UserDefaults(suiteName: "local-voice-fixture-" + UUID().uuidString)!
            settings = AppSettings(selectedLocale: .en, nativeSession: NativeSession(arguments: [], defaults: defaults, bundleConfiguration: [:], vault: EmptyVault()), defaults: defaults)
            identity = .init(settings: settings)
            resources = NativeLocalVoiceResources(files: .init(root: FileManager.default.temporaryDirectory.appendingPathComponent("local-voice-fixture-" + UUID().uuidString), manager: manager))
            self.wait = wait
        }
    }
    private func settle() async { for _ in 0..<30 { await Task.yield() } }

    @Test func explicitAdoptionOnlyAndDuplicateCallbackCannotSendOrCreateObjects() async throws {
        let f = Fixture(); defer { f.capture.cancel() }
        let journeyCount = f.state.journeys.count
        f.capture.begin(); await settle(); f.capture.stop()
        let result = try #require(f.driver.result)
        result("Do not book. CNY 50 on October 15.")
        #expect(f.state.draft.isEmpty && f.state.messages.isEmpty)
        #expect(f.capture.transcript == "Do not book. CNY 50 on October 15.")
        #expect(f.resources.files.receipt == nil && !FileManager.default.fileExists(atPath: f.resources.files.root.path))
        result("Duplicate")
        #expect(f.capture.transcript == "Do not book. CNY 50 on October 15.")
        #expect(f.capture.adopt(into: f.state))
        #expect(f.state.draft == "Do not book. CNY 50 on October 15.")
        #expect(f.state.messages.isEmpty && f.state.journeys.count == journeyCount && !f.state.pendingConfirmation)
        #expect(!f.capture.adopt(into: f.state))
    }

    @Test func cancelledPermissionNeverStartsAfterLateGrant() async {
        let f = Fixture(); f.driver.delayed = true
        f.capture.begin(); await settle()
        f.capture.stop(); f.driver.permission?.resume(returning: true); f.driver.permission = nil
        await settle()
        #expect(f.driver.starts == 0 && f.capture.transcript == nil && f.resources.owner == nil)
    }

    @Test func unavailableDeniedEmptyTooLongAndRevokedAreRealFailures() async {
        let f = Fixture(); defer { f.capture.cancel() }
        f.driver.available = false; f.capture.begin()
        #expect(f.capture.failure == .audio(.unavailable) && f.driver.requests == 0)
        f.driver.available = true; f.driver.permissionsGranted = false
        f.capture.begin(); await settle()
        #expect(f.capture.failure == .audio(.permissionDenied) && f.driver.starts == 0)
        f.driver.permissionsGranted = true; f.capture.begin(); await settle(); f.capture.stop(); f.driver.result?("  ")
        #expect(f.capture.failure == .empty)
        f.capture.begin(); await settle(); f.capture.stop(); f.driver.result?(String(repeating: "a", count: 601))
        #expect(f.capture.failure == .audio(.transcriptTooLong) && f.capture.transcript == nil)
        f.capture.begin(); await settle(); f.capture.stop(); f.driver.permissionsGranted = false; f.driver.result?("Revoked")
        #expect(f.capture.failure == .audio(.permissionDenied))
        #expect(f.resources.files.receipt == nil && f.state.draft.isEmpty)
    }

    @Test func resetSameIDNewChatSwitchManualEditAndSendInvalidate() async throws {
        for mutation in 0..<6 {
            let f = Fixture(); defer { f.capture.cancel() }
            f.capture.begin(); await settle(); f.capture.stop()
            let late = try #require(f.driver.result)
            let oldID = f.state.activeLocalConversationID
            switch mutation {
            case 0: f.state.reset(); #expect(f.state.activeLocalConversationID == oldID)
            case 1: f.state.startLocalConversation(); #expect(f.state.activeLocalConversationID == oldID)
            case 2: f.state.selectLocalConversation("sample-history")
            case 3: f.state.draft = "edited"; f.state.draft = ""
            case 4: f.state.submit() // Empty submit still invalidates the input epoch.
            default: f.state.openChat(context: "new context")
            }
            late("Old draft")
            #expect(f.capture.transcript == nil && f.resources.files.receipt == nil)
            #expect(!f.capture.adopt(into: f.state))
        }
    }

    @Test func actorLocaleSessionAndEligibilityChangesRejectAtAdoption() async throws {
        for mutation in 0..<4 {
            let f = Fixture(); defer { f.capture.cancel() }
            f.capture.begin(); await settle(); f.capture.stop(); f.driver.result?("Review me")
            #expect(f.capture.transcript != nil)
            if mutation == 0 { f.settings.selectedLocale = .zh; f.identity = .init(settings: f.settings) }
            if mutation == 1 { f.identity = .init(settings: AppSettings(selectedLocale: .en)) }
            if mutation == 2 { f.active = false }
            if mutation == 3 { f.state.draft = "keep manual text" }
            #expect(!f.capture.adopt(into: f.state))
            #expect(f.state.draft == (mutation == 3 ? "keep manual text" : ""))
        }
    }

    @Test func interruptionLimitAndBackgroundClearAndRejectLateResult() async throws {
        for mutation in 0..<3 {
            let f = Fixture(); defer { f.capture.cancel() }
            f.capture.begin(); await settle(); f.capture.stop()
            let late = try #require(f.driver.result)
            if mutation == 0 { f.driver.onInterruption?() }
            if mutation == 1 { f.driver.onRecordingLimit?() }
            if mutation == 2 { f.active = false; f.capture.invalidateIfChanged() }
            late("Late")
            #expect(f.capture.phase == .idle && f.capture.transcript == nil && f.resources.files.receipt == nil)
        }
    }

    @Test func ownedFamilyDoesNotEraseOtherVoiceOrConcurrentCapture() async throws {
        let f = Fixture(); defer { f.capture.cancel() }
        let other = FileManager.default.temporaryDirectory.appendingPathComponent("voice-other-" + UUID().uuidString)
        try Data("preserve".utf8).write(to: other); defer { try? FileManager.default.removeItem(at: other) }
        f.capture.begin(); await settle()
        let second = NativeLocalVoiceCapture(driver: Driver(), resources: f.resources, current: { f.context }, eligible: { true })
        second.begin(); #expect(second.failure == .busy)
        second.cancel(); #expect(f.resources.files.receipt != nil)
        f.capture.cancel(); #expect(try Data(contentsOf: other) == Data("preserve".utf8))
        #expect(!FileManager.default.fileExists(atPath: f.resources.files.root.path))
    }
    @Test func scopeActorEndpointAndGenerationAreBoundEvenWithSameState() async {
        for mutation in 0..<4 {
            let f = Fixture(); defer { f.capture.cancel() }
            f.capture.begin(); await settle(); f.capture.stop()
            let old = f.identity
            f.identity = .init(session: old.session,
                signedScope: NativeDataScope(endpoint: mutation == 0 ? "https://other.invalid" : "disabled",
                    subject: mutation == 1 ? "synthetic-b" : "synthetic-a", mobileEpoch: 1, generation: mutation == 2 ? 2 : 1),
                subject: "synthetic-a", status: "active", generation: mutation == 3 ? 2 : old.generation,
                endpointEnabled: true, locale: old.locale)
            f.driver.result?("Old identity")
            #expect(f.capture.transcript == nil && f.state.draft.isEmpty && f.resources.files.receipt == nil)
        }
    }

    @Test func allDeadlinesCancelIncludingPendingPermissionAndReviewTTL() async throws {
        for phase in 0..<4 {
            let f = Fixture(wait: { seconds in
                if (phase == 3 && seconds == 120) || (phase != 3 && seconds == 30) {
                    try await Task.sleep(for: .milliseconds(80))
                } else { try await Task.sleep(for: .seconds(seconds)) }
            })
            defer { f.capture.cancel() }
            f.driver.delayed = phase == 0
            f.capture.begin(); await settle()
            if phase >= 2 { f.capture.stop() }
            if phase == 3 { f.driver.result?("Expiring review") }
            try await Task.sleep(for: .milliseconds(180))
            #expect(f.capture.failure == .audio(.timedOut) && f.capture.transcript == nil)
            #expect(f.resources.files.receipt == nil && f.resources.owner == nil)
            if phase == 0 { f.driver.permission?.resume(returning: true); f.driver.permission = nil; await settle(); #expect(f.driver.starts == 0) }
            f.driver.result?("Late timeout")
            #expect(f.state.draft.isEmpty && f.capture.transcript == nil)
        }
    }

    @Test func cleanupFailureLatchesNewRecordingOffAndNeverExposesTranscript() async throws {
        let f = Fixture(manager: LocalVoiceDeletionFailureManager())
        f.capture.begin(); await settle(); f.capture.stop(); f.driver.result?("Do not expose")
        #expect(f.capture.failure == .audio(.cleanupRequired) && f.capture.transcript == nil && f.capture.cleanupPending)
        let starts = f.driver.starts
        // Even an external successful cleanup does not silently re-enable recording.
        try FileManager.default.removeItem(at: f.resources.files.root)
        f.capture.begin()
        #expect(f.driver.starts == starts && f.capture.cleanupPending)
        f.capture.cancel()
    }

    @Test func crashRecoveryOnlyClearsThisFeatureFamily() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("local-voice-recovery-" + UUID().uuidString)
        let files = NativeVoiceAudioFiles(root: root)
        let clip = try files.create(id: UUID())
        #expect(FileManager.default.fileExists(atPath: clip.url.path))
        let recovered = NativeVoiceAudioFiles(root: root)
        #expect(recovered.receipt == nil && !FileManager.default.fileExists(atPath: root.path))
    }

}
