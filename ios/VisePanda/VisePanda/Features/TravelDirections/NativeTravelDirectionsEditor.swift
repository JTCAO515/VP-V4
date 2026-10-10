import SwiftUI

/// The caller supplies a currently qualified artifact and owns all network actions.
/// Selection, saving, and opening the existing proposal review are separate buttons.
struct NativeTravelDirectionsEditor: View {
    let options: [NativeTravelDirectionOption]
    let selectedID: String?
    let unknown: [String]
    let basisSummary: [String]
    let qualified: Bool
    let busy: Bool
    let chinese: Bool
    @Binding var editing: NativeTravelDirectionsEditing
    let select: (String) -> Void
    let save: () -> Void
    @FocusState private var focusedDay: String?

    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if !qualified {
                Label(t("依据已变化，请重新读取后继续。", "The basis changed. Reload before continuing."), systemImage: "arrow.clockwise")
                    .accessibilityIdentifier("directions.stale")
            }
            ForEach(options) { option in
                VStack(alignment: .leading, spacing: 8) {
                    Text(option.title).font(.headline)
                    Text(option.tradeoff).foregroundStyle(.secondary)
                    Button {
                        focusedDay = nil
                        select(option.id)
                    } label: {
                        Label(selectedID == option.id ? t("已选择此方向", "Selected direction") : t("选择此方向", "Choose this direction"),
                              systemImage: selectedID == option.id ? "checkmark.circle.fill" : "circle")
                    }
                    .disabled(!qualified || busy || selectedID == option.id)
                    .accessibilityIdentifier("directions.select.\(option.id)")
                }
            }
            if !basisSummary.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("本次使用的依据", "Basis used for this direction")).font(.headline)
                    ForEach(Array(basisSummary.enumerated()), id: \.offset) { _, line in Text(line).font(.footnote) }
                }
                .accessibilityIdentifier("directions.basis")
            }
            if !unknown.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("仍未知 · 可以先继续", "Still unknown · You can continue")).font(.headline)
                    ForEach(Array(unknown.enumerated()), id: \.offset) { _, line in Text(line).font(.footnote) }
                }
                .accessibilityIdentifier("directions.unknown")
            }
            Text(t("相对日草稿", "Relative-day draft")).font(.title3.bold())
            ForEach(editing.days) { day in
                VStack(alignment: .leading, spacing: 6) {
                    Text(t("第 \(day.relativeDay) 天 · \(day.city)", "Day \(day.relativeDay) · \(day.city)")).font(.headline)
                    TextField(t("目的地", "Destination"), text: Binding(
                        get: { editing.days.first(where: { $0.id == day.id })?.city ?? "" },
                        set: { editing.editDestination(id: day.id, city: $0) }))
                        .focused($focusedDay, equals: day.id).disabled(day.fixed || !qualified || busy)
                        .accessibilityIdentifier("directions.day.\(day.relativeDay).destination")
                    ForEach(day.activities.indices, id: \.self) { index in
                        TextField(t("当天主题 \(index + 1)", "Theme \(index + 1) for this day"), text: Binding(
                            get: {
                                guard let value = editing.days.first(where: { $0.id == day.id }), value.activities.indices.contains(index) else { return "" }
                                return value.activities[index]
                            },
                            set: { editing.edit(id: day.id, activity: index, title: $0) }), axis: .vertical)
                            .focused($focusedDay, equals: day.id)
                            .disabled(day.fixed || !qualified || busy)
                            .accessibilityIdentifier("directions.day.\(day.relativeDay).activity.\(index + 1)")
                    }
                    if day.fixed {
                        Label(t("用户固定安排", "Fixed by the traveller"), systemImage: "lock.fill").font(.footnote)
                    }
                }
            }
            Text(t("地点、路线、营业时间和价格仍待核验。日期或预算留空不会阻止保存方向草稿。", "Places, routes, hours and prices still need verification. Unknown dates or budget do not prevent saving a direction draft."))
                .font(.footnote).foregroundStyle(.secondary)
            if !editing.valid {
                Text(t("请核对每个目的地和主题：内容不能为空、重复或超长，不包含换行及首尾空格。", "Check every destination and theme: avoid empty, duplicate, oversized text, line breaks and surrounding spaces."))
                    .font(.footnote).accessibilityIdentifier("directions.edit.invalid")
            }
            Button(t("保存方向草稿", "Save direction draft")) { focusedDay = nil; save() }
                .disabled(!qualified || busy || !editing.valid || selectedID == nil)
                .accessibilityIdentifier("directions.save")
            if editing.hasChanges {
                Text(t("先保存修改，再审阅行程提议。", "Save your changes before reviewing a Trip proposal."))
                    .font(.footnote)
                Button(t("放弃未保存修改", "Discard unsaved changes"), role: .destructive) {
                    focusedDay = nil
                    editing.discard()
                }
                .disabled(busy)
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(t("完成", "Done")) { focusedDay = nil }
            }
        }
    }
}
