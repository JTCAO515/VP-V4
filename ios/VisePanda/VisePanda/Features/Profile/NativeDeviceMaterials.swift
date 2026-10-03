import CryptoKit
import Foundation
import ImageIO
import Observation
import SwiftUI
import UIKit

/// Only the existing device-private screenshot producer is covered.
@MainActor @Observable
final class NativeDeviceMaterials {
    struct Delivery: Equatable, Identifiable {
        let id: UUID
        let scope: NativeDataScope
        let digest: String
        let bytes: Int
        let preparedAt: Date
        let expiresAt: Date
        let url: URL
    }
    private let inbox: NativeScreenshotInbox
    private let exportRoot: URL
    private let eraseInbox: () throws -> Void
    private var accessed = false
    private(set) var delivery: Delivery?

    init(inbox: NativeScreenshotInbox = NativeScreenshotInbox(), exportRoot: URL? = nil, eraseInbox: (() throws -> Void)? = nil) {
        self.inbox = inbox
        self.eraseInbox = eraseInbox ?? { try inbox.deleteAll() }
        self.exportRoot = exportRoot ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("DeviceMaterialExport", isDirectory: true)
    }
    func firstAccess() throws {
        guard !accessed else { return }
        // Startup cleanup covers expired and unexpired abandoned review copies.
        try eraseAll()
    }
    func eraseAll() throws {
        accessed = false
        delivery = nil
        try eraseInbox()
        try clearDelivery()
        accessed = true
    }
    func clearDelivery() throws {
        delivery = nil
        do {
            if FileManager.default.fileExists(atPath: exportRoot.path) { try FileManager.default.removeItem(at: exportRoot) }
        } catch { accessed = false; throw error }
    }
    func receive(_ data: Data, scope: NativeDataScope) throws -> NativeScreenshotInbox.Receipt {
        try firstAccess()
        return try inbox.receive(data, owner: scope.subject)
    }
    func receipts(scope: NativeDataScope, now: Date = Date()) throws -> [NativeScreenshotInbox.Receipt] {
        try firstAccess()
        if let delivery, delivery.scope != scope || delivery.expiresAt <= now { try clearDelivery() }
        return try inbox.receipts(owner: scope.subject, now: now)
    }
    func prepare(digest: String, scope: NativeDataScope, confirmed: Bool, now: Date = Date()) throws -> Delivery {
        guard confirmed else { throw InboxError.invalidInput }
        let receipts = try receipts(scope: scope, now: now)
        guard let receipt = receipts.first(where: { $0.digest == digest }) else { throw InboxError.expired }
        let data = try inbox.read(digest, owner: scope.subject, now: now)
        guard let image = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(image) as String? else { throw InboxError.invalidInput }
        let ext = type == "public.png" ? "png" : type == "public.jpeg" ? "jpg" : "heic"
        try clearDelivery()
        try FileManager.default.createDirectory(at: exportRoot, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var root = exportRoot
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try root.setResourceValues(values)
        let id = UUID()
        var url = exportRoot.appendingPathComponent(id.uuidString + "." + ext)
        do {
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            try url.setResourceValues(values)
            guard try Data(contentsOf: url) == data else { throw InboxError.invalidInput }
            let result = Delivery(id: id, scope: scope, digest: digest, bytes: data.count, preparedAt: now,
                                  expiresAt: min(receipt.expiresAt, now.addingTimeInterval(300)), url: url)
            delivery = result
            return result
        } catch { try? clearDelivery(); throw error }
    }
    func file(for receipt: Delivery, scope: NativeDataScope?, now: Date = Date()) throws -> URL {
        guard receipt == delivery, receipt.scope == scope, receipt.expiresAt > now else { try clearDelivery(); throw InboxError.expired }
        let size = try receipt.url.resourceValues(forKeys: [.fileSizeKey]).fileSize
        guard size == receipt.bytes, receipt.bytes <= 12_000_000 else { throw InboxError.invalidInput }
        let data = try Data(contentsOf: receipt.url)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == receipt.digest else { throw InboxError.invalidInput }
        return receipt.url
    }
}

struct NativeDeviceMaterialExportView: View {
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var receipts: [NativeScreenshotInbox.Receipt] = []
    @State private var confirmed = false
    @State private var notice: String?
    @State private var lastDelivery: NativeDeviceMaterials.Delivery?
    @State private var activity: NativeDeviceMaterials.Delivery?
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        Form {
            Section {
                Text(t("只包含当前账号在本机审阅期间保留的截图原文件，不含服务器资料或照片图库。关闭截图审阅会删除原文件。已保存到外部的副本无法召回。", "Only original screenshots retained during this account’s device review are included. Server data and the photo library are excluded. Closing screenshot review removes originals. External copies cannot be recalled."))
                Toggle(t("明确导出所选本机原文件", "Explicitly export the selected device original"), isOn: $confirmed)
                Button(t("刷新本机文件列表", "Refresh device file list")) { refresh() }
                if receipts.isEmpty { Text(t("当前没有可导出的本机截图", "No device screenshots available")) }
                ForEach(receipts, id: \.digest) { receipt in
                    VStack(alignment: .leading) {
                        Text(receipt.digest).font(.caption).textSelection(.enabled)
                        Text(receipt.expiresAt, style: .date).font(.caption)
                        Button(t("准备并明确导出此文件", "Prepare and explicitly export this file")) { export(receipt) }
                            .disabled(!confirmed || session.dataScope == nil)
                    }
                }
            }
            if let delivery = session.deviceMaterials.delivery ?? lastDelivery, delivery.scope == session.dataScope {
                Section(t("本机交付回执", "Device delivery receipt")) {
                    Text(delivery.id.uuidString).font(.caption)
                    Text("SHA-256: \(delivery.digest)").font(.caption).textSelection(.enabled)
                    Text("\(delivery.bytes) bytes")
                    Text(t("仅原文件字节已核验；不代表全部账号资料导出完成。", "Original bytes verified only; this does not complete all-account data export."))
                }
            }
            if let notice { Text(notice) }
        }
        .navigationTitle(t("本机材料导出", "Device material export"))
        .task(id: session.dataScope) { lastDelivery=nil; notice=nil; reset(); refresh() }
        .onChange(of: session.dataScope) { _, _ in lastDelivery=nil; notice=nil; reset(); refresh() }
        .onChange(of: phase) { _, value in if value != .active { reset() } }
        .onDisappear { reset() }
        .task(id: activity?.id) {
            guard let receipt = activity else { return }
            let remaining = receipt.expiresAt.timeIntervalSinceNow
            if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
            guard !Task.isCancelled, activity?.id == receipt.id else { return }
            reset(); notice = t("本机导出临时文件已到期。", "Device export temporary file expired.")
        }
        .sheet(item: $activity, onDismiss: { reset() }) { receipt in
            DeviceMaterialActivity(url: receipt.url) { completed in
                notice = completed ? t("系统报告交付完成；外部保存位置与副本不由本机回执证明，无法召回。", "The system reported handoff complete. This receipt does not prove an external save location or recall external copies.") : t("系统交付取消或未完成。", "System handoff cancelled or incomplete.")
            }
        }
    }
    private func refresh() {
        do {
            guard session.prepareDeviceMaterials(), let scope = session.dataScope else { throw InboxError.invalidInput }
            receipts = try session.deviceMaterials.receipts(scope: scope)
        } catch { receipts = []; confirmed = false; notice = t("本机材料访问或清理未确认，请解锁后重试。", "Device material access/cleanup unconfirmed. Unlock and retry.") }
    }
    private func export(_ receipt: NativeScreenshotInbox.Receipt) {
        do {
            guard let scope = session.dataScope else { throw InboxError.invalidInput }
            let delivery = try session.deviceMaterials.prepare(digest: receipt.digest, scope: scope, confirmed: confirmed)
            _ = try session.deviceMaterials.file(for: delivery, scope: session.dataScope)
            lastDelivery = delivery
            activity = delivery
            notice = t("原文件及摘要已核验，等待系统交付结果。", "Original bytes and digest verified; awaiting system handoff.")
        } catch { activity = nil; notice = t("文件已过期或操作未完成；未宣称导出成功。", "File expired or operation incomplete; no export success claimed.") }
    }
    private func reset() {
        activity = nil; confirmed = false; receipts = []
        do { try session.deviceMaterials.clearDelivery() }
        catch { notice = t("临时导出文件清理失败；请解锁后重试。", "Temporary export cleanup failed. Unlock and retry.") }
    }
}
private struct DeviceMaterialActivity: UIViewControllerRepresentable {
    let url: URL
    let result: (Bool) -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, _ in result(completed) }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
