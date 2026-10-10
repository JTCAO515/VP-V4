import SwiftUI

/// Local form state, never a persistence schema or source grant. The approved
/// adapter will encode only the fields the traveller explicitly reviews here.
struct NativeTravelDirectionsFormValues: Equatable {
    var destinations = ""
    var duration = ""
    var interests = ""
    var pace = ""
    var currency = "CNY"
    var budget = ""
    var startDate = ""
    var endDate = ""
    var specific = false
    var useSavedPace = false

    init() {}
    init(intake: NativeTravelDirectionsIntake) {
        destinations = intake.destinations.joined(separator: "\n")
        duration = intake.durationDays.map(String.init) ?? ""
        interests = intake.interests.joined(separator: "\n")
        pace = intake.currentPace ?? ""
        currency = intake.budget?.currency ?? "CNY"
        budget = intake.budget.flatMap { NativeTravelBudgetAmount.display($0.totalMinorUnits) } ?? ""
        startDate = intake.dates?.startDate ?? ""
        endDate = intake.dates?.endDate ?? ""
        specific = intake.intent == "specific"
        useSavedPace = false
    }

    private func lines(_ text: String) -> [String] {
        text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    var destinationLabels: [String] { lines(destinations) }
    var interestLabels: [String] { lines(interests) }
    var days: Int? { Int(duration) }
    var budgetMinorUnits: Int? { NativeTravelBudgetAmount.minorUnits(budget) }
    var valid: Bool {
        let places = destinationLabels, themes = interestLabels
        guard places.count <= 30, Set(places).count == places.count,
              places.allSatisfy({ $0.utf16.count <= 80 && !$0.unicodeScalars.contains(where: { $0.value < 32 }) }),
              themes.count <= 8, Set(themes).count == themes.count,
              themes.allSatisfy({ $0.utf16.count <= 40 && !$0.unicodeScalars.contains(where: { $0.value < 32 }) }),
              duration.isEmpty || days.map({ (1...30).contains($0) }) == true,
              pace.isEmpty || ["relaxed", "balanced", "packed"].contains(pace),
              ["CNY", "USD", "EUR", "GBP"].contains(currency),
              budget.isEmpty || budgetMinorUnits.map({ (1...10_000_000).contains($0) }) == true else { return false }
        if startDate.isEmpty && endDate.isEmpty { return true }
        guard let days, NativeTravelIntake.validDates(.init(startDate: startDate, endDate: endDate)) else { return false }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        f.isLenient = false
        guard let start = f.date(from: startDate), let end = f.date(from: endDate) else { return false }
        return Int(end.timeIntervalSince(start) / 86400) + 1 == days
    }
}

struct NativeTravelDirectionsIntakeForm: View {
    let originalRequest: String
    let chinese: Bool
    let qualified: Bool
    let busy: Bool
    let savedPaceSummary: String?
    @Binding var values: NativeTravelDirectionsFormValues
    let generate: () -> Void
    @FocusState private var focused: Bool
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !originalRequest.isEmpty {
                Text(t("原始想法", "Your original idea")).font(.headline)
                Text(originalRequest).textSelection(.enabled).accessibilityIdentifier("directions.originalRequest")
            }
            Text(t("只使用你在此核对的字段；留空表示未知，可以先跳过日期和预算。", "Only the fields you review here are used. Blank means unknown. You can skip dates and budget."))
                .font(.footnote)
            TextField(t("目的地 · 每行一个，按旅行顺序", "Destinations · One per line, in travel order"), text: $values.destinations, axis: .vertical)
                .focused($focused).accessibilityIdentifier("directions.intake.destinations")
            TextField(t("天数 · 可留空，最多30天", "Duration · Optional, up to 30 days"), text: $values.duration)
                .keyboardType(.numberPad).focused($focused).accessibilityIdentifier("directions.intake.duration")
            TextField(t("兴趣 · 每行一个", "Interests · One per line"), text: $values.interests, axis: .vertical)
                .focused($focused).accessibilityIdentifier("directions.intake.interests")
            Toggle(t("目的已明确，只需要一个方向", "My purpose is clear; I need one direction"), isOn: $values.specific)
                .accessibilityIdentifier("directions.intake.specific")
            Picker(t("本次节奏", "Pace for this journey"), selection: $values.pace) {
                Text(t("未定", "Unknown")).tag("")
                Text(t("轻松", "Relaxed")).tag("relaxed")
                Text(t("均衡", "Balanced")).tag("balanced")
                Text(t("紧凑", "Packed")).tag("packed")
            }.accessibilityIdentifier("directions.intake.pace")
            if let savedPaceSummary {
                Text(savedPaceSummary).font(.footnote)
                Text(t("保存节奏目前只可用于本机预览，持久成果的保存偏好资格尚未接通。可在上方明确选择本次节奏。", "Saved pace currently qualifies local preview only. Saved-preference qualification for durable results is not connected yet. Explicitly choose this journey’s pace above."))
                    .font(.footnote).accessibilityIdentifier("directions.intake.savedPaceUnavailable")
            }
            DisclosureGroup(t("日期和预算 · 可以稍后补", "Dates and budget · You can add these later")) {
                TextField(t("开始日期 YYYY-MM-DD", "Start date YYYY-MM-DD"), text: $values.startDate)
                    .textInputAutocapitalization(.never).focused($focused).accessibilityIdentifier("directions.intake.startDate")
                TextField(t("结束日期 YYYY-MM-DD", "End date YYYY-MM-DD"), text: $values.endDate)
                    .textInputAutocapitalization(.never).focused($focused).accessibilityIdentifier("directions.intake.endDate")
                Picker(t("预算币种", "Budget currency"), selection: $values.currency) {
                    ForEach(["CNY", "USD", "EUR", "GBP"], id: \.self) { Text($0).tag($0) }
                }
                TextField(t("总预算 · 金额", "Total budget · Amount"), text: $values.budget)
                    .keyboardType(.decimalPad).focused($focused).accessibilityIdentifier("directions.intake.budget")
                Text(t("日期需与天数一致；没有价格依据时，预算符合性仍未知。", "Dates must match the duration. Without price evidence, affordability remains unknown."))
                    .font(.footnote)
            }
            if !values.valid {
                Text(t("请检查数量、重复目的地、日期与天数或预算格式。超出范围不会被截断。", "Check quantities, duplicate destinations, dates and duration, or budget format. Out-of-range input will not be truncated."))
                    .foregroundStyle(.secondary).accessibilityIdentifier("directions.intake.invalid")
            }
            Button(t("按这些需求查看方向", "Show directions using these requirements")) { focused = false; generate() }
                .disabled(!qualified || busy || !values.valid)
                .accessibilityIdentifier("directions.intake.generate")
        }
        .disabled(busy)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(t("完成", "Done")) { focused = false }
            }
        }
    }
}
