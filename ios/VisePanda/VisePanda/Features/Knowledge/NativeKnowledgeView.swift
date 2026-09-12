import SwiftUI

struct NativeKnowledgeView: View {
    var isActive = true
    var question = false
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeKnowledgeStore()
    @State private var city = "shanghai"
    @State private var scene = "arrival"
    @State private var refresh = UUID()
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private var selection: NativeKnowledgeSelection { .init(city: city, scene: question ? "rail" : scene, locale: chinese ? "zh" : "en") }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var loadKey: LoadKey { .init(scope: session.dataScope, selection: selection, active: scenePhase == .active && isActive, refresh: refresh) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text(question ? text("Which documents do I need to board?", "乘车需要哪些证件？") : text("Travel notes", "旅途参考")).font(.largeTitle.bold())
                Text(question ? text("For adults travelling with a foreign passport on a domestic mainland China railway e-ticket. This answers only the booking ID and ticket-proof question. Read all conditions and check current station guidance. This read-only answer is not saved in your conversation.", "适用于持外国护照的成年旅客、境内铁路电子客票行程。这里只回答购票证件和车票凭证问题；请阅读全部条件，并核对车站最新指引。本次只读回答不保存到对话。") : text("Reviewed information for your selected city and situation. Read each note's conditions and check its source before taking action. This is not complete city coverage.", "按所选城市和场景提供已审核信息。请阅读每条内容的适用条件，行动前核对来源；这里不代表完整城市覆盖。"))
                    .foregroundStyle(Color.vpSecondaryText)
                Picker(text("City", "城市"), selection: selectionBinding($city)) {
                    ForEach(Array(NativeKnowledgeSelection.cities.enumerated()), id: \.element) { index, value in
                        Text(chinese ? ["上海", "北京", "广州", "重庆"][index] : ["Shanghai", "Beijing", "Guangzhou", "Chongqing"][index]).tag(value)
                    }
                }.accessibilityIdentifier("knowledge.city")
                if !question { Picker(text("Situation", "场景"), selection: selectionBinding($scene)) {
                    ForEach(Array(NativeKnowledgeSelection.scenes.enumerated()), id: \.element) { index, value in
                        Text(chinese ? ["入境", "机场交通", "支付", "手机与网络", "公共交通", "出租车", "高铁", "景点", "住宿", "紧急求助"][index] : ["Arrival", "Airport transport", "Payment", "Phone and internet", "Public transport", "Taxis", "Rail", "Attractions", "Accommodation", "Emergency help"][index]).tag(value)
                    }
                }.accessibilityIdentifier("knowledge.scene") }
                Button(text("Refresh", "刷新")) { store.clear(); refresh = UUID() }
                    .buttonStyle(.bordered).accessibilityIdentifier("knowledge.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    content
                }
            }.padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .vpNavigationTitle(question ? "tab.ask" : "tab.explore")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: loadKey) {
            let key = loadKey
            guard key.active, key.scope != nil else { store.clear(); return }
            repeat {
                // A request may itself refresh credentials. Busy must never cancel its task.
                while session.busy {
                    do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                    guard !Task.isCancelled, loadKey == key else { return }
                }
                await store.load(scope: key.scope, selection: key.selection, question: question) {
                    try await session.knowledgeRequest(selection: key.selection, question: question)
                }
                guard !Task.isCancelled, loadKey == key, store.refreshDelay > 0 else { return }
                do { try await Task.sleep(for: .seconds(store.refreshDelay)) }
                catch { return }
            } while !Task.isCancelled && loadKey == key
        }
        .onDisappear { store.clear() }
    }

    @ViewBuilder private var content: some View {
        if session.dataScope == nil {
            Text(text("Sign in in Profile to read travel notes.", "请在「我的」登录后阅读旅途参考。"))
                .accessibilityIdentifier("knowledge.signedOut")
        } else if isActive && scenePhase == .active && store.isCurrent(scope: session.dataScope, selection: selection) {
            if let answer = store.answer { coverage(answer) }
            if store.state == .empty && !question {
                Text(text("No eligible reviewed information is available for this selection.", "当前城市和场景暂无适用的已审核信息。"))
                    .accessibilityIdentifier("knowledge.empty")
            } else {
                ForEach(store.rows) { row in note(row) }
            }
        } else if store.state == .unavailable {
            Text(text("Information is unavailable. Check your sign-in and try again.", "信息暂不可用，请检查登录状态后重试。"))
                .accessibilityIdentifier("knowledge.unavailable")
        } else {
            ProgressView().accessibilityLabel(text("Loading current information", "正在加载当前信息"))
        }
    }

    private func coverage(_ answer: NativeKnowledgeAnswer) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(answer.outcome == "answered" ? text("Both document points have reviewed support.", "两个证件要点均有已审核依据。") : answer.outcome == "partial" ? text("Part of the answer is available.", "目前可回答其中一部分。") : text("This question cannot be answered from current reviewed information.", "当前已审核信息不足以回答这个问题。"))
                .font(.headline).accessibilityIdentifier("knowledge.answer.\(answer.outcome)")
            ForEach(answer.claims.filter { $0.status != "covered" }) { claim in
                VStack(alignment: .leading, spacing: 6) {
                    Text(claim.id == "original_valid_booking_id" ? text("Booking ID", "购票证件") : text("Itinerary and receipt as ticket proof", "行程单和报销凭证是否可作车票"))
                        .font(.subheadline.bold())
                    ForEach(claim.reasons, id: \.self) { reason in
                        Text(gap(reason)).accessibilityIdentifier("knowledge.gap.\(reason)")
                    }
                }
            }
            if answer.outcome != "answered" {
                Text(text("Check the missing point with 12306 or your departure station before travelling.", "出发前请向12306或出发车站核对尚缺的要点。"))
            }
        }
    }

    private func gap(_ reason: String) -> String {
        switch reason {
        case "expired": return text("The supporting publication has expired.", "相关依据已超过有效期。")
        case "revoked": return text("The supporting publication has been withdrawn.", "相关依据已撤回。")
        case "unreviewed": return text("The publication is not currently reviewed.", "相关发布内容当前不满足审核条件。")
        case "unresolved_variants": return text("Reviewed versions differ and have not been reconciled.", "已审核版本存在差异，尚未完成核对。")
        default: return text("No published support was found for this point.", "尚未找到支持这一要点的已发布信息。")
        }
    }

    private func note(_ row: NativeKnowledgeStatement) -> some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(row.text).font(.headline).accessibilityIdentifier("knowledge.note.\(row.id)")
                if !row.conditions.isEmpty { lines(text("Applies when", "适用条件"), row.conditions) }
                if !row.exclusions.isEmpty { lines(text("Not covered", "不包含"), row.exclusions) }
                if let date = NativeKnowledgeRead.date(row.reviewedAt) {
                    Text(text("Reviewed: ", "审核日期：") + date.formatted(date: .abbreviated, time: .omitted))
                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                }
                DisclosureGroup(text("Sources and context", "来源与上下文")) {
                    ForEach(row.sources) { source in
                        VStack(alignment: .leading, spacing: 6) {
                            if let url = source.url { Link(source.publisher, destination: url) }
                            else { Text(source.publisher) }
                            Text(source.locator).font(.caption).foregroundStyle(Color.vpSecondaryText)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func lines(_ title: String, _ values: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.bold())
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in Text("• " + value).fixedSize(horizontal: false, vertical: true) }
        }
    }

    private func selectionBinding(_ value: Binding<String>) -> Binding<String> {
        Binding(get: { value.wrappedValue }, set: { store.clear(); value.wrappedValue = $0 })
    }

    private struct LoadKey: Equatable {
        let scope: NativeDataScope?
        let selection: NativeKnowledgeSelection
        let active: Bool
        let refresh: UUID
    }
}
