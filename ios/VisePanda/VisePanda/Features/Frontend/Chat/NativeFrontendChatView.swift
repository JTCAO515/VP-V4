import SwiftUI
import UIKit

/// Main supplies the outer NavigationStack and shared four-tab fixture state.
/// This leaf never creates a parallel conversation/domain store or transport.
@MainActor struct NativeFrontendChatView: View {
    let state: NativeFrontendState
    var onOpenExpression: (() -> Void)? = nil
    var onOpenPlace: (() -> Void)? = nil
    @Environment(\.dynamicTypeSize) private var typeSize
    var avatarImage: Image? = nil
    var avatarScale: CGFloat = 1
    var avatarVerticalOffset: CGFloat = 0
    var onShowAssistant: (() -> Void)? = nil
    @State private var sidebarVisible = false
    @State private var sheet: Sheet?
    private enum Sheet: String, Identifiable {
        case attachment, voice, translationUnavailable, placeUnavailable, confirmation, referral, assistantUnavailable
        var id: String { rawValue }
    }
    private var plan: NativeFrontendMaterial? { state.materials.first { $0.id == "sample-plan" } }
    private var journey: NativeFrontendJourney? { plan.flatMap { material in state.journeys.first { $0.id == material.journeyID } } }
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                Color(uiColor: .systemBackground).ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 20) {
                            // Initial/latest content has a readable resting position;
                            // scrolling content may pass behind the floating controls.
                            Color.clear.frame(height: 94).id("chat-start")
                            if let context = state.chatContext, !context.isEmpty { contextCard(context) }
                            if state.screenState == .ready {
                                ForEach(state.messages) { message in messageRow(message) }
                                if state.pendingConfirmation { resultCard }
                            } else if state.screenState != .empty {
                                NativeFrontendStatePanel(state: state).frame(maxWidth: .infinity).padding(.vertical, 20)
                            }
                            if let notice = state.notice {
                                Text(notice).font(.footnote).foregroundStyle(.secondary)
                                    .accessibilityIdentifier("frontend.chat.notice")
                            }
                            NativeFrontendBoundary()
                            Color.clear.frame(height: 1).id("chat-bottom")
                        }
                        .padding(.horizontal, 20).padding(.bottom, 12)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: state.messages.count) { _, _ in
                        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                    }
                    .onChange(of: state.activeLocalConversationID) { _, _ in
                        sidebarVisible = false; sheet = nil
                        proxy.scrollTo(state.messages.isEmpty ? "chat-start" : "chat-bottom", anchor: state.messages.isEmpty ? .top : .bottom)
                    }
                    .safeAreaInset(edge: .bottom, spacing: 0) { composer }
                }
                .accessibilityHidden(sidebarVisible)
                NativeMuseChatHeader(avatarImage: avatarImage, avatarScale: avatarScale,
                    avatarVerticalOffset: avatarVerticalOffset,
                    sidebar: { dismissKeyboard(); withAnimation(.easeOut(duration: 0.2)) { sidebarVisible = true } },
                    assistant: { dismissKeyboard(); if let onShowAssistant { onShowAssistant() } else { sheet = .assistantUnavailable } },
                    referral: { dismissKeyboard(); sheet = .referral })
                    .accessibilityHidden(sidebarVisible)
                if sidebarVisible {
                    Button { closeSidebar() } label: { Color.black.opacity(0.18) }
                        .buttonStyle(.plain).ignoresSafeArea().accessibilityLabel("关闭侧栏")
                        .accessibilityIdentifier("muse.chat.sidebar.scrim")
                    NativeMuseChatSidebarView(state: state, onClose: closeSidebar)
                        .frame(width: min(geometry.size.width * 0.86, 360), height: geometry.size.height)
                        .background(Color(uiColor: .systemBackground))
                        .transition(.move(edge: .leading)).zIndex(2)
                }
            }
        }
        .sheet(item: $sheet) { target in
            if target == .referral { NativeMuseChatReferralView(close: { sheet = nil }) }
            else {
                NativeFrontendChatSheet(state: state, kind: target.rawValue, close: { sheet = nil },
                    insert: { text in state.draft = text; sheet = nil })
            }
        }
    }
    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
    private func closeSidebar() { withAnimation(.easeOut(duration: 0.2)) { sidebarVisible = false } }
    private func linkedJourneyID(for context: String) -> String? {
        if state.journeys.contains(where: { $0.id == context }) { return context }
        guard let material = state.materials.first(where: { $0.id == context }),
              let id = material.journeyID, state.journeys.contains(where: { $0.id == id }) else { return nil }
        return id
    }
    private func contextCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("本次带入的样例上下文", systemImage: "link").font(.caption).foregroundStyle(.secondary)
            if let materialText = state.libraryChatText(materialID: text) {
                Text(materialText)
                    .font(.subheadline).textSelection(.enabled)
            } else {
                Text(state.journeys.first(where: { $0.id == text })?.title ?? text)
                    .font(.subheadline).textSelection(.enabled)
            }
            if let id = linkedJourneyID(for: text) {
                Button("查看关联旅程") {
                    guard state.chatContext == text, linkedJourneyID(for: text) == id else { return }
                    state.openJourney(id)
                }.font(.subheadline).accessibilityIdentifier("frontend.chat.journey")
            }
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
                Button("先不确认，继续聊聊") { state.cancelPlan() }
                    .font(.subheadline).accessibilityIdentifier("frontend.chat.plan.skip")
            } else {
                Text("样例资料或关联旅程不可用，不能确认。").foregroundStyle(.secondary)
            }
        }.cardSurface().accessibilityIdentifier("frontend.chat.plan")
    }
    private func materialButton(_ plan: NativeFrontendMaterial) -> some View {
        Button("查看完整资料") { state.openMaterial(plan.id) }.buttonStyle(.bordered)
            .accessibilityIdentifier("frontend.chat.material")
    }
    private var confirmationButton: some View {
        Button("查看变化并确认") { sheet = .confirmation }.buttonStyle(.borderedProminent)
            .accessibilityIdentifier("frontend.chat.plan.review")
    }
    private var composer: some View {
        NativeMuseChatComposerView(state: state,
            onAttach: { sheet = .attachment },
            onExpression: { if let onOpenExpression { onOpenExpression() } else { sheet = .translationUnavailable } },
            onPlace: { if let onOpenPlace { onOpenPlace() } else { sheet = .placeUnavailable } },
            onVoice: { sheet = .voice })
    }

}

private extension View {
    func cardSurface() -> some View {
        padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
    }
}
