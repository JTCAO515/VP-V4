import SwiftUI

/// Main supplies the outer NavigationStack and shared four-tab fixture state.
/// This leaf never creates a parallel conversation/domain store or transport.
@MainActor struct NativeFrontendChatView: View {
    let state: NativeFrontendState
    var onOpenExpression: (() -> Void)? = nil
    var onOpenPlace: (() -> Void)? = nil
    @Environment(\.dynamicTypeSize) private var typeSize
    @FocusState private var composerFocused: Bool
    @State private var sheet: Sheet?
    private enum Sheet: String, Identifiable {
        case attachment, voice, translationUnavailable, placeUnavailable, confirmation
        var id: String { rawValue }
    }
    private var plan: NativeFrontendMaterial? { state.materials.first { $0.id == "sample-plan" } }
    private var journey: NativeFrontendJourney? { plan.flatMap { material in state.journeys.first { $0.id == material.journeyID } } }
    private var canSubmit: Bool {
        let text = state.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && text.count <= 2000 && state.screenState != .loading && state.screenState != .failed
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    heading
                    NativeFrontendBoundary()
                    if let context = state.chatContext, !context.isEmpty { contextCard(context) }
                    if state.screenState == .ready {
                        if state.messages.count <= 1 && state.chatContext == nil { firstVisit }
                        else { returnCard }
                        ForEach(state.messages) { message in messageRow(message) }
                        if state.pendingConfirmation { resultCard }
                    } else {
                        NativeFrontendStatePanel(state: state).frame(maxWidth: .infinity).padding(.vertical, 28)
                        if state.screenState == .empty {
                            Button("从一句想法开始") { state.screenState = .ready; composerFocused = true }
                                .buttonStyle(.bordered)
                        }
                    }
                    if let notice = state.notice {
                        Label(notice, systemImage: "info.circle").font(.footnote).foregroundStyle(.secondary)
                            .accessibilityIdentifier("frontend.chat.notice")
                    }
                    Color.clear.frame(height: 1).id("chat-bottom")
                }
                .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 16)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: state.messages.count) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("chat-bottom", anchor: .bottom) }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        }
        .navigationTitle(state.assistantName)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { target in
            NativeFrontendChatSheet(state: state, kind: target.rawValue, close: { sheet = nil },
                insert: { text in state.draft = text; sheet = nil; composerFocused = true })
        }
    }

    private var heading: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                Text("今天，想从哪里开始？").font(.title2.weight(.semibold))
                Text(state.assistantTagline).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Menu {
                ForEach(NativeFrontendScreenState.allCases) { value in
                    Button(value.title) { composerFocused = false; state.screenState = value }
                }
                Divider()
                Button("重置本地内容样例", role: .destructive) { composerFocused = false; state.reset() }
            } label: { Image(systemName: "ellipsis.circle").font(.title3).frame(width: 44, height: 44) }
            .accessibilityLabel("对话样例状态与重置").accessibilityIdentifier("frontend.chat.states")
        }
    }
    private var firstVisit: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("不用先填完整计划").font(.headline)
            Text("一句还没确定日期的想法也可以。以下建议只填入草稿，由你确认发送。")
                .font(.subheadline).foregroundStyle(.secondary)
            suggestion("想找个地方慢慢走走，日期还没定", icon: "leaf")
            suggestion("继续看看上次的上海漫步安排", icon: "arrow.turn.down.right")
            suggestion("把这次行程安排得更轻松一点", icon: "sun.max")
        }.cardSurface()
    }
    private func suggestion(_ text: String, icon: String) -> some View {
        Button { state.draft = text; composerFocused = true } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon).frame(width: 22)
                Text(text).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.left").font(.caption)
            }.font(.subheadline).foregroundStyle(.primary).padding(12)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }.buttonStyle(.plain)
    }
    private var returnCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("继续同一段旅程").font(.headline)
            if let journey {
                Text(journey.title).font(.subheadline)
                Text(journey.confirmed ? "上次决定：已确认这份本地样例安排。" : "上次决定：样例安排尚未确认。")
                    .font(.footnote).foregroundStyle(.secondary)
                Button("回到这段旅程") { composerFocused = false; state.openJourney(journey.id) }
                    .accessibilityIdentifier("frontend.chat.journey")
            } else { Text("尚无可关联的样例旅程，继续说明想法即可。").font(.footnote).foregroundStyle(.secondary) }
            Text("没有新的真实进展；继续输入不会新建另一段样例旅程。").font(.footnote).foregroundStyle(.secondary)
        }.cardSurface()
    }
    private func contextCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("本次带入的样例上下文", systemImage: "link").font(.caption).foregroundStyle(.secondary)
            Text(state.journeys.first(where: { $0.id == text })?.title ?? text)
                .font(.subheadline).textSelection(.enabled)
            Button("暂时不用这段上下文") { state.chatContext = nil }
                .font(.caption).accessibilityIdentifier("frontend.chat.context.clear")
        }.cardSurface()
    }
    private func messageRow(_ message: NativeFrontendMessage) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if message.user { Spacer(minLength: typeSize.isAccessibilitySize ? 0 : 32) }
            VStack(alignment: .leading, spacing: 6) {
                Text(message.user ? "你" : state.assistantName).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                Text(message.text).font(.body).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16).background(message.user ? Color.accentColor.opacity(0.08) : Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
            if !message.user { Spacer(minLength: typeSize.isAccessibilitySize ? 0 : 24) }
        }.accessibilityElement(children: .combine)
    }
    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("一份可以继续调整的安排", systemImage: "doc.text").font(.headline)
            if let plan, let journey {
                Text(plan.title).font(.title3.weight(.semibold))
                Text(plan.content).font(.subheadline).foregroundStyle(.secondary)
                ForEach(Array(journey.days.enumerated()), id: \.offset) { _, day in Text(day).font(.subheadline) }
                Text("同一份本地样例 · 地点、路线和服务均未核实").font(.caption).foregroundStyle(.secondary)
                ViewThatFits(in: .horizontal) {
                    HStack { materialButton(plan); confirmationButton }
                    VStack(alignment: .leading, spacing: 12) { materialButton(plan); confirmationButton }
                }
                Button("先不确认，继续聊聊") { state.cancelPlan(); composerFocused = true }
                    .font(.subheadline).accessibilityIdentifier("frontend.chat.plan.skip")
            } else {
                Text("样例资料或关联旅程不可用，不能确认。").foregroundStyle(.secondary)
            }
        }.cardSurface().accessibilityIdentifier("frontend.chat.plan")
    }
    private func materialButton(_ plan: NativeFrontendMaterial) -> some View {
        Button("查看完整资料") { composerFocused = false; state.openMaterial(plan.id) }.buttonStyle(.bordered)
            .accessibilityIdentifier("frontend.chat.material")
    }
    private var confirmationButton: some View {
        Button("查看变化并确认") { composerFocused = false; sheet = .confirmation }.buttonStyle(.borderedProminent)
            .accessibilityIdentifier("frontend.chat.plan.review")
    }
    private var composer: some View {
        VStack(spacing: 10) {
            HStack(alignment: .bottom, spacing: 10) {
                Button { composerFocused = false; sheet = .attachment } label: { Image(systemName: "plus").frame(width: 36, height: 44) }
                    .accessibilityLabel("添加样例资料").accessibilityIdentifier("frontend.chat.attachment")
                @Bindable var editable = state
                TextField("说一个想法，或继续上次的话题…", text: $editable.draft, axis: .vertical)
                    .lineLimit(1...5).focused($composerFocused).accessibilityIdentifier("frontend.chat.composer")
                Button {
                    guard canSubmit else { return }
                    if state.screenState != .ready { state.screenState = .ready }
                    state.submit(); composerFocused = false
                } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 40, height: 40).background(canSubmit ? Color.accentColor : Color.secondary.opacity(0.25), in: Circle()).foregroundStyle(.white) }
                .disabled(!canSubmit).accessibilityLabel("发送本地样例消息").accessibilityIdentifier("frontend.chat.send")
            }.padding(10).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
            if state.draft.count > 2000 { Text("请缩短到2000个字符以内，原文不会截断。").font(.caption).foregroundStyle(.secondary) }
            HStack(spacing: 18) {
                ScrollView(.horizontal) {
                    HStack(spacing: 18) {
                        Button { composerFocused = false; sheet = .voice } label: { Label("语音", systemImage: "waveform") }
                        Button { composerFocused = false; if let onOpenExpression { onOpenExpression() } else { sheet = .translationUnavailable } } label: { Label("表达", systemImage: "character.bubble") }
                        Button { composerFocused = false; if let onOpenPlace { onOpenPlace() } else { sheet = .placeUnavailable } } label: { Label("地点", systemImage: "mappin") }
                    }.fixedSize(horizontal: true, vertical: false)
                }.scrollIndicators(.hidden)
                if composerFocused { Button("完成") { composerFocused = false }.fixedSize() }
            }.font(.caption).buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 8)
        .background(.regularMaterial)
    }
}

private extension View {
    func cardSurface() -> some View {
        padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
    }
}
