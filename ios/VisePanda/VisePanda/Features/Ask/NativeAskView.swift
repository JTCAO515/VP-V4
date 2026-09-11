import SwiftUI

struct NativeAskView: View {
    @Environment(AppSettings.self) private var settings
    @State private var store = NativeAskStore()
    @State private var reviewed = false
    @State private var showNotice = true
    @FocusState private var composing: Bool
    init(store: NativeAskStore = NativeAskStore()) { _store = State(initialValue: store) }

    private var session: NativeSession { settings.nativeSession }
    private var active: Bool { session.dataScope != nil && store.scope == session.dataScope }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text("ask.local.title").font(.headline).foregroundStyle(Color.vpSecondaryText)
                if !active {
                    Text("ask.local.signin")
                } else {
                    if let policy = store.policy { consent(policy) }
                    else { Text("ask.local.unavailable").accessibilityIdentifier("native-ask.unavailable") }
                    if store.hasObsoletePending {
                        Text("ask.task.uncertain").font(.footnote)
                        Button("ask.task.stop_previous") { Task { await store.stopPreviousRequest(using: session) } }
                            .disabled(store.busy).accessibilityIdentifier("native-ask.stop-previous")
                    }
                    if store.notice != nil { Text("ask.local.retry_hint").font(.footnote).accessibilityIdentifier("native-ask.error") }
                    Text("ask.local.history").font(.title2.bold())
                    ForEach(store.turns) { turn in result(turn) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            if active && store.policy?.consentState == .accepted { composer }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("ask.local.reload") { Task { await store.reload(using: session) } }
                    .disabled(store.busy || session.dataScope == nil)
                    .accessibilityIdentifier("native-ask.reload")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("ask.done") { composing = false }
            }
        }
        .vpNavigationTitle("tab.ask")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: session.dataScope) {
            reviewed = false
            store.reset(for: session.retainedDataScope)
            if session.dataScope == nil { store.suspendReads() }
            else if !session.busy { await store.reload(using: session) }
        }
        .task(id: store.pollKey) {
            guard !store.pollKey.isEmpty else { return }
            let initial = session.dataScope
            for _ in 0..<60 {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard !Task.isCancelled, initial == session.dataScope, !store.pollKey.isEmpty else { return }
                if !store.busy { await store.reload(using: session) }
            }
        }
        .onChange(of: session.retainedDataScope) { _, retained in
            store.reset(for: retained)
            reviewed = false
        }
        .onChange(of: session.busy) { wasBusy, busy in
            if wasBusy && !busy && session.dataScope != nil {
                Task { await store.reload(using: session) }
            }
        }
        .onChange(of: store.noticeIdentity) { _, _ in reviewed = false; showNotice = true }
    }

    private func consent(_ policy: NativeTextPolicy) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            DisclosureGroup("ask.local.notice", isExpanded: $showNotice) {
                Text(settings.selectedLocale == .zh ? policy.noticeZh : policy.noticeEn)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
                    .accessibilityIdentifier("native-ask.notice")
            }
            switch policy.consentState {
            case .notAccepted:
                Toggle("ask.local.agree", isOn: $reviewed)
                    .accessibilityIdentifier("native-ask.agree")
                Button("ask.local.accept") { Task { await store.accept(reviewed: policy, using: session) } }
                    .buttonStyle(.borderedProminent)
                    .disabled(!reviewed || store.busy)
                    .accessibilityIdentifier("native-ask.accept")
            case .accepted:
                Button("ask.local.withdraw", role: .destructive) { Task { await store.withdraw(using: session) } }
                    .disabled(store.busy)
                    .accessibilityIdentifier("native-ask.withdraw")
            case .withdrawn:
                Text("ask.local.withdrawn").accessibilityIdentifier("native-ask.withdrawn")
            }
        }
        .padding(16)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }

    private func result(_ turn: NativeTextTurn) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(turn.input).font(.headline)
            Text(LocalizedStringKey(label(turn))).font(.caption.bold()).foregroundStyle(Color.vpSecondaryText)
            if let output = turn.output {
                Text(output).textSelection(.enabled).accessibilityIdentifier("native-ask.answer.\(turn.id)")
            }
            if turn.waiting {
                Button("ask.local.cancel") { Task { await store.cancel(turn, using: session) } }
                    .disabled(store.busy)
                    .accessibilityIdentifier("native-ask.cancel.\(turn.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if store.mode == .taskContext {
                HStack {
                    Text(LocalizedStringKey(store.intentLabel)).font(.caption)
                        .accessibilityIdentifier("native-ask.intent")
                    Spacer()
                    Button("ask.task.new") { store.startNewQuestion() }
                        .disabled(!store.canStartNew)
                        .accessibilityIdentifier("native-ask.new-question")
                }
            }
            TextField("ask.placeholder", text: $store.draft, axis: .vertical)
                .lineLimit(1...5).focused($composing)
                .disabled(store.busy || store.pending != nil)
                .accessibilityIdentifier("native-ask.input")
            HStack {
                Text("\(store.draft.utf16.count)/4000").font(.caption).monospacedDigit()
                Spacer()
                Button(LocalizedStringKey(store.pending == nil ? "ask.send" : "ask.local.retry_original")) {
                    composing = false
                    Task { await store.send(locale: settings.selectedLocale == .zh ? "zh" : settings.selectedLocale.rawValue, using: session) }
                }
                .buttonStyle(.borderedProminent).disabled(!store.canSend)
                .accessibilityIdentifier("native-ask.send")
            }
        }
        .padding(VPSpacing.standard)
        .background(.bar)
    }
    private func label(_ turn: NativeTextTurn) -> String {
        if turn.waiting { return "ask.local.waiting" }
        if turn.status == "cancelled" { return "ask.local.cancelled" }
        return "ask.local." + (turn.outcome?.rawValue ?? "technical_failure")
    }
}
