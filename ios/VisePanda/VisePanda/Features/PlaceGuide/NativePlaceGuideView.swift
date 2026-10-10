import SwiftUI

struct NativePlaceGuideView: View {
    let selection: NativePlaceGuideSelection
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var followUp = NativePlaceGuideFollowUpStore()
    @State private var selectedSegmentID: String?
    @State private var action: Task<Void, Never>?
    @State private var exportText: String?
    @State private var exportDeadline: TimeInterval = 0
    @State private var exportExpiry: Task<Void, Never>?
    private var session: NativeSession { settings.nativeSession }
    private var store: NativePlaceGuideStore { session.placeGuide }
    private var audio: NativeVoiceAudioController { session.voiceAudio }
    private var scope: NativeDataScope? { phase == .active ? session.dataScope : nil }
    private var chinese: Bool { selection.locale == "zh" }
    private func t(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private func request(_ selection: NativePlaceGuideSelection, _ body: Data) async throws -> Data {
        try await session.placeGuideRequest(selection: selection, body: body)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(t("VP · Place guide", "VP · 地点讲解")).font(.title.bold())
                Text(t("Current Trip: ", "当前行程：") + selection.tripID).font(.caption)
                Text(t("Selected interest: ", "明确兴趣：") + (chinese ? selection.interest.zh : selection.interest.en))
                Text(t("Questions use this exact place and conservative speech progress. The original Ask task stays separate; Guide binds it to the visible Trip context and never edits the itinerary.", "追问使用此准确地点与保守语音进度。原 Ask 任务保持独立，Guide 将其绑定到可见的行程上下文，不改动日程。"))
                    .font(.caption).foregroundStyle(.secondary)
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let ready = store.visible(scope), store.selection == selection {
                        content(ready)
                        if ready.rights.prompt { question(ready) }
                        else { Text(t("These sources are not permitted for question processing. You can read the approved captions.", "这些来源未获准用于追问处理，可阅读已许可字幕。")) }
                        if let turn = followUp.visible(scope: scope) { answer(turn) }
                    } else {
                        Text(t("A current, licensed guide is unavailable for this place or language. Explore another place or check its official information.", "此地点或语言暂无当前已许可讲解。可探索其他地点，或核对场馆官方信息。"))
                            .accessibilityIdentifier("guide.unavailable")
                    }
                }
                Button(t("Recheck sources", "重新核对来源")) { run { await refresh(explicit: true) } }
                    .disabled(scope != selection.scope || store.busy || followUp.busy).accessibilityIdentifier("guide.refresh")
                Button(t("Forget stored guide progress", "删除已存讲解进度")) {
                    audio.cancel(); exportText = nil
                    run {
                        followUp.sourceUnavailable(using: session)
                        await store.forget(current: { scope }, request: request)
                        if store.notice == "forgotten" { followUp.forgotten(using: session) }
                    }
                }.disabled(scope != selection.scope || store.busy).accessibilityIdentifier("guide.forget")
                Button(t("Export this guide's metadata", "导出此讲解的元数据")) { run { await exportProgress() } }
                    .disabled(scope != selection.scope || store.busy).accessibilityIdentifier("guide.export")
                Text(t("Includes guide progress and question references for this place in this Trip. Question text, answers and rights reviews are separate.", "包含此行程中此地点的讲解进度和追问引用。追问正文、答案与权利审核记录另属其他范围。"))
                    .font(.caption).foregroundStyle(.secondary)
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let exportText, scope == selection.scope, ProcessInfo.processInfo.systemUptime < exportDeadline {
                        ShareLink(item: exportText) { Text(t("Share this scoped metadata export", "分享此范围的元数据导出")) }
                    }
                }
                if store.busy || followUp.busy { ProgressView() }
                if let notice = store.notice { Text(message(notice)).font(.caption) }
                if followUp.notice != nil {
                    Text(t("The original question may still be pending. Refresh checks its receipt; retry keeps the same operation and task. A missing receipt does not prove failure.", "原追问可能仍在处理中。刷新读取其回执；重试保留同一操作和任务。未读到回执不代表失败。"))
                        .font(.caption).accessibilityIdentifier("guide.question.notice")
                }
                Button(t("Return to the same Trip context", "返回同一行程上下文")) { stop(); dismiss() }
                Link(t("Explore other places", "探索其他地点"), destination: URL(string: "visepanda://explore")!)
            }.padding()
        }
        .navigationTitle(t("Place guide", "地点讲解"))
        .task(id: scope) {
            guard scope == selection.scope else { stop(); store.clear(); followUp.clear(); return }
            store.guideCacheFollowUp = followUp; store.bind(selection, explicit: false); followUp.bind(selection); audio.bind(scope: scope)
            repeat {
                await refresh()
                do { try await Task.sleep(for: .seconds(20)) } catch { return }
            } while !Task.isCancelled && scope == selection.scope
        }
        .onChange(of: scope) { _, current in
            if current != selection.scope { stop(); store.suspend(); followUp.suspend(); exportText = nil }
        }
        .onDisappear { stop(); store.suspend(); followUp.suspend(); exportText = nil }
        .onChange(of: store.guideCacheGeneration) { _, _ in
            exportText = nil; exportDeadline = 0; exportExpiry?.cancel(); exportExpiry = nil
        }
    }

    @ViewBuilder private func content(_ ready: NativePlaceGuideReady) -> some View {
        Text(chinese ? ready.place.zh : ready.place.en).font(.headline).accessibilityIdentifier("guide.place")
        Text(t("Published practical facts · history and legends are not covered", "已发布实用事实 · 不覆盖历史与传说")).font(.caption)
        Text(t("Cached replay uses 0 Ask units. New questions use the original task allowance; generation cost is unknown until measured.", "许可内缓存重播使用 0 Ask 单位。新增追问按原任务额度处理；生成费用在核算前保持未知。"))
            .font(.caption).accessibilityIdentifier("guide.billing")
        ForEach(ready.segments) { segment in
            VStack(alignment: .leading, spacing: 8) {
                Text(t("Published fact", "已发布事实")).font(.caption.bold())
                Text(segment.text).textSelection(.enabled).accessibilityIdentifier("guide.caption.\(segment.id)")
                ForEach(Array(segment.conditions.enumerated()), id: \.offset) { Text(t("Applies when: ", "适用条件：") + $0.element).font(.caption) }
                ForEach(Array(segment.exclusions.enumerated()), id: \.offset) { Text(t("Does not cover: ", "不适用：") + $0.element).font(.caption) }
                Text(t("Source revision valid until: ", "来源版本有效至：") + segment.expiresAt).font(.caption)
                ForEach(segment.sources, id: \.sourceRevisionId) { source in
                    if let url = source.url { Link(source.publisher + " · " + source.revisionLabel + " · " + source.locator, destination: url).font(.caption) }
                }
                if ready.completedSegmentIds.contains(segment.id) || store.progress.completedSegmentIDs.contains(segment.id) {
                    Text(t("Speech reached the end of this segment", "语音已到达此段末尾")).font(.caption)
                }
                if store.progress.segmentID == segment.id {
                    Text(t("Conservative speech position: ", "保守语音位置：") + "\(store.progress.characters)/\(segment.speechText.utf16.count)")
                        .font(.caption).accessibilityIdentifier("guide.progress")
                }
                if ready.rights.tts {
                    Button(t("Play / replay this segment", "播放／重播此段")) { run { await play(segment, ready: ready, resume: false) } }
                        .disabled(store.busy || audio.phase != .idle || audio.cleanupPending).accessibilityIdentifier("guide.play.\(segment.id)")
                    if audio.guidePlaybackID == ready.digest + ":" + segment.id {
                        Button(audio.guidePaused ? t("Recheck and continue", "核对后继续") : t("Pause", "暂停")) {
                            if audio.guidePaused { run { await play(segment, ready: ready, resume: true) } }
                            else { audio.pauseGuide() }
                        }.disabled(store.busy).accessibilityIdentifier("guide.pauseResume")
                        Button(t("Stop", "停止")) { audio.cancel() }.accessibilityIdentifier("guide.stop")
                    } else if audio.phase == .idle, store.progress.segmentID == segment.id,
                              store.progress.characters > 0, store.progress.characters < segment.speechText.utf16.count {
                        Button(t("Recheck and continue from speech position", "核对后从语音位置续播")) {
                            run { await play(segment, ready: ready, resume: false, offset: store.progress.characters) }
                        }.disabled(store.busy).accessibilityIdentifier("guide.continue")
                    }
                } else { Text(t("Speech use is not licensed. Captions remain readable.", "未获准语音用途，仍可阅读字幕。")) }
            }.padding().background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        if audio.failure != nil { Text(t("Local speech is unavailable or interrupted. Read the captions; playback only starts when you choose it.", "本机语音不可用或已中断，可阅读字幕；只有明确选择才会播放。")) }
    }

    @ViewBuilder private func question(_ ready: NativePlaceGuideReady) -> some View {
        Text(t("Ask VP about this place", "就此地点问 VP")).font(.headline)
        if let policy = followUp.policy {
            Text(chinese ? policy.noticeZh : policy.noticeEn).font(.caption)
            Text(t("Recipient: ", "接收方：") + policy.recipient + " · " + policy.processingRegion).font(.caption)
            Button(policy.consentState == .accepted ? t("Withdraw processing consent", "撤回处理同意") : t("Agree to question processing", "同意处理追问")) {
                audio.cancel()
                run { await followUp.consent(accept: policy.consentState != .accepted, using: session); await refresh() }
            }.disabled(followUp.busy).accessibilityIdentifier("guide.consent")
        }
        NativePlaceGuideCapturePanel(followUp: followUp, selection: selection, active: scope == selection.scope && !followUp.busy && followUp.pending == nil)
        TextField(t("Review the final transcript or type a question", "核对最终字幕或输入追问"), text: $followUp.draft, axis: .vertical)
            .lineLimit(3...6).disabled(followUp.pending != nil || followUp.busy).accessibilityIdentifier("guide.question.review")
        Button(followUp.pending == nil ? t("Confirm question and send", "确认追问并发送") : t("Explicitly retry the same question", "明确重试同一追问")) {
            audio.cancel()
            run {
                guard await store.read(replay: true, current: { scope }, request: request) else { return }
                await store.saveProgress(current: { scope }, request: request)
                await followUp.send(using: session, guide: store)
                await followUp.refresh(using: session, guide: store)
            }
        }.disabled(!followUp.canSend || scope != selection.scope).accessibilityIdentifier("guide.question.send")
        Text(t("This question includes the selected place, interest and completed segments. You review the text before it leaves this device; recording itself is never uploaded.", "本追问包含所选地点、兴趣及已完成段落。文字须核对后才离开本机；录音本身不会上传。"))
            .font(.caption)
    }

    @ViewBuilder private func answer(_ turn: NativeTextTurn) -> some View {
        Text(t("VP · Original task response", "VP · 原任务回复")).font(.headline)
        if let knowledge = turn.result?.knowledge {
            NativeKnowledgeCards(rows: knowledge.statements, answer: knowledge.answer, chinese: chinese)
        } else {
            Text(turn.waiting ? t("The original task is working. Refresh reads its status.", "原任务正在处理，刷新读取其状态。")
                : t("The current sources do not support an answer. Explore another place or check official information.", "当前来源不足以支持答案，请探索其他地点或核对官方信息。"))
        }
    }

    private func refresh(explicit: Bool = false) async {
        guard scope == selection.scope, !store.busy, !followUp.busy else { return }
        if explicit { store.bind(selection) }
        guard store.selection == selection else { return }
        let cacheGeneration = store.guideCacheGeneration
        let previous = store.visible(scope)
        let valid = await store.read(explicit: explicit, current: { scope }, request: request)
        guard store.guideCacheGeneration == cacheGeneration, store.selection == selection else { return }
        guard valid, let ready = store.visible(scope), store.selection == selection else {
            audio.cancel(); exportText = nil; followUp.sourceUnavailable(using: session)
            await followUp.refresh(using: session, guide: store); return
        }
        if !ready.rights.prompt { followUp.sourceUnavailable(using: session) }
        if previous?.digest != ready.digest { exportText = nil }
        if let id = audio.guidePlaybackID {
            if let segment = ready.segments.first(where: { ready.digest + ":" + $0.id == id }), previous?.digest == ready.digest, ready.rights.tts,
               let expiry = ready.playbackExpiresAt {
                audio.renewGuide(id: id, text: segment.speechText, localeIdentifier: chinese ? "zh-CN" : "en-US",
                    expiresAt: expiry)
            } else { audio.cancel() }
        }
        await followUp.refresh(using: session, guide: store)
    }
    private func play(_ segment: NativePlaceGuideSegment, ready original: NativePlaceGuideReady, resume: Bool, offset: Int = 0) async {
        guard scope == selection.scope else { return }
        guard await store.read(replay: true, current: { scope }, request: request),
              let ready = store.visible(scope), ready.digest == original.digest, ready.rights.tts,
              let fresh = ready.segments.first(where: { $0.id == segment.id }), fresh == segment else { audio.cancel(); return }
        let id = ready.digest + ":" + segment.id
        audio.bind(scope: scope); selectedSegmentID = segment.id
        let cacheGeneration = store.guideCacheGeneration
        audio.onGuideProgress = { playbackID, finished, characters in
            guard store.guideCacheGeneration == cacheGeneration, playbackID == id, scope == selection.scope, store.visible(scope)?.digest == ready.digest else { return }
            store.advance(id: segment.id, characters: characters, finished: finished, current: scope)
            if finished { run { await store.saveProgress(current: { scope }, request: request) } }
        }
        guard let expiry = ready.playbackExpiresAt else { audio.cancel(); return }
        if resume { audio.resumeGuide(id: id, text: fresh.speechText, localeIdentifier: chinese ? "zh-CN" : "en-US", expiresAt: expiry) }
        else { audio.speakGuide(id: id, text: fresh.speechText, localeIdentifier: chinese ? "zh-CN" : "en-US", expiresAt: expiry, offset: offset) }
    }
    private func exportProgress() async {
        let generation = store.guideCacheGeneration
        exportText = nil
        do {
            let bytes = try await request(selection, selection.command("export"))
            guard generation == store.guideCacheGeneration, store.selection == selection, scope == selection.scope, !Task.isCancelled else { return }
            exportText = try NativePlaceGuideMetadataExport.decode(bytes, expected: selection)
            exportDeadline = ProcessInfo.processInfo.systemUptime + 30
            exportExpiry?.cancel(); exportExpiry = Task { try? await Task.sleep(for: .seconds(30)); if !Task.isCancelled { exportText = nil; exportDeadline = 0 } }
        } catch { exportText = nil }
    }
    private func run(_ operation: @escaping @MainActor () async -> Void) {
        let generation = store.guideCacheGeneration
        action?.cancel(); action = Task { guard generation == store.guideCacheGeneration else { return }; await operation() }
    }
    private func stop() { action?.cancel(); action = nil; exportExpiry?.cancel(); exportExpiry = nil; exportText = nil; exportDeadline = 0; audio.cancel(); audio.onGuideProgress = nil; audio.onFinalTranscript = nil }
    private func message(_ notice: String) -> String {
        if notice == "forgotten" { return t("Stored guide metadata deleted.", "已删除存储的讲解元数据。") }
        if notice == "delete_unconfirmed" { return t("Deletion is unconfirmed. Retry before assuming cleanup.", "删除回执未确认，请重试；尚未宣称已清理。") }
        return t("Sources, permissions or the Trip changed or cannot be verified. Recheck before continuing.", "来源、权限或行程已变化，或无法核实。继续前请重新核对。")
    }
}
