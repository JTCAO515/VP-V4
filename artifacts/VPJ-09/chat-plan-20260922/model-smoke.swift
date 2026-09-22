// Run with the production NativeTripModels.swift prepended; Foundation only.
// This is a local model check, not Simulator, Auth, RLS or provider evidence.
var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ label: String) {
    precondition(condition(), label)
    checks += 1
}
let sample = NativeRelativeOutline.make(from: "第一次去上海四天，喜欢吃和散步，日期未定", chinese: true)!
check(sample.count == 4, "original Chinese input is consumed")
check(sample.hasAlternatives, "two interests offer a tradeoff")
check(sample.foodFirst != sample.walkFirst, "directions differ")
for (request, chinese, food) in [
    ("上海四天，只想吃美食，日期未定", true, true),
    ("Beijing for three days, neighborhood walks", false, false),
    ("广州五天，散步", true, false),
    ("Chongqing for two days, food", false, true)
] {
    let outline = NativeRelativeOutline.make(from: request, chinese: chinese)!
    check(!outline.hasAlternatives, "one interest does not force a second option")
    check(outline.initialTitles == (food ? outline.foodFirst : outline.walkFirst), "initial draft follows the explicit interest")
}
check(NativeRelativeOutline.make(from: "上海和北京四天，美食", chinese: true) == nil, "ambiguous city stays unsupported")
check(NativeRelativeOutline.make(from: "Shanghai four days food " + String(repeating: "x", count: 4000), chinese: false) == nil, "oversized input stays unsupported")
let existing = NativeTripDay(id: "existing", date: "2026-10-01", timeZone: "Asia/Shanghai", items: [.init(id: "dinner", dayId: "existing", title: "Confirmed dinner")])
let detail = NativeTripDetail(version: 2, trip: .init(id: UUID().uuidString, title: "Saved", headVersion: 3, updatedAt: "2026-09-22"), content: .init(days: [existing]), hardLocks: .notEnabled, externalOrderStatus: .notConnected)
var draft = NativeTripDraft(detail)
check(!draft.appendOutline(sample.initialTitles, starting: ""), "no guessed date")
check(!draft.appendOutline(sample.initialTitles, starting: "2026-02-30"), "reject invalid date")
check(!draft.appendOutline(sample.initialTitles, starting: "2026-09-30"), "reject overlap atomically")
check(draft.days == [existing], "invalid attempts preserve fixed content")
check(draft.appendOutline(sample.initialTitles, starting: "2026-10-02"), "explicit date creates local draft")
check(draft.days.first == existing, "old Trip content stays untouched")
check(draft.patch.expectedVersion == 3, "retain exact base version")
check(!draft.patch.operations.contains { $0.kind == .deleteDay || $0.kind == .deleteItem || $0.itemId == "dinner" }, "append only")
check(draft.patch.operations.allSatisfy { $0.startsAt == nil && $0.endsAt == nil }, "no invented clock times")
print("PASS: \(checks) relative-outline and date-binding model checks; no native UI or real integration exercised")
