import ImageIO
import PhotosUI
import SwiftUI
import Vision

struct NativeScreenshotReviewSource: Identifiable {
    let id = UUID()
    let tripID: String
    let tripVersion: Int
    let tripDates: [String]
}

struct NativeScreenshotLine: Identifiable, Sendable {
    let id: Int
    let text: String
}

enum NativeScreenshotFieldKind: String, CaseIterable, Identifiable {
    case date, amount, address, status

    var id: String { rawValue }

    func label(chinese: Bool) -> String {
        switch self {
        case .date: chinese ? "日期" : "Date"
        case .amount: chinese ? "金额" : "Amount"
        case .address: chinese ? "地址" : "Address"
        case .status: chinese ? "状态" : "Status"
        }
    }
}

struct NativeScreenshotCorrection: Identifiable {
    let id: UUID
    let kind: NativeScreenshotFieldKind
    let sourceLine: Int
    let sourceText: String
    let correctedValue: String
}

enum NativeScreenshotComparison: Equatable {
    case alreadyInTrip, dateNotInTrip, needsReview

    static func classify(_ correction: NativeScreenshotCorrection, tripDates: [String], hasTrip: Bool = true) -> Self {
        guard hasTrip, correction.kind == .date, validDate(correction.correctedValue) else { return .needsReview }
        return tripDates.contains(correction.correctedValue) ? .alreadyInTrip : .dateNotInTrip
    }

    static func validDate(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
}

enum NativeScreenshotReviewStatus {
    case idle, loading, ready, unavailable
}

@MainActor
struct NativeScreenshotReviewView: View {
    let source: NativeScreenshotReviewSource
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var selectedItem: PhotosPickerItem?
    @State private var status: NativeScreenshotReviewStatus = .idle
    @State private var lines: [NativeScreenshotLine] = []
    @State private var selectedLine: NativeScreenshotLine?
    @State private var selectedKind: NativeScreenshotFieldKind = .date
    @State private var correctedValue = ""
    @State private var corrections: [NativeScreenshotCorrection] = []
    @State private var reviewed = false
    @State private var loadID = UUID()
    @State private var loadTask: Task<Void, Never>?
    @State private var recognitionTask: Task<[NativeScreenshotLine], Error>?

    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        let chooseTitle = text("Choose screenshot", "选择截图")
        return NavigationStack {
            Form {
                Section {
                    Text(text("Select one screenshot. Recognition runs on this device and remains in this review until you close it.", "选择一张截图。文字只在本机识别，并仅在当前审阅页面保留。"))
                        .foregroundStyle(Color.vpSecondaryText)
                    if source.tripID.isEmpty {
                        Text(text("This local review is not linked to a saved Trip.", "本机检查尚未关联已保存的行程。"))
                            .foregroundStyle(Color.vpSecondaryText)
                            .accessibilityIdentifier("screenshot.localOnly")
                    } else {
                        Text(text("Compared with saved Trip version \(source.tripVersion).", "对照已保存行程版本 \(source.tripVersion)。"))
                            .foregroundStyle(Color.vpSecondaryText)
                    }
                    PhotosPicker(selection: $selectedItem, matching: .screenshots) {
                        Label(chooseTitle, systemImage: "photo")
                    }
                    .accessibilityIdentifier("screenshot.choose")
                } header: {
                    Text(text("Source", "来源"))
                }

                if status == .loading {
                    ProgressView(text("Reading screenshot", "正在读取截图"))
                } else if status == .unavailable {
                    Section {
                        Text(text("The screenshot could not be read. Your saved Trip is unchanged.", "无法读取截图；已保存的行程未改变。"))
                            .accessibilityIdentifier("screenshot.unavailable")
                    }
                } else if status == .ready {
                    Section(text("Recognized lines", "识别到的原文")) {
                        ForEach(lines) { line in
                            Button {
                                selectedLine = line
                                correctedValue = line.text
                                reviewed = false
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(text("Line \(line.id)", "第 \(line.id) 行"))
                                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                                    Text(line.text).foregroundStyle(.primary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .accessibilityIdentifier("screenshot.line.\(line.id)")
                        }
                    }
                    if let selectedLine {
                        Section(text("Correct a field", "校正字段")) {
                            Text(text("Source line \(selectedLine.id): \(selectedLine.text)", "原文第 \(selectedLine.id) 行：\(selectedLine.text)"))
                                .font(.footnote).textSelection(.enabled)
                            Picker(text("Field", "字段"), selection: $selectedKind) {
                                ForEach(NativeScreenshotFieldKind.allCases) { kind in
                                    Text(kind.label(chinese: chinese)).tag(kind)
                                }
                            }
                            TextField(text("Corrected value", "校正后的值"), text: $correctedValue)
                                .accessibilityIdentifier("screenshot.correctedValue")
                            Button(text("Keep corrected field", "保留校正字段")) { keepCorrection(from: selectedLine) }
                                .disabled(!canKeepCorrection)
                                .accessibilityIdentifier("screenshot.keepField")
                        }
                    }
                    if !corrections.isEmpty {
                        Section(text("Trip comparison", "与当前行程对照")) {
                            ForEach(corrections) { correction in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(correction.kind.label(chinese: chinese) + ": " + correction.correctedValue)
                                    Text(text("Source line \(correction.sourceLine)", "原文第 \(correction.sourceLine) 行"))
                                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                                    Text(comparison(for: correction))
                                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                                    Button(text("Remove field", "移除字段"), role: .destructive) {
                                        corrections.removeAll { $0.id == correction.id }
                                        reviewed = false
                                    }
                                    .accessibilityIdentifier("screenshot.remove.\(correction.kind.rawValue)")
                                }
                                .accessibilityIdentifier("screenshot.field.\(correction.kind.rawValue)")
                            }
                            Button(text("Finish local review", "完成本机校正审阅")) { reviewed = true }
                                .accessibilityIdentifier("screenshot.review")
                        }
                    }
                    if reviewed {
                        Section {
                            Text(text("Your corrected fields are ready for review. Adding them to the Trip requires a separate proposal and your confirmation.", "校正字段已备好。加入行程仍需另行生成提议并由你确认。"))
                                .accessibilityIdentifier("screenshot.pending")
                        }
                    }
                }
            }
            .navigationTitle(text("Review screenshot", "审阅截图"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(text("Close", "关闭")) { clear(); dismiss() }
            } }
            .onChange(of: selectedItem) { _, item in
                loadTask?.cancel(); recognitionTask?.cancel()
                let currentID = UUID()
                loadID = currentID
                lines.removeAll(); corrections.removeAll(); selectedLine = nil; correctedValue = ""; reviewed = false
                guard let item else { status = .idle; return }
                status = .loading
                loadTask = Task { await load(item, id: currentID) }
            }
            .onDisappear { clear() }
        }
    }

