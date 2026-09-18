import ImageIO
import PhotosUI
import SwiftUI
import Vision

struct NativeScreenshotReviewSource: Identifiable {
    let id = UUID()
    let tripID: String
    let tripVersion: Int
    let tripDates: [String]
    let ownerID: String?
    let detail: NativeTripDetail?

    init(tripID: String, tripVersion: Int, tripDates: [String], ownerID: String? = nil,
         detail: NativeTripDetail? = nil) {
        self.tripID = tripID
        self.tripVersion = tripVersion
        self.tripDates = tripDates
        self.ownerID = ownerID
        self.detail = detail
    }
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
    let store: NativeTripStore?
    let session: NativeSession?
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
    @State private var inboxReceipt: NativeScreenshotInbox.Receipt?
    @State private var submitting = false
    @State private var submitError = false
    @State private var deletionFailed = false
    private let inbox = NativeScreenshotInbox()

    init(source: NativeScreenshotReviewSource, chinese: Bool,
         store: NativeTripStore? = nil, session: NativeSession? = nil) {
        self.source = source
        self.chinese = chinese
        self.store = store
        self.session = session
    }

    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        let chooseTitle = text("Choose screenshot", "选择截图")
        return NavigationStack {
            Form {
                Section {
                    Text(source.ownerID == nil
                         ? text("Select one screenshot. Recognition runs on this device and remains in this review until you close it.", "选择一张截图。文字只在本机识别，并仅在当前审阅页面保留。")
                         : text("Select one travel screenshot. A protected copy stays in this device's private inbox during review; Close deletes it. No image is uploaded.", "选择一张旅行截图。审阅期间，受保护副本仅存于本机私有收件箱；关闭时删除，不上传图片。"))
                        .foregroundStyle(Color.vpSecondaryText)
                    if source.tripID.isEmpty {
                        Text(text("This local review is not linked to a saved Trip.", "本机检查尚未关联已保存的行程。"))
                            .foregroundStyle(Color.vpSecondaryText)
                            .accessibilityIdentifier("screenshot.localOnly")
                    } else {
                        Text(text("Compared with saved Trip version \(source.tripVersion).", "对照已保存行程版本 \(source.tripVersion)。"))
                            .foregroundStyle(Color.vpSecondaryText)
                    }
                    // Imported screenshots can lack PhotoKit's screenshot subtype.
                    // Selection is still one image and grants no full-library read.
                    PhotosPicker(selection: $selectedItem, matching: .images) {
                        Label(chooseTitle, systemImage: "photo")
                    }
                    .accessibilityIdentifier("screenshot.choose")
                    if let inboxReceipt {
                        Text(inboxReceipt.duplicate
                             ? text("This screenshot was already imported on this device.", "这张截图已在本机导入。")
                             : text("Private on-device inbox · removed on close; expires after 24 hours and is purged on next access.", "本机私有收件箱 · 关闭时删除；24小时后不可读取，下次访问时清理。"))
                            .font(.footnote)
                            .foregroundStyle(Color.vpSecondaryText)
                    }
                    if deletionFailed {
                        Text(text("Could not remove the protected local copy yet. Unlock the device and retry Close.", "暂时无法删除受保护的本机副本。请解锁设备后重试关闭。"))
                            .accessibilityIdentifier("screenshot.deleteError")
                    }
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
                            Text(text("Review these user-checked fields in a Trip proposal before saving. Screenshot text is not a verified booking.", "请先在行程提议中审阅这些已校正字段，再决定是否保存。截图文字并非已核实的订单。"))
                                .accessibilityIdentifier("screenshot.pending")
                            if source.detail != nil, store != nil, session != nil {
                                Button(text("Create Trip proposal", "生成行程提议")) {
                                    Task { await submitProposal() }
                                }
                                .disabled(submitting || inboxReceipt == nil || !corrections.contains(where: { $0.kind == .date }))
                                .accessibilityIdentifier("screenshot.propose")
                            }
                            if submitError {
                                Text(text("Could not prepare the proposal. Your saved Trip is unchanged; check the selected Trip and try again.", "未能生成提议；已保存行程未改变。请检查所选行程后重试。"))
                                    .accessibilityIdentifier("screenshot.proposeError")
                            }
                        }
                    }
                }
            }
            .navigationTitle(text("Review screenshot", "审阅截图"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(text("Close", "关闭")) { if clear() { dismiss() } }
            } }
            .onChange(of: selectedItem) { _, item in
                loadTask?.cancel(); recognitionTask?.cancel()
                guard discardInbox() else { status = .unavailable; return }
                let currentID = UUID()
                loadID = currentID
                lines.removeAll(); corrections.removeAll(); selectedLine = nil; correctedValue = ""; reviewed = false
                guard let item else { status = .idle; return }
                status = .loading
                loadTask = Task { await load(item, id: currentID) }
            }
            .onDisappear { _ = clear() }
            .interactiveDismissDisabled(inboxReceipt != nil)
        }
    }

    private func comparison(for correction: NativeScreenshotCorrection) -> String {
        if let detail = source.detail, let digest = inboxReceipt?.digest {
            switch NativeScreenshotTripDraft.make(detail: detail, digest: digest, corrections: corrections) {
            case .duplicate:
                return text("Duplicate in this Trip", "当前行程已有相同内容")
            case .ready(_, let states):
                switch states[correction.kind] {
                case .added: return text("Added in proposal", "提议中新增")
                case .duplicate: return text("Duplicate in this Trip", "当前行程已有相同内容")
                case .conflict: return text("Conflicts with saved content; review the diff", "与已保存内容冲突，请审阅变化")
                case nil: break
                }
            case .invalid: break
            }
        }
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
        submitError = false
    }

    private var canKeepCorrection: Bool {
        let value = correctedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let selectedLine, !value.isEmpty else { return false }
        if selectedKind == .date { return NativeScreenshotComparison.validDate(value) }
        return NativeScreenshotTripDraft.itemTitle(kind: selectedKind, sourceLine: selectedLine.id,
                                                   value: value) != nil
    }

    private func load(_ item: PhotosPickerItem, id: UUID) async {
        defer { if loadID == id { loadTask = nil } }
        do {
            guard let data = try await item.loadTransferable(type: Data.self), data.count <= 12_000_000 else {
                if loadID == id { status = .unavailable }; return
            }
            try Task.checkCancellation()
            guard loadID == id else { return }
            let imageData: Data
            if let owner = source.ownerID {
                let receipt = try inbox.receive(data, owner: owner)
                guard loadID == id else { try? inbox.delete(receipt.digest, owner: owner); return }
                inboxReceipt = receipt
                imageData = try inbox.read(receipt.digest, owner: owner)
            } else {
                imageData = data
            }
            let task = Task.detached(priority: .userInitiated) {
                try NativeScreenshotOCR.recognize(imageData)
            }
            recognitionTask = task
            defer { if loadID == id { recognitionTask = nil } }
            let recognized = try await task.value
            guard loadID == id, !Task.isCancelled else { return }
            lines = recognized
            status = recognized.isEmpty ? .unavailable : .ready
        } catch {
            if loadID == id { _ = discardInbox(); status = .unavailable }
        }
    }

    @discardableResult
    private func clear() -> Bool {
        loadTask?.cancel(); recognitionTask?.cancel(); loadTask = nil; recognitionTask = nil
        guard discardInbox() else { return false }
        loadID = UUID(); selectedItem = nil; lines.removeAll(); corrections.removeAll()
        selectedLine = nil; correctedValue = ""; reviewed = false; status = .idle
        return true
    }

    @discardableResult
    private func discardInbox() -> Bool {
        if let owner = source.ownerID, let receipt = inboxReceipt {
            do { try inbox.delete(receipt.digest, owner: owner) }
            catch { deletionFailed = true; return false }
        }
        inboxReceipt = nil
        deletionFailed = false
        return true
    }

    private func submitProposal() async {
        guard !submitting, let store, let session, let receipt = inboxReceipt else { return }
        submitting = true
        defer { submitting = false }
        let accepted = await store.proposeScreenshot(source: source, digest: receipt.digest,
                                                      corrections: corrections, using: session)
        if accepted {
            if clear() { dismiss() }
        } else if store.draft != nil {
            // The network failed after constructing a local draft. Keep that
            // draft available on the Trip screen for an explicit retry.
            if clear() { dismiss() }
        } else {
            submitError = true
        }
    }
}

enum NativeScreenshotOCR {
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
