import SwiftUI

/// Read-only attachment. The caller supplies a qualified canonical Task selection;
/// the session and server retain authority. No receipt or progress is synthesized.
struct NativeTaskActivityView: View {
    let selection: NativeTaskActivitySelection?
    let isPresented: Bool
    let session: NativeSession
    let chinese: Bool
    var onInvalidate: () -> Void = {}
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeTaskActivityStore()
    private var active: Bool { isPresented && scenePhase == .active }
    private var current: NativeTaskActivitySelection? {
        guard let selection, selection.valid, session.dataScope == selection.scope else { return nil }
        return selection
    }
    private struct LoadKey: Equatable { let selection: NativeTaskActivitySelection?; let active: Bool }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(chinese ? "任务活动" : "Task activity").font(.headline)
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let value = store.visible(selection: current, active: active) {
                    Text(status(value.turnStatus)).font(.subheadline)
                    if value.recording == .unrecorded {
                        Text(chinese ? "尚无可读取的活动回执。不能据此判断任务已完成或工具未执行。" : "No readable activity receipt is recorded. This does not establish completion or that a tool was not executed.")
                            .font(.footnote)
                    } else {
                        ForEach(Array(value.actions.enumerated()), id: \.offset) { _, action in
                            HStack(alignment: .top) {
                                Text(tool(action.tool))
                                Spacer()
                                Text(receipt(action.state))
                            }.font(.subheadline)
                        }
                        Text(chinese ? "这里只显示已记录的工具回执；回执数量不代表任务进度或完成。" : "These are recorded tool receipts. Their number does not establish progress or Task completion.").font(.footnote)
                    }
                } else if store.state == .loading && active && current != nil {
                    ProgressView(chinese ? "正在读取活动" : "Reading activity")
                } else {
                    Text(chinese ? "活动暂不可用或已过期，请重新核对。" : "Activity is unavailable or expired. Recheck to continue.").font(.footnote)
                }
            }
            Button(chinese ? "重新核对活动" : "Recheck activity") { Task { await load() } }
                .disabled(!active || current == nil || store.state == .loading)
                .accessibilityIdentifier("assistant.activity.refresh")
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("assistant.activity")
        .task(id: LoadKey(selection: current, active: active)) {
            guard !Task.isCancelled else { return }
            store.bind(selection: current, active: active)
            await load()
        }
        .onChange(of: LoadKey(selection: current, active: active)) { _, key in
            store.bind(selection: key.selection, active: key.active)
        }
        .onChange(of: session.assistantEventsInvalidation?.id) { _, _ in
            guard let signal = session.assistantEventsInvalidation, let current,
                  signal.matches(scope: current.scope, sessionID: (try? session.communitySafetyActor())?.sessionID) else { return }
            if signal.object == nil || signal.object == .task(current.taskID) { store.clear() }
        }
        .onChange(of: session.turnDataErasure?.id) { _, _ in
            guard let erased = session.turnDataErasure,
                  (try? session.communitySafetyActor()) == erased.actor else { return }
            store.applyTurnErasure(erased)
        }
        .onDisappear { store.bind(selection: nil, active: false) }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                if store.expireIfNeeded() { onInvalidate() }
            }
        }
    }
    private func load() async {
        await store.load(selection: current, currentSelection: { session.dataScope == store.boundSelection?.scope ? store.boundSelection : nil }, active: { store.boundActive }, request: { conversation, task in
            try await session.taskActivityRequest(conversationID: conversation, taskID: task)
        })
    }
    private func tool(_ value: NativeTaskActivity.Tool) -> String {
        switch value {
        case .evidence: return chinese ? "证据查找" : "Evidence lookup"
        case .place: return chinese ? "地点读取" : "Place read"
        case .constraints: return chinese ? "条件核对" : "Constraint evaluation"
        case .result: return chinese ? "成果准备" : "Result preparation"
        }
    }
    private func receipt(_ value: NativeTaskActivity.ReceiptState) -> String {
        switch value {
        case .started: return chinese ? "已开始" : "Started"
        case .completed: return chinese ? "回执已完成" : "Receipt completed"
        case .unknown: return chinese ? "结果未确认" : "Outcome unknown"
        }
    }
    private func status(_ value: NativeTaskActivity.TurnStatus) -> String {
        switch value {
        case .accepted: return chinese ? "任务已接纳" : "Task accepted"
        case .planning: return chinese ? "任务规划中" : "Task planning"
        case .retrieving: return chinese ? "任务检索中" : "Task retrieving"
        case .generating: return chinese ? "任务生成中" : "Task generating"
        case .validating: return chinese ? "任务核对中" : "Task validating"
        case .completed: return chinese ? "任务已完成" : "Task completed"
        case .failed: return chinese ? "任务失败" : "Task failed"
        case .cancelled: return chinese ? "任务已取消" : "Task cancelled"
        case .unavailable: return chinese ? "任务不可用" : "Task unavailable"
        }
    }
}