    private func comparison(for correction: NativeScreenshotCorrection) -> String {
        switch NativeScreenshotComparison.classify(correction, tripDates: source.tripDates, hasTrip: !source.tripID.isEmpty) {
        case .alreadyInTrip:
            return text("Already in this Trip", "当前行程已有此日期")
        case .dateNotInTrip:
            return text("Date not in this Trip", "当前行程尚无此日期")
        case .needsReview:
            return source.tripID.isEmpty
                ? text("Select a saved Trip to compare this field.", "选择已保存行程后才能对照此字段。")
                : text("Check this against your Trip before proposing a change.", "生成提议前，请先与当前行程核对。")
        }
    }

    private func keepCorrection(from line: NativeScreenshotLine) {
        let value = correctedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canKeepCorrection else { return }
        corrections.removeAll { $0.kind == selectedKind }
        corrections.append(.init(id: UUID(), kind: selectedKind, sourceLine: line.id, sourceText: line.text, correctedValue: value))
        reviewed = false
    }

    private var canKeepCorrection: Bool {
        let value = correctedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return !value.isEmpty && value.count <= 160
            && (selectedKind != .date || NativeScreenshotComparison.validDate(value))
    }

    private func load(_ item: PhotosPickerItem, id: UUID) async {
        defer { if loadID == id { loadTask = nil } }
        do {
            guard let data = try await item.loadTransferable(type: Data.self), data.count <= 12_000_000 else {
                if loadID == id { status = .unavailable }; return
            }
            try Task.checkCancellation()
            let task = Task.detached(priority: .userInitiated) {
                try NativeScreenshotOCR.recognize(data)
            }
            recognitionTask = task
            defer { if loadID == id { recognitionTask = nil } }
            let recognized = try await task.value
            guard loadID == id, !Task.isCancelled else { return }
            lines = recognized
            status = recognized.isEmpty ? .unavailable : .ready
        } catch {
            if loadID == id { status = .unavailable }
        }
    }

    private func clear() {
        loadTask?.cancel(); recognitionTask?.cancel(); loadTask = nil; recognitionTask = nil
        loadID = UUID(); selectedItem = nil; lines.removeAll(); corrections.removeAll()
        selectedLine = nil; correctedValue = ""; reviewed = false; status = .idle
    }
}

private enum NativeScreenshotOCR {
    nonisolated static func recognize(_ data: Data) throws -> [NativeScreenshotLine] {
        try Task.checkCancellation()
        guard let image = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any],
              let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
              let height = properties[kCGImagePropertyPixelHeight as String] as? Int,
              width > 0, height > 0, width <= 8_192, height <= 8_192,
              width <= 16_000_000 / height else { throw NativeScreenshotRecognitionError.invalidImage }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = false
        try VNImageRequestHandler(data: data).perform([request])
        try Task.checkCancellation()
        let observations = (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
        guard observations.count <= 40 else { return [] }
        return try observations.enumerated().map { index, observation in
            guard let value = observation.topCandidates(1).first?.string,
                  !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  value.count <= 160 else { throw NativeScreenshotRecognitionError.unreadableLine }
            return NativeScreenshotLine(id: index + 1, text: value)
        }
    }
}

private enum NativeScreenshotRecognitionError: Error { case invalidImage, unreadableLine }

#Preview("Local screenshot review") {
    NativeScreenshotReviewView(
        source: .init(tripID: "", tripVersion: 0, tripDates: []),
        chinese: false
    )
}
