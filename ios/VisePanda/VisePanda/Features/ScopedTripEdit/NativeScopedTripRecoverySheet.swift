import SwiftUI

/// Recovery stays reachable even if a concurrent edit removed the selected item.
/// Fresh actor/Trip access is required, but reads never pretend the old scope is current.
struct NativeScopedTripRecoverySheet: View {
    let journal: NativeScopedTripJournal
    let tripStore: NativeTripStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var store = NativeScopedTripEditStore()
    @State private var abandonVisible = false
    private func t(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var current: Bool {
        guard let actor = session.dataScope else { return false }
        return journal.matches(actor) && tripStore.scope == actor && tripStore.selectedID == journal.tripID
        && tripStore.detail?.trip.id == journal.tripID && tripStore.detail?.confirmationState == "confirmed"
    }
    var body: some View {
        NavigationStack {
            Form {
                Text(t("The original request is retained. Checking it does not confirm a proposal or cancel an order.", "原请求仍保留。查询不会确认提议或取消订单。"))
                if let notice = store.notice { Text(notice == "unknown" ? t("No verified outcome yet. The original request stays saved.", "尚无核实结果，原请求仍保留。") : notice == "cancelled" ? t("Pending operation stopped; existing Trip and orders retained.", "未决操作已停止，已有行程与订单保留。") : t("Return and reselect the current scope to review its result.", "请返回并重新选择当前选区，审阅结果。")) }
                Button(t("Check same operation", "查询同一操作")) { Task { await read("read") } }
                    .accessibilityIdentifier("trip.scoped.savedRecovery.read")
                Button(t("Stop pending operation…", "停止未决操作…"), role: .destructive) { abandonVisible = true }
                    .accessibilityIdentifier("trip.scoped.savedRecovery.abandon")
                Text(t("An absent receipt keeps the request pending. A committed proposal stays in the original review flow.", "没有回执仍保留为未决请求。已提交提议保留在原审阅流程。"))
            }.disabled(!current || store.busy)
                .navigationTitle(t("Pending local edit", "未决局部编辑"))
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("Return", "返回")) { dismiss() } } }
        }
        .confirmationDialog(t("Stop this pending operation?", "停止此未决操作？"), isPresented: $abandonVisible, titleVisibility: .visible) {
            Button(t("Stop pending operation", "停止未决操作"), role: .destructive) { Task { await read("abandon") } }
            Button(t("Keep waiting", "继续等待"), role: .cancel) {}
        } message: { Text(t("The server fences late execution. Existing proposals, Trip changes and external orders are retained.", "服务端会阻止迟到执行。已有提议、行程修改与外部订单保留。")) }
    }
    private func read(_ mode: String) async {
        guard current, await tripStore.refreshForSharing(using: session), current, let actor = session.dataScope else { return }
        await store.recover(mode: mode, tripID: journal.tripID, actor: actor, session: session, current: { current })
        if store.journal == nil { await tripStore.reload(using: session) }
    }
}
