import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativeGuideCacheDataTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "00000000-0000-4000-8000-000000000090", mobileEpoch: 1, generation: 1)
    private var actor: NativeCommunitySafetyActor { .init(scope: scope, sessionID: "00000000-0000-4000-8000-000000000091") }
    private var selection: NativePlaceGuideSelection { .init(scope: scope, canonicalPoiID: "00000000-0000-4000-8000-000000000001", placeReferenceID: "00000000-0000-4000-8000-000000000002", tripID: "00000000-0000-4000-8000-000000000003", tripVersion: 0, locale: "en", interest: .address) }
    private let segmentID = "00000000-0000-4000-8000-000000000005"
    private func bytes(cache: Bool = true, revision: Int = 1) throws -> Data {
        let f = ISO8601DateFormatter(), now = Date()
        let source: [String: Any] = ["sourceRevisionId": "00000000-0000-4000-8000-000000000004", "revisionLabel": "synthetic-1", "publisher": "Owned synthetic fixture", "uri": "https://example.invalid/guide", "locator": "synthetic line"]
        let segment: [String: Any] = ["id": segmentID, "kind": "fact", "subjectId": "synthetic_place", "predicate": "located_at", "factId": "00000000-0000-4000-8000-000000000006", "factVersion": 1, "assertionId": segmentID, "assertionRevision": 1, "text": "DO NOT EXPORT PUBLISHED TEXT", "conditions": [], "exclusions": [], "reviewedAt": f.string(from: now.addingTimeInterval(-60)), "expiresAt": f.string(from: now.addingTimeInterval(60)), "sources": [source]]
        let ready: [String: Any] = ["kind": "ready", "version": 1, "tripId": selection.tripID, "tripVersion": 0, "placeReferenceId": selection.placeReferenceID, "canonicalPoiId": selection.canonicalPoiID, "place": ["en": "Synthetic", "zh": "合成"], "locale": "en", "interest": "address", "digest": String(repeating: "a", count: 64), "evaluatedAt": f.string(from: now), "expiresAt": f.string(from: now.addingTimeInterval(25)), "rights": ["revision": revision, "display": true, "tts": true, "cache": cache, "prompt": true], "segments": [segment], "completedSegmentIds": [], "replayAskUnits": 0, "narration": "published_facts", "unsupportedNarratives": ["history", "legend"], "generationCost": NSNull()]
        return try NativePlaceActionWire.bytes(["data": ready])
    }
    private func fixture(remove: ((URL) throws -> Void)? = nil, now: @escaping () -> Date = Date.init,
                         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) -> (NativePlaceGuideStore, NativeVoiceAudioController, GuideCacheSpeechFixture, NativeGuideCacheDataStore, URL) {
        let original = NativePlaceGuideStore(), driver = GuideCacheSpeechFixture()
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let audio = NativeVoiceAudioController(driver: driver, files: .init(root: root.appendingPathComponent("original-recording")))
        audio.bind(scope: scope)
        let store = NativeGuideCacheDataStore(sources: [original], renderer: audio, root: root.appendingPathComponent("own-export"), remove: remove, now: now, uptime: uptime)
        return (original, audio, driver, store, root)
    }
    private func read(_ original: NativePlaceGuideStore, cache: Bool = true, revision: Int = 1) async throws {
        original.bind(selection); let body = try bytes(cache: cache, revision: revision)
        #expect(await original.read(current: { scope }, request: { _, _ in body }))
    }
    @Test func actualEmptyInstanceDoesNotInventRecordOrSuccessReceipt() throws {
        let (_, _, _, store, root) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        store.load(current: actor); #expect(store.loaded && store.available.isEmpty)
        store.select(current: actor); #expect(store.preview == nil && store.clean(current: actor) == nil)
        #expect(store.receipt == nil && !store.export(current: actor))
    }
    @Test func retainedActualMetadataProtectedExportExcludesBodiesAndConfirmsOnlyRealCallback() async throws {
        let (original, _, _, store, root) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await read(original)
        let ready = try #require(original.visible(scope))
        original.advance(id: segmentID, characters: ready.segments[0].speechText.utf16.count, finished: true, current: scope)
        original.suspend(); store.load(current: actor)
        let row = try #require(store.available.first)
        #expect(!row.hasReady && row.completedSegmentIDs == [segmentID] && row.sourceIdentifiers.count == 1)
        store.select(current: actor); #expect(store.export(current: actor))
        let url = try #require(store.exportURL(current: actor)), data = try Data(contentsOf: url)
        let raw = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(raw["contentExportRight"] as? String == "not_granted")
        #expect(!String(decoding: data, as: UTF8.self).contains("DO NOT EXPORT"))
        #expect((try url.resourceValues(forKeys: [.isExcludedFromBackupKey])).isExcludedFromBackup == true)
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        #expect((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        #if targetEnvironment(simulator)
        // Same capability boundary as NativeScreenshotInboxTests.testPhysicalFileProtectionAttribute.
        // Never interpret the Simulator's nil protection attribute as a Complete protection grant.
        print("VPJ58_GUIDE_FILE_PROTECTION_DEVICE_UNRUN: simulator does not report the physical protection attribute")
        #else
        #expect((attributes[.protectionKey] as? String) == FileProtectionType.complete.rawValue)
        #endif
        let operation = try #require(store.exportOperationID)
        #expect(store.delivery == "prepared" && !store.handedOff(operation: operation, current: actor, completed: false, failed: false))
        #expect(store.delivery == "cancelled")
        #expect(store.handedOff(operation: operation, current: actor, completed: true, failed: false))
        #expect(store.delivery == "completed")
        let receipt = try #require(store.clean(current: actor))
        #expect(receipt.instanceCount == 1 && receipt.inspectedEmptyCount == 1 && receipt.serverData == "unchanged")
        #expect(!FileManager.default.fileExists(atPath: url.path) && original.guideCacheIsEmpty(current: scope))
        #expect(store.exportReceipt(current: actor))
        let receiptData = try Data(contentsOf: #require(store.exportURL(current: actor)))
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let exported = try decoder.decode(NativeGuideCacheDataReceipt.self, from: receiptData)
        #expect(exported.operationID == receipt.operationID && exported.actorBinding == receipt.actorBinding)
    }
    @Test func fixedDualClocksSessionEpochRightsAndSourceStateCannotBeRenewedOrRebased() async throws {
        var now = Date(), uptime: TimeInterval = 100
        let (original, _, _, store, root) = fixture(now: { now }, uptime: { uptime }); defer { try? FileManager.default.removeItem(at: root) }
        try await read(original); store.load(current: actor); store.select(current: actor)
        let fixed = try #require(store.preview)
        now = now.addingTimeInterval(29); uptime = 129
        #expect(store.currentSelection(actor) && store.preview?.id == fixed.id)
        now = now.addingTimeInterval(-1); #expect(!store.currentSelection(actor) && store.clean(current: actor) == nil)
        store.load(current: actor); store.select(current: actor); uptime += 30
        #expect(!store.currentSelection(actor)); store.tick(current: actor); #expect(store.preview == nil)
        store.load(current: actor); store.select(current: actor)
        let otherSession = NativeCommunitySafetyActor(scope: scope, sessionID: UUID().uuidString)
        #expect(!store.currentSelection(otherSession) && store.clean(current: otherSession) == nil)
        store.load(current: actor); store.select(current: actor)
        let otherEpoch = NativeCommunitySafetyActor(scope: .init(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: 2, generation: 1), sessionID: actor.sessionID)
        #expect(!store.currentSelection(otherEpoch))
        try await read(original, revision: 2)
        #expect(!store.currentSelection(actor) && store.clean(current: actor) == nil && original.ready != nil)
    }
    @Test func clearFencesOldInflightReadAndSaveButFreshExplicitRecheckWorks() async throws {
        let (original, _, _, store, root) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await read(original); let body = try bytes()
        let followUp = NativePlaceGuideFollowUpStore(); followUp.bind(selection); followUp.draft = "Preserve my unconfirmed question draft"
        original.guideCacheFollowUp = followUp
        var continuation: CheckedContinuation<Data, Never>?
        let stale = Task { await original.read(current: { scope }, request: { _, _ in await withCheckedContinuation { continuation = $0 } }) }
        for _ in 0..<100 { if continuation != nil { break }; await Task.yield() }
        let oldRead = try #require(continuation)
        store.load(current: actor); store.select(current: actor); #expect(store.clean(current: actor) != nil)
        oldRead.resume(returning: body); #expect(await stale.value == false && original.ready == nil)
        #expect(followUp.draft == "Preserve my unconfirmed question draft")
        original.bind(selection, explicit: false)
        #expect(original.selection == nil)
        #expect(await original.read(explicit: false, current: { scope }, request: { _, _ in body }) == false)
        try await read(original)
        continuation = nil
        let save = Task { await original.saveProgress(current: { scope }, request: { _, _ in await withCheckedContinuation { continuation = $0 } }) }
        for _ in 0..<100 { if continuation != nil { break }; await Task.yield() }
        let oldSave = try #require(continuation)
        store.load(current: actor); store.select(current: actor); #expect(store.clean(current: actor) != nil)
        oldSave.resume(returning: body); await save.value
        #expect(original.guideCacheIsEmpty(current: scope))
        try await read(original); #expect(original.visible(scope) != nil)
    }
    @Test func guideOnlyRendererClearFencesLateSpeechAndPreservesOriginalTranslation() async throws {
        let (original, audio, driver, store, root) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await read(original); let ready = try #require(original.visible(scope))
        audio.selectFinalTranslation(id: "original", text: "Original translation", localeIdentifier: "en-US")
        var callbacks = 0; audio.onGuideProgress = { _, _, _ in callbacks += 1 }
        audio.speakGuide(id: ready.digest + ":" + segmentID, text: ready.segments[0].speechText, localeIdentifier: "en-US", expiresAt: try #require(ready.playbackExpiresAt))
        let late = driver.completion
        store.load(current: actor); store.select(current: actor); #expect(store.clean(current: actor) != nil)
        late?(true, 24)
        #expect(callbacks == 0 && audio.guideCacheRendererIsEmpty(current: scope) && audio.phase == .idle)
        audio.speak(); #expect(driver.texts.last == "Original translation")
        driver.completion?(true, 20); audio.speak(); #expect(driver.texts.count == 2)
        try await read(original); store.load(current: actor); store.select(current: actor)
        audio.onGuideProgress = { _, _, _ in callbacks += 1 }
        #expect(!store.currentSelection(actor) && store.clean(current: actor) == nil)
    }
    @Test func clearingGuideDoesNotStopAnActiveOtherPurposeTranslation() async throws {
        let (original, audio, driver, store, root) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await read(original)
        audio.selectFinalTranslation(id: "live-original", text: "Keep this translation playing", localeIdentifier: "en-US")
        audio.speak(); let completion = driver.completion
        #expect(audio.phase == .speaking && audio.guidePlaybackID == nil)
        store.load(current: actor); store.select(current: actor)
        let receipt = try #require(store.clean(current: actor))
        #expect(receipt.guideRendererInspectedEmpty && audio.phase == .speaking)
        completion?(false, 4); #expect(audio.spokenCharacters == 4 && audio.phase == .speaking)
        completion?(true, 29); #expect(audio.phase == .idle)
        audio.speak(); #expect(driver.texts.count == 1)
    }
    @Test func ownedExportRemovalFailureCannotBecomeSourceClearReceipt() async throws {
        var failing = false
        let (original, _, _, store, root) = fixture(remove: { url in if failing { throw NativeDataError.sessionUnavailable }; try FileManager.default.removeItem(at: url) })
        defer { try? FileManager.default.removeItem(at: root) }
        try await read(original); store.load(current: actor); store.select(current: actor); #expect(store.export(current: actor))
        let url = try #require(store.exportURL(current: actor)); failing = true
        #expect(store.clean(current: actor) == nil && store.receipt == nil && original.ready != nil)
        #expect(FileManager.default.fileExists(atPath: url.path) && !store.storageReady)
        failing = false; store.load(current: actor); store.select(current: actor)
        #expect(store.clean(current: actor) != nil && !FileManager.default.fileExists(atPath: url.path))
    }
    @Test func unlicensedPositionsAreExcludedAndActorLossPhysicallyRemovesOwnExport() async throws {
        let (original, _, _, store, root) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await read(original, cache: false)
        original.advance(id: segmentID, characters: 5, finished: false, current: scope)
        #expect(original.progress.characters == 5)
        store.load(current: actor); store.select(current: actor)
        let row = try #require(store.available.first)
        #expect(!row.cacheAllowed && row.progressCharacters == 0 && row.progressSegmentID == nil && row.sourceIdentifiers.isEmpty)
        #expect(store.export(current: actor)); let url = try #require(store.exportURL(current: actor)), operation = try #require(store.exportOperationID)
        store.tick(current: nil)
        #expect(!FileManager.default.fileExists(atPath: url.path) && !store.handedOff(operation: operation, current: nil, completed: true, failed: false))
        #expect(original.ready != nil && original.progress.characters == 5)
        store.load(current: actor); store.select(current: actor)
        #expect(store.clean(current: actor) != nil && original.progress.characters == 0)
    }
}

@MainActor private final class GuideCacheSpeechFixture: NativeVoiceAudioDriver {
    var onInterruption: (@MainActor () -> Void)?
    var onRecordingLimit: (@MainActor () -> Void)?
    var permissionsGranted = true
    var texts: [String] = []
    var completion: (@MainActor @Sendable (Bool, Int) -> Void)?
    func requestPermissions() async -> Bool { true }
    func recognitionAvailable(localeIdentifier: String) -> Bool { false }
    func startRecording(url: URL) throws { throw NativeVoiceAudioFailure.unavailable }
    func stopRecording() throws -> NativeVoiceAudioMeasurement { throw NativeVoiceAudioFailure.unavailable }
    func recognize(url: URL, localeIdentifier: String, completion: @escaping @MainActor @Sendable (String?) -> Void) throws { throw NativeVoiceAudioFailure.unavailable }
    func cancelRecognition() {}
    func installedVoiceAvailable(localeIdentifier: String) -> Bool { true }
    func speak(text: String, localeIdentifier: String, completion: @escaping @MainActor @Sendable (Bool, Int) -> Void) throws { texts.append(text); self.completion = completion }
    func pauseSpeech() -> Bool { true }
    func resumeSpeech() -> Bool { true }
    func stopAudio() {}
}
