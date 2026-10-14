import SwiftUI

@MainActor struct NativeFrontendChatSheet: View {
    let state: NativeFrontendState
    let kind: String
    let close: () -> Void
    let insert: (String) -> Void
    private var plan: NativeFrontendMaterial? { state.materials.first { $0.id == "sample-plan" } }
    private var journey: NativeFrontendJourney? { plan.flatMap { material in state.journeys.first { $0.id == material.journeyID } } }
    private var title: String {
        switch kind {
        case "attachment": "添加资料"
        case "voice": "语音输入"
        case "translationUnavailable": "表达"
        case "placeUnavailable": "地点"
        case "confirmation": "确认样例安排"
        default: "暂不可用"
        }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    NativeFrontendBoundary()
                    switch kind {
                    case "attachment": attachments
                    case "voice": voice
                    case "confirmation": confirmation
                    case "translationUnavailable", "placeUnavailable":
                        ContentUnavailableView("此页面尚未由主入口接入", systemImage: kind == "placeUnavailable" ? "mappin" : "character.bubble", description: Text("当前没有发出定位、翻译或模型请求。你可以返回对话继续输入。"))
                        Button("返回对话", action: close).buttonStyle(.borderedProminent)
                    default:
                        ContentUnavailableView("这个入口暂不可用", systemImage: "questionmark.circle")
                        Button("返回对话", action: close)
                    }
                }.padding(22).frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭", action: close).accessibilityIdentifier("frontend.chat.sheet.close") } }
        }
        .presentationDragIndicator(.visible)
    }
    private var attachments: some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: "doc.badge.plus").font(.largeTitle).foregroundStyle(.secondary)
            Text("从已有样例开始").font(.title2.weight(.semibold))
            Text("文件、相册与受保护的 PDF／截图导入未在本地体验中启用；不会索取权限或上传材料。")
                .font(.subheadline).foregroundStyle(.secondary)
            ForEach(state.materials) { material in
                VStack(alignment: .leading, spacing: 10) {
                    Text(material.title).font(.headline)
                    Text(material.source).font(.caption).foregroundStyle(.secondary)
                    ViewThatFits(in: .horizontal) {
                        HStack { draftButton(material); openButton(material) }
                        VStack(alignment: .leading, spacing: 12) { draftButton(material); openButton(material) }
                    }
                }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            }
            if state.materials.isEmpty {
                ContentUnavailableView("还没有样例资料", systemImage: "tray", description: Text("返回对话说一个想法即可。"))
            }
        }
    }
    private func draftButton(_ material: NativeFrontendMaterial) -> some View {
        Button("带入草稿") { insert(material.content) }.buttonStyle(.borderedProminent)
            .accessibilityIdentifier("frontend.chat.attach.draft.\(material.id)")
    }
    private func openButton(_ material: NativeFrontendMaterial) -> some View {
        Button("打开资料") { close(); state.openMaterial(material.id) }.buttonStyle(.bordered)
            .accessibilityIdentifier("frontend.chat.attach.open.\(material.id)")
    }
    private var voice: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "waveform.circle").font(.system(size: 52, weight: .light)).foregroundStyle(.secondary)
            Text("语音能力还未接入").font(.title2.weight(.semibold))
            Text("这里不会录音、访问麦克风或生成识别结果。你可以把一段明确标注的样例文字放入草稿，再由你决定是否发送。")
                .foregroundStyle(.secondary)
            Text("样例文字：想安排一次轻松的城市漫步，留一些休息时间。")
                .padding(16).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            Button("使用这段样例文字") { insert("想安排一次轻松的城市漫步，留一些休息时间。") }
                .buttonStyle(.borderedProminent).accessibilityIdentifier("frontend.chat.voice.insert")
            Button("取消，返回对话", action: close)
        }
    }
    private var confirmation: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let plan, let journey, state.pendingConfirmation {
                Text("确认前，先看看会发生什么").font(.title2.weight(.semibold))
                Text(plan.title).font(.headline)
                VStack(alignment: .leading, spacing: 12) {
                    Label("当前：\(journey.confirmed ? "已确认本地样例" : "尚未确认")", systemImage: "minus.circle")
                        .foregroundStyle(.secondary)
                    Label("确认后：已确认本地样例", systemImage: "plus.circle").foregroundStyle(Color.accentColor)
                    Divider()
                    ForEach(Array(journey.days.enumerated()), id: \.offset) { _, day in Text(day) }
                }.padding(18).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
                Text("两日内容保持当前显示，仅改变本地样例的确认状态。不会写入真实 Trip、创建预订或产生费用。")
                    .font(.footnote).foregroundStyle(.secondary)
                Button("明确确认这份本地样例") {
                    guard state.pendingConfirmation, state.journeys.first?.id == journey.id else { return }
                    state.confirmPlan(); close()
                }.buttonStyle(.borderedProminent).accessibilityIdentifier("frontend.chat.plan.confirm")
                Button("取消本次确认") { state.cancelPlan(); close() }
                    .accessibilityIdentifier("frontend.chat.plan.cancel")
            } else {
                ContentUnavailableView("没有待确认的样例变化", systemImage: "checkmark.circle", description: Text("原安排保留，可以返回对话继续。"))
                Button("返回对话", action: close)
            }
        }
    }
}
