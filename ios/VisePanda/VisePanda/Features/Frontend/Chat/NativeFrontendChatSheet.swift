import SwiftUI

@MainActor struct NativeFrontendChatSheet: View {
    @Environment(\.locale) private var locale
    private func copy(_ zh: String, _ en: String) -> String {
        locale.language.languageCode?.identifier == "zh" ? zh : en
    }
    let state: NativeFrontendState
    let kind: String
    let close: () -> Void
    let insert: (String) -> Void
    private var plan: NativeFrontendMaterial? { state.materials.first { $0.id == "sample-plan" } }
    private var journey: NativeFrontendJourney? { plan.flatMap { material in state.journeys.first { $0.id == material.journeyID } } }
    private var title: String {
        switch kind {
        case "attachment": copy("添加资料", "Add materials")
        case "voice": copy("语音输入", "Voice input")
        case "translationUnavailable": copy("表达", "Expression")
        case "placeUnavailable": copy("地点", "Places")
        case "confirmation": copy("确认样例安排", "Confirm sample plan")
        default: copy("暂不可用", "Unavailable")
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
                        ContentUnavailableView(copy("此页面尚未由主入口接入", "This page is not connected to the main entry yet"), systemImage: kind == "placeUnavailable" ? "mappin" : "character.bubble", description: Text(copy("当前没有发出定位、翻译或模型请求。你可以返回对话继续输入。", "No location, translation, or model request has been sent. Return to the conversation to keep typing.")))
                        Button(copy("返回对话", "Return to conversation"), action: close).buttonStyle(.borderedProminent)
                    default:
                        ContentUnavailableView(copy("这个入口暂不可用", "This entry is unavailable"), systemImage: "questionmark.circle")
                        Button(copy("返回对话", "Return to conversation"), action: close)
                    }
                }.padding(22).frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("关闭", "Close"), action: close).accessibilityIdentifier("frontend.chat.sheet.close") } }
        }
        .presentationDragIndicator(.visible)
    }
    private var attachments: some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: "doc.badge.plus").font(.largeTitle).foregroundStyle(.secondary)
            Text(copy("从已有样例开始", "Start with an existing sample")).font(.title2.weight(.semibold))
            Text(copy("文件、相册与受保护的 PDF／截图导入未在本地体验中启用；不会索取权限或上传材料。", "File, photo library, and protected PDF/screenshot imports are not enabled in this local experience. No permissions will be requested or materials uploaded."))
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
                ContentUnavailableView(copy("还没有样例资料", "No sample materials yet"), systemImage: "tray", description: Text(copy("返回对话说一个想法即可。", "Return to the conversation and share an idea.")))
            }
        }
    }
    private func draftButton(_ material: NativeFrontendMaterial) -> some View {
        Button(copy("带入草稿", "Add to draft")) { insert(material.content) }.buttonStyle(.borderedProminent)
            .accessibilityIdentifier("frontend.chat.attach.draft.\(material.id)")
    }
    private func openButton(_ material: NativeFrontendMaterial) -> some View {
        Button(copy("打开资料", "Open material")) { close(); state.openMaterial(material.id) }.buttonStyle(.bordered)
            .accessibilityIdentifier("frontend.chat.attach.open.\(material.id)")
    }
    private var voice: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "waveform.circle").font(.system(size: 52, weight: .light)).foregroundStyle(.secondary)
            Text(copy("语音能力还未接入", "Voice input is not connected yet")).font(.title2.weight(.semibold))
            Text(copy("这里不会录音、访问麦克风或生成识别结果。你可以把一段明确标注的样例文字放入草稿，再由你决定是否发送。", "This page does not record audio, access the microphone, or generate a transcript. You can add clearly labeled sample text to your draft and decide whether to send it."))
                .foregroundStyle(.secondary)
            Text(copy("样例文字：", "Sample text: ") + "想安排一次轻松的城市漫步，留一些休息时间。")
                .padding(16).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            Button(copy("使用这段样例文字", "Use this sample text")) { insert("想安排一次轻松的城市漫步，留一些休息时间。") }
                .buttonStyle(.borderedProminent).accessibilityIdentifier("frontend.chat.voice.insert")
            Button(copy("取消，返回对话", "Cancel and return to conversation"), action: close)
        }
    }
    private var confirmation: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let plan, let journey, state.pendingConfirmation {
                Text(copy("确认前，先看看会发生什么", "Review what will happen before confirming")).font(.title2.weight(.semibold))
                Text(plan.title).font(.headline)
                VStack(alignment: .leading, spacing: 12) {
                    Label(copy("当前：", "Current: ") + (journey.confirmed ? copy("已确认本地样例", "Local sample confirmed") : copy("尚未确认", "Not confirmed")), systemImage: "minus.circle")
                        .foregroundStyle(.secondary)
                    Label(copy("确认后：已确认本地样例", "After confirmation: Local sample confirmed"), systemImage: "plus.circle").foregroundStyle(Color.accentColor)
                    Divider()
                    ForEach(Array(journey.days.enumerated()), id: \.offset) { _, day in Text(day) }
                }.padding(18).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
                Text(copy("两日内容保持当前显示，仅改变本地样例的确认状态。不会写入真实 Trip、创建预订或产生费用。", "The two-day content stays as displayed. Only the local sample confirmation status changes. This will not write to a real Trip, create bookings, or incur charges."))
                    .font(.footnote).foregroundStyle(.secondary)
                Button(copy("明确确认这份本地样例", "Confirm this local sample")) {
                    guard state.pendingConfirmation, state.journeys.first?.id == journey.id else { return }
                    state.confirmPlan(); close()
                }.buttonStyle(.borderedProminent).accessibilityIdentifier("frontend.chat.plan.confirm")
                Button(copy("取消本次确认", "Cancel this confirmation")) { state.cancelPlan(); close() }
                    .accessibilityIdentifier("frontend.chat.plan.cancel")
            } else {
                ContentUnavailableView(copy("没有待确认的样例变化", "No sample changes to confirm"), systemImage: "checkmark.circle", description: Text(copy("原安排保留，可以返回对话继续。", "The original plan is kept. Return to the conversation to continue.")))
                Button(copy("返回对话", "Return to conversation"), action: close)
            }
        }
    }
}
