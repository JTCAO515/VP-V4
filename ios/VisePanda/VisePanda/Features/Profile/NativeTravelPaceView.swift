import SwiftUI

struct NativeTravelPaceView: View {
    @Environment(AppSettings.self) private var settings
    @State private var store = NativeTravelPaceStore()
    @State private var selected: NativeTravelPace = .balanced
    @State private var consent = false
    @AccessibilityFocusState private var undoAccessibilityFocused: Bool
    @FocusState private var undoKeyboardFocused: Bool
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            if store.scope == session.dataScope, let toast = store.toast {
                Section {
                    HStack {
                        Text(text("Saved to memory", "已加入记忆"))
                        Spacer()
                        Button(text("Undo", "撤销")) { Task { await store.change("undo", using: session) } }
                            .disabled(store.busy)
                            .focused($undoKeyboardFocused)
                            .accessibilityFocused($undoAccessibilityFocused)
                            .accessibilityIdentifier("memory.pace.undo")
                    }
                    .accessibilityIdentifier("memory.pace.saved")
                    .task(id: "\(toast.operationId)-\(undoAccessibilityFocused)-\(undoKeyboardFocused)-\(store.busy)") {
                        guard !undoAccessibilityFocused, !undoKeyboardFocused, !store.busy else { return }
                        do { try await Task.sleep(for: .seconds(4)) } catch { return }
                        store.dismissToast(toast.operationId)
                    }
                }
            }
            Section(text("Travel pace", "旅行节奏")) {
                if let snapshot = store.snapshot, store.scope == session.dataScope {
                    Text(status(snapshot))
                        .accessibilityIdentifier("memory.pace.status")
                    Picker(text("Pace", "节奏"), selection: $selected) {
                        ForEach(NativeTravelPace.allCases, id: \.self) { pace in
                            Text(pace.label(chinese: chinese)).tag(pace)
                        }
                    }
                    Toggle(text("Remember for planning across my trips", "记住并用于我的跨行程规划"), isOn: $consent)
                        .accessibilityIdentifier("memory.pace.consent")
                    Text(text("Free and Pass both keep this choice. It is for local planning on this account, until you pause or withdraw it. It does not authorize sending your preference to an AI provider or changing a confirmed trip.",
                              "Free 和 Pass 均可保存。此选择用于本账号的本机规划，直到你暂停或撤回；不授权向 AI 提供商发送偏好，也不改变已确认行程。"))
                        .font(.footnote)
                    Button(text("Save for future trips", "保存用于以后行程")) {
                        Task { await store.save(selected, consent: consent, using: session) }
                    }.disabled(!consent || store.pending != nil)
                        .accessibilityIdentifier("memory.pace.save")
                    if snapshot.state == "explicit" {
                        Button(text("Pause use", "暂停使用")) { Task { await store.change("pause", using: session) } }
                            .disabled(store.pending != nil)
                    }
                    if snapshot.state == "explicit" || snapshot.state == "paused" {
                        Button(text("Withdraw saved pace", "撤回已保存节奏"), role: .destructive) {
                            Task { await store.change("revoke", using: session) }
                        }.disabled(store.pending != nil)
                    }
                } else {
                    Text(text("Load your saved choice to make a change.", "请先载入已保存选择，再进行修改。"))
                }
                if store.pending != nil {
                    Button(text("Retry the same change", "重试本次修改")) { Task { await store.retry(using: session) } }
                }
                Button(text("Refresh", "刷新")) { Task { await store.load(using: session) } }
            }.disabled(store.busy || session.dataScope == nil)
            if let notice = store.notice, store.scope == session.dataScope {
                Text(message(notice)).accessibilityIdentifier("memory.pace.notice")
            }
        }
        .navigationTitle(text("Saved travel pace", "已保存旅行节奏"))
        .task(id: session.dataScope) {
            store.reset(for: session.dataScope); consent = false; selected = .balanced
            await store.load(using: session)
            if let pace = store.snapshot?.travelPace { selected = pace }
        }
    }

    private func status(_ value: NativeTravelPaceSnapshot) -> String {
        switch value.state {
        case "explicit": text("Saved: ", "已保存：") + (value.travelPace?.label(chinese: chinese) ?? "")
        case "paused": text("Paused. Save again to resume with the scope shown below.", "已暂停。可按下方范围重新保存并启用。")
        case "revoked": text("Withdrawn. No saved pace will be used.", "已撤回，不使用已保存节奏。")
        default: text("No explicitly saved pace. The picker is not a saved preference.", "尚未明确保存节奏，下方选项不代表已保存偏好。")
        }
    }

    private func message(_ code: String) -> String {
        switch code {
        case "undone": text("Undone", "已撤销")
        case "pause": text("Use paused", "已暂停使用")
        case "revoke": text("Saved pace withdrawn", "已撤回保存的节奏")
        case "conflict": text("This choice changed. Refresh before making another change.", "此选择已变更，请刷新后再修改。")
        default: text("The result could not be confirmed. Retry the same change or refresh.", "尚未确认操作结果，请重试本次修改或刷新。")
        }
    }
}
