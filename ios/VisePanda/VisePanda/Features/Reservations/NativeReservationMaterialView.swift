import SwiftUI
import UIKit

/// Reads only current owner device originals through the existing private inbox.
/// OCR text and photos never enter a server body. Every carried field is explicitly selected.
struct NativeReservationMaterialView: View {
    let session: NativeSession
    let chinese: Bool
    let active: Bool
    let apply: ([String: String], String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var receipts: [NativeScreenshotInbox.Receipt] = []
    @State private var selectedDigest: String?
    @State private var lines: [NativeScreenshotLine] = []
    @State private var image: UIImage?
    @State private var selectedLine: Int?
    @State private var field = "title"
    @State private var correction = ""
    @State private var choices: [String: Choice] = [:]
    @State private var busy = false
    @State private var unavailable = false
    @State private var loadID = UUID()
    private var actor: NativeDataScope? { active && phase == .active ? session.dataScope : nil }
    private let fields = ["title", "externalReference", "startsAt", "endsAt", "timeZone", "address", "terms"]
    private struct Choice { let value: String; let line: Int }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(t("仅读取当前账号本机审阅期间仍保留的截图。选中原文行、指定字段并校正后，才带入订单报告。照片和完整 OCR 不上传。", "Only screenshots still retained during this account’s device review are read. Select an original line, choose a field and correct it before carrying it into a report. Photos and full OCR are not uploaded."))
                    Text(t("没有原文件时可返回手动报告；这不是供应商订单导入或可信来源核验。", "If no original is available, return to manual reporting. This is not supplier order import or trusted-source verification.")).font(.footnote)
                    Button(t("刷新可读本机材料", "Refresh readable device materials")) { refresh() }.disabled(busy || actor == nil)
                    ForEach(receipts, id: \.digest) { receipt in
                        Button(t("选择本机截图 ", "Select device screenshot ") + String(receipt.digest.prefix(8))) { Task { await read(receipt) } }.disabled(busy)
                    }
                    if receipts.isEmpty { Text(t("没有可读本机原文件；可跳过材料，手动输入字段。", "No readable device original. Skip material and enter fields manually.")) }
                }
                if let image { Section(t("所选本机原图", "Selected device original")) { Image(uiImage: image).resizable().scaledToFit().accessibilityLabel(t("所选订单截图原图", "Selected reservation screenshot original")) } }
                if !lines.isEmpty {
                    Section(t("原文行（仅本机）", "Original lines (on-device only)")) {
                        ForEach(lines) { line in
                            Button { selectedLine = line.id; correction = line.text } label: {
                                VStack(alignment: .leading) { Text(t("第 \(line.id) 行", "Line \(line.id)")); Text(line.text) }
                            }
                        }
                        Picker(t("带入字段", "Field to carry"), selection: $field) { ForEach(fields, id: \.self) { Text(NativeReservationLabels.field($0, chinese: chinese)).tag($0) } }
                        TextField(t("校正此字段", "Correct this field"), text: $correction, axis: .vertical)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button(t("明确选择此行的校正字段", "Explicitly select this corrected field")) {
                            guard let selectedLine, NativeReservationWire.text(correction, max: 2000) else { return }
                            choices[field] = .init(value: correction, line: selectedLine)
                        }.disabled(selectedLine == nil || !NativeReservationWire.text(correction, max: 2000))
                    }
                }
                if !choices.isEmpty {
                    Section(t("将带入的字段", "Fields to carry")) {
                        ForEach(fields.filter { choices[$0] != nil }, id: \.self) { name in
                            if let choice = choices[name] {
                                Text(NativeReservationLabels.field(name, chinese: chinese) + ": " + choice.value)
                                Text(t("原文第 \(choice.line) 行", "Original line \(choice.line)")).font(.caption)
                                Button(t("移除此字段", "Remove field")) { choices.removeValue(forKey: name) }
                            }
                        }
                        Button(t("明确带入所选字段，返回校正", "Explicitly carry selected fields and return to correction")) { carry() }
                            .disabled(busy || actor == nil).accessibilityIdentifier("reservations.material.carry")
                    }
                }
                if busy { ProgressView() }
                if unavailable { Text(t("原文件已过期、被删除或权限未确认。未带入其他材料。", "Original expired, was deleted or authority was unconfirmed. No other material was substituted.")) }
            }
            .navigationTitle(t("选择本机原文", "Select device original"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("跳过材料", "Skip material")) { dismiss() } } }
        }
        .task(id: actor) { clear(); refresh() }
        .onChange(of: actor) { _, _ in clear() }
        .onDisappear { clear() }
    }
    private func clear() {
        loadID = UUID(); receipts = []; selectedDigest = nil; lines = []; image = nil; choices = [:]; selectedLine = nil; correction = ""; busy = false
    }
    private func refresh() {
        clear(); unavailable = false
        do {
            guard let actor, session.prepareDeviceMaterials(), try session.pendingDeviceMaterialDeletion() == nil else { throw InboxError.invalidInput }
            receipts = try session.deviceMaterials.receipts(scope: actor)
        } catch { unavailable = true }
    }
    private func read(_ receipt: NativeScreenshotInbox.Receipt) async {
        guard let actor else { return }
        let own = UUID(); loadID = own; busy = true; unavailable = false; choices = [:]; lines = []; image = nil; selectedDigest = nil
        defer { if loadID == own { busy = false } }
        do {
            guard try session.pendingDeviceMaterialDeletion() == nil else { throw InboxError.invalidInput }
            let bytes = try NativeScreenshotInbox().read(receipt.digest, owner: actor.subject)
            // Existing bounded local Vision reader; no HTTP/OCR service call.
            let recognized = try await Task.detached(priority: .userInitiated) { try NativeScreenshotOCR.recognize(bytes) }.value
            guard self.actor == actor, loadID == own, !Task.isCancelled else { return }
            _ = try NativeScreenshotInbox().read(receipt.digest, owner: actor.subject)
            selectedDigest = receipt.digest; lines = recognized; image = UIImage(data: bytes)
        } catch { if loadID == own { unavailable = true } }
    }
    private func carry() {
        do {
            guard let actor, let digest = selectedDigest, !choices.isEmpty, try session.pendingDeviceMaterialDeletion() == nil else { throw InboxError.invalidInput }
            _ = try NativeScreenshotInbox().read(digest, owner: actor.subject)
            let locator = fields.compactMap { name in choices[name].map { name + ":L" + String($0.line) } }.joined(separator: "; ")
            guard NativeReservationWire.text(locator, max: 500) else { throw InboxError.invalidInput }
            apply(choices.mapValues(\.value), digest, locator); dismiss()
        } catch { clear(); unavailable = true }
    }
}
