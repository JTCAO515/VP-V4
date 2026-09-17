import SwiftUI
import UIKit

struct NativeTripShareView: View {
    let source: NativeTripShareSource
    let store: NativeTripStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection = NativeTripShareSelection()
    @State private var preview: NativeTripSharePreview?
    @State private var activity: NativeTripSharePreview?
    @State private var renderFailed = false
    @State private var checking = false
    @State private var refreshFailed = false
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var current: Bool { source.matches(scope: session.dataScope, detail: store.detail) }

    var body: some View {
        NavigationStack {
            Form {
                if !current {
                    Text(text("The trip or account changed. Close this card and export the updated plan.", "行程或账号已变化。请关闭此卡片，重新导出最新计划。"))
                        .accessibilityIdentifier("share.stale")
                } else if let preview {
                    Section(text("Privacy preview", "隐私预览")) {
                        ForEach(Array(preview.images.enumerated()), id: \.offset) { index, image in
                            Image(uiImage: image).resizable().scaledToFit()
                                .accessibilityLabel(preview.accessibilityText(page: index))
                                .accessibilityIdentifier("share.preview.\(index)")
                        }
                        Text(text("These exact images will be shared. Exported copies cannot be recalled remotely. This snapshot does not update or grant editing access.", "将分享以上图片。已导出的副本不能远端撤回；快照不会自动更新，也不授予编辑权限。"))
                        Button(text("Share images", "分享图片")) { Task { if await verifyCurrent(), self.preview?.id == preview.id { activity = preview } } }
                            .disabled(checking)
                            .accessibilityIdentifier("share.send")
                        Button(text("Change fields", "修改字段")) { self.preview = nil }
                            .accessibilityIdentifier("share.edit")
                            .disabled(checking)
                    }
                } else {
                    Section(text("Choose what to share", "选择分享内容")) {
                        Text(text("Titles may contain hotel, room, order or companion details. All titles, items and travel dates start hidden. Include only text you want others to see.", "名称中可能含酒店、房间、订单或同行信息。名称、项目和旅行日期默认全部隐藏，请只勾选愿意公开的文字。"))
                        Picker(text("Plan range", "行程范围"), selection: $selection.dayID) {
                            Text(text("Whole trip", "整段行程")).tag(String?.none)
                            ForEach(Array(source.detail.content.days.enumerated()), id: \.element.id) { index, day in
                                Text(text("Day \(index + 1)", "第 \(index + 1) 天")).tag(Optional(day.id))
                            }
                        }.accessibilityIdentifier("share.range")
                        Toggle(text("Include trip title", "包含行程名称"), isOn: $selection.includeTitle)
                            .accessibilityIdentifier("share.title")
                        Toggle(text("Include travel dates", "包含旅行日期"), isOn: $selection.includeDates)
                            .accessibilityIdentifier("share.dates")
                    }
                    ForEach(Array(source.detail.content.days.enumerated()), id: \.element.id) { index, day in
                        if selection.dayID == nil || selection.dayID == day.id {
                            Section(text("Day \(index + 1)", "第 \(index + 1) 天")) {
                                ForEach(day.items) { item in
                                    Toggle(item.title, isOn: Binding(get: { selection.items.contains(.init(dayID: day.id, itemID: item.id)) }, set: { included in
                                        if included { selection.items.insert(.init(dayID: day.id, itemID: item.id)) }
                                        else { selection.items.remove(.init(dayID: day.id, itemID: item.id)) }
                                    })).accessibilityIdentifier("share.item.\(item.id)")
                                }
                            }
                        }
                    }
                    Button(text("Preview images", "预览图片")) { Task { if await verifyCurrent() { render() } } }
                        .disabled(checking)
                        .accessibilityIdentifier("share.preview")
                    if renderFailed { Text(text("Could not create the images. Try again.", "未能生成图片，请重试。")) }
                }
                if refreshFailed { Text(text("Could not check the latest saved plan. Reconnect and try again.", "未能核对最新保存计划，请恢复连接后重试。")) }
            }
            .navigationTitle(text("Share trip", "分享行程"))
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(text("Close", "关闭")) { dismiss() }.accessibilityIdentifier("share.close")
            } }
            .sheet(item: $activity) { NativeTripShareActivity(images: $0.images) }
        }
        .onChange(of: current) { _, valid in
            if !valid { preview = nil; activity = nil }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.reload(using: session) } }
        }
    }

    private func verifyCurrent() async -> Bool {
        guard current, !checking, !store.busy else { return false }
        checking = true
        defer { checking = false }
        let ok = await store.refreshForSharing(using: session)
        refreshFailed = !ok
        return ok && current
    }

    private func render() {
        guard current, let card = NativeTripShareCard.make(from: source.detail, selection: selection, chinese: chinese, now: Date()) else { return }
        preview = NativeTripSharePreview.render(card)
        renderFailed = preview == nil
    }
}

struct NativeTripSharePreview: Identifiable {
    let id = UUID()
    let card: NativeTripShareCard
    let images: [UIImage]

    @MainActor static func render(_ card: NativeTripShareCard) -> Self? {
        var images: [UIImage] = []
        for page in card.pages.indices {
            let renderer = ImageRenderer(content: NativeTripShareImage(card: card, page: page)
                .environment(\.colorScheme, .light).environment(\.dynamicTypeSize, .large))
            renderer.scale = 2
            guard let image = renderer.uiImage else { return nil }
            images.append(image)
        }
        return Self(card: card, images: images)
    }

    func accessibilityText(page: Int) -> String {
        ([card.title, "v\(card.version)", card.exportedAt, card.disclosure] + card.pages[page].map { [$0.day, $0.title].compactMap { $0 }.joined(separator: ": ") }).joined(separator: "\n")
    }
}

private struct NativeTripShareImage: View {
    let card: NativeTripShareCard
    let page: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("VisePanda").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.vpAccent)
            Text(card.title).font(.system(size: 26, weight: .bold))
            Text(card.chinese ? "已确认版本 \(card.version) · \(page + 1)/\(card.pages.count)" : "Confirmed v\(card.version) · \(page + 1)/\(card.pages.count)")
                .font(.system(size: 13))
            Divider()
            ForEach(Array(card.pages[page].enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 6) {
                    Text(row.day).font(.system(size: 14, weight: .semibold))
                    Text(row.title ?? (card.chinese ? "项目已隐藏" : "Items hidden")).font(.system(size: 18))
                }
            }
            Divider()
            Text(card.disclosure).font(.system(size: 12))
            Text((card.chinese ? "导出时间：" : "Exported: ") + card.exportedAt).font(.system(size: 11))
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(24).frame(width: 360, alignment: .leading)
        .foregroundStyle(Color.black).background(Color.white)
    }
}

struct NativeTripShareActivity: UIViewControllerRepresentable {
    let images: [UIImage]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: images, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
