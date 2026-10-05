import SwiftUI
import UniformTypeIdentifiers

struct NativePDFIntakeView: View {
    let source: NativePDFIntakeSource
    let session: NativeSession
    let tripStore: NativeTripStore
    let chinese: Bool
    @State private var model: NativePDFIntakeStore
    @State private var importer = false
    @State private var selectedPage = 1
    @State private var selectedLine: NativePDFDocument.Line?
    @State private var selectedKind = "date"
    @State private var correctedValue = ""
    @State private var checkedPreview = false
    @Environment(\.dismiss) private var dismiss
    init(source: NativePDFIntakeSource, session: NativeSession, tripStore: NativeTripStore, chinese: Bool) {
        self.source = source; self.session = session; self.tripStore = tripStore; self.chinese = chinese
        _model = State(initialValue: NativePDFIntakeStore(source: source))
    }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            Form {
                Section(text("Source", "来源")) {
                    Text(text("Choose one text-bearing PDF, up to 10 pages and 20 MB. A protected copy stays on this device for review, expires within 24 hours and is removed on Close. Your original Files document is preserved.", "选择含可提取文本的 PDF，最多10页、20MB。受保护副本仅存于本机审阅，24小时内过期，关闭时删除。Files中的原文件保留。"))
                    Text(text("Compare with this Trip at version \(source.detail.trip.headVersion). Fields are user-checked text; order verification and future feasibility are unavailable.", "对照当前行程版本 \(source.detail.trip.headVersion)。字段是用户校正的文字；订单核验与未来可行性不可用。"))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                    if model.journal == nil {
                        Button(text("Choose PDF from Files", "从Files选择PDF")) { importer = true }
                            .disabled(model.busy || session.dataScope != source.actor || model.message == "cleanupRequired")
                            .accessibilityIdentifier("pdf.choose")
                    }
                    if model.busy { ProgressView(text("Reading or checking PDF", "正在读取或核对PDF")) }
                    if let message = model.message { Text(messageText(message)).accessibilityIdentifier("pdf.status") }
                    if let journal = model.journal {
                        Text(text("The original submission is retained until its receipt is resolved. Closing removes the local PDF copy and keeps this same-operation recovery.", "原提交会保留到回执核实。关闭会删除本机PDF副本，仍保留同一操作恢复入口。"))
                            .font(.footnote)
                        Text(text("Trip: \(journal.tripID)", "行程：\(journal.tripID)")).font(.caption).textSelection(.enabled)
                        Button(text("Read original receipt and return to Trip", "核对原回执并返回同一行程")) {
                            Task { if await model.recover(using: session, tripStore: tripStore) { dismiss() } }
                        }.disabled(model.busy).accessibilityIdentifier("pdf.recover")
                        Button(text("Cancel original PDF submission", "取消原PDF提交"), role: .destructive) {
                            Task { if await model.cancel(using: session) { dismiss() } }
                        }.disabled(model.busy).accessibilityIdentifier("pdf.cancel")
                    }
                }
                if let document = model.document {
                    Section(text("Original pages", "原文页")) {
                        Picker(text("Page", "页"), selection: $selectedPage) {
                            ForEach(document.pages) { page in Text(text("Page \(page.id)", "第\(page.id)页")).tag(page.id) }
                        }.accessibilityIdentifier("pdf.page")
                        if let page = document.pages.first(where: { $0.id == selectedPage }) {
                            if page.lines.isEmpty {
                                Text(text("No text can be extracted from this page. Scanned/image content is unavailable here. Use the existing screenshot review for that page; no content is inferred.", "本页无法提取文本。扫描／图片内容在此不可用。可用现有截图审阅处理该页；不会推测内容。"))
                                    .accessibilityIdentifier("pdf.page.unavailable")
                            }
                            ForEach(page.lines) { line in
                                Button {
                                    selectedLine = line; correctedValue = line.text; checkedPreview = false
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(text("Page \(line.page), line \(line.number)", "第\(line.page)页，第\(line.number)行")).font(.caption).foregroundStyle(Color.vpSecondaryText)
                                        Text(line.text).foregroundStyle(.primary)
                                    }
                                }.disabled(model.busy || model.journal != nil).accessibilityIdentifier("pdf.line.\(line.id)")
                            }
                        }
                    }
                    if let line = selectedLine {
                        Section(text("Correct a field", "校正字段")) {
                            Text(text("Original P\(line.page) L\(line.number): \(line.text)", "原文第\(line.page)页第\(line.number)行：\(line.text)"))
                                .font(.footnote).textSelection(.enabled)
                            Picker(text("Field", "字段"), selection: $selectedKind) {
                                ForEach(NativeScreenshotFieldKind.allCases) { kind in Text(kind.label(chinese: chinese)).tag(kind.rawValue) }
                            }
                            TextField(text("Corrected value (date YYYY-MM-DD)", "校正值（日期YYYY-MM-DD）"), text: $correctedValue, axis: .vertical)
                                .accessibilityIdentifier("pdf.value")
                            Button(text("Keep this correction", "保留此校正")) {
                                model.keep(kind: selectedKind, value: correctedValue.trimmingCharacters(in: .whitespacesAndNewlines), line: line)
                                checkedPreview = false
                            }.disabled(model.busy || !NativePDFField.validValue(correctedValue.trimmingCharacters(in: .whitespacesAndNewlines), kind: selectedKind) || model.journal != nil)
                                .accessibilityIdentifier("pdf.keep")
                        }
                    }
                    if !model.fields.isEmpty {
                        Section(text("Checked fields", "已校正字段")) {
                            ForEach(model.fields) { field in
                                VStack(alignment: .leading) {
                                    Text("P\(field.locator.page) L\(field.locator.line) · \(field.kind): \(field.value)")
                                    Button(text("Remove field", "移除字段"), role: .destructive) { model.remove(field.kind); checkedPreview = false }
                                        .disabled(model.busy || model.journal != nil)
                                }
                            }
                            Button(text("Compare with saved Trip", "对照已保存行程")) { Task { checkedPreview = false; await model.review(using: session) } }
                                .disabled(model.busy || model.journal != nil || !model.fields.contains { $0.kind == "date" })
                                .accessibilityIdentifier("pdf.preview")
                        }
                    }
                }
                if let preview = model.preview {
                    Section(text("New, duplicate and conflicting content", "新增、重复与冲突")) {
                        ForEach(preview.fields, id: \.kind) { field in
                            Text("P\(field.locator.page) L\(field.locator.line) · \(field.value) · \(stateText(field.state))")
                        }
                        Text(text("Existing fixed activities and orders stay in place. Conflicting corrections are appended as alternatives for review, without replacing existing content.", "原固定活动和订单保留。冲突校正作为备选新增供审阅，不替换现有内容。"))
                            .font(.footnote)
                        if preview.patch != nil {
                            Toggle(text("I reviewed these fields and comparisons", "我已核对字段及对照结果"), isOn: $checkedPreview)
                            Text(text("Only corrected values and page/line hashes are sent. The PDF and page text stay on device. Next, review the original Trip diff and confirm it separately.", "仅发送校正值与页／行哈希，PDF和页全文留在本机。下一步查看原行程差异，再单独明确确认。"))
                                .font(.footnote)
                            Button(text("Create proposal and review original diff", "生成提议并审阅原行程差异")) {
                                Task { if await model.propose(using: session, tripStore: tripStore) { dismiss() } }
                            }.disabled(!checkedPreview || model.busy || model.journal != nil).accessibilityIdentifier("pdf.propose")
                        } else { Text(text("These fields are already in this Trip; no change is proposed.", "当前行程已有这些字段，无需生成修改提议。")) }
                    }
                }
            }
            .navigationTitle(text("Review PDF", "审阅PDF"))
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(text("Close", "关闭")) { if model.clearCopy() { dismiss() } }.disabled(model.busy)
            } }
            .interactiveDismissDisabled(model.receipt != nil || model.busy)
            .fileImporter(isPresented: $importer, allowedContentTypes: [.pdf], allowsMultipleSelection: false) { result in
                guard case .success(let urls) = result, urls.count == 1, let url = urls.first else { return }
                selectedLine = nil; correctedValue = ""; selectedPage = 1; checkedPreview = false
                Task { await model.load(url, using: session) }
            }
            .task { model.start(using: session) }
            .task(id: model.receipt?.id) {
                guard let receipt = model.receipt else { return }
                let interval = receipt.expiresAt.timeIntervalSinceNow
                if interval > 0 { try? await Task.sleep(for: .seconds(interval)) }
                guard !Task.isCancelled else { return }
                model.expire(); selectedLine = nil; correctedValue = ""; checkedPreview = false
            }
            .onChange(of: session.dataScope) { _, value in
                if value != source.actor { _ = model.clearCopy(); selectedLine = nil; correctedValue = ""; dismiss() }
            }
            .onDisappear { _ = model.clearCopy() }
        }
    }
    private func stateText(_ value: String) -> String {
        switch value { case "added": return text("Added", "新增"); case "duplicate": return text("Duplicate", "重复"); default: return text("Conflict", "冲突") }
    }
    private func messageText(_ value: String) -> String {
        switch value {
        case "size": return text("File exceeds 20 MB or is empty. The original file and Trip are unchanged.", "文件超过20MB或为空。原文件与行程未改变。")
        case "pages": return text("Only 1–10 pages are supported. No pages were imported or truncated.", "仅支持1–10页。未导入或截断任何页。")
        case "encrypted": return text("Encrypted PDFs are unsupported. Choose a text-bearing, unencrypted copy.", "不支持加密PDF，请选择含文本的未加密副本。")
        case "activeContent", "format", "textLimit": return text("This PDF is outside the supported safe format or text limits. Use a simpler PDF or screenshot review; the original file and Trip are preserved.", "此PDF不符合受限格式或文本限额。请用更简单的PDF或截图审阅；原文件和行程保留。")
        case "unavailable": return text("No extractable text is available. Use screenshot review; no fields have been inferred.", "没有可提取文本。请使用截图审阅；未推测任何字段。")
        case "cleanupRequired": return text("The protected local copy could not be removed. Unlock this device and retry Close.", "受保护本机副本暂无法删除。请解锁设备并重试关闭。")
        case "scope": return text("The signed-in session changed. Return to the same Trip under its current owner.", "登录会话已改变。请在当前所有者会话下返回同一行程。")
        case "confirmed": return text("The original confirmation receipt was recovered.", "已恢复原明确确认回执。")
        case "cancelled", "expired", "rejected": return text("The original operation is \(value). It cannot be confirmed; resolve its retained receipt before another import.", "原操作已取消、过期或拒绝，不能确认；先处理保留回执再导入。")
        default: return text("The original receipt needs checking. Retry the same operation; do not create another submission.", "需要核对原回执。请恢复同一操作，勿重复创建提交。")
        }
    }
}
