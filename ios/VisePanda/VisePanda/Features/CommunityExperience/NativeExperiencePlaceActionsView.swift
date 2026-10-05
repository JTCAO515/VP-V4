import SwiftUI

/// Canonical IDs alone cannot manufacture a provider tuple for the original actions.
/// Obtain that tuple from the existing current-owner reader, then requalify the source.
struct NativeExperiencePlaceActionsView: View {
    let experience: NativeExperience
    let actor: NativeCommunitySafetyActor
    let access: NativeExperienceAccess
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var reader = NativeExperienceReadWindow<NativeExperience>()
    @State private var selected: NativeCommunityPlaceSelection?
    @State private var picker: PickerToken?
    @State private var action: Task<Void, Never>?
    @State private var unavailable = false
    private struct PickerToken: Identifiable { let id = UUID() }
    private var current: NativeCommunitySafetyActor? { phase == .active && access.current() == actor ? actor : nil }
    private var canonical: NativeExperiencePlace? { reader.visible(current: current)?.place }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var qualifiedSelection: NativeSavedPlaceOpen? {
        guard let canonical, let selected, current == actor,
              selected.actor == NativeCommunityActor(scope: actor.scope, sessionID: actor.sessionID), selected.row.mappingStatus == "current",
              selected.row.selection.canonicalPoiId == canonical.canonicalID, selected.row.mappingDigest == canonical.mappingDigest else { return nil }
        return .init(scope: actor.scope, tripId: selected.tripID, tripVersion: selected.tripVersion, row: selected.row)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("明确选择自己行程内同一 canonical 地点的当前收藏，沿原地点操作查看候选差异并确认。地点身份或来源不齐全时保持不可用。", "Choose the current saved reference for the same canonical place in your own Trip. Original place actions provide the candidate diff and confirmation. Missing place identity or source remains unavailable."))
            Button(t("重读体验并重新选择原地点", "Reread experience and select original place")) {
                clear(); action = Task { await requalify(); if canonical != nil { picker = .init() } }
            }.disabled(current == nil || reader.busy)
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let chosen = qualifiedSelection {
                    NativePlaceActionsView(candidate: chosen.candidate, session: session, chinese: chinese, active: current != nil, savedReference: chosen)
                        .id(chosen.id + ":" + String(chosen.tripVersion))
                } else { Text(t("尚无当前、同一映射的原地点引用。请重新选择；不会猜测 provider ID、地点名称或改写行程。", "No current original place reference with the same mapping. Reselect it; provider IDs and place names are never guessed and the Trip is not rewritten.")) }
            }
            if unavailable { Text(t("所选地点与体验关联不一致，或来源已失效。", "Selected place does not match the experience, or its source became unavailable.")) }
            Link(t("前往 Explore 查找与收藏准确地点", "Open Explore to find and save the exact place"), destination: URL(string: "visepanda://explore")!)
        }
        .task { await requalify() }
        .task(id: current) {
            while !Task.isCancelled, current != nil {
                reader.tick(current: current)
                if canonical == nil { selected = nil; picker = nil }
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
            }
        }
        .onChange(of: current) { _, _ in clear() }
        .onDisappear { clear() }
        .sheet(item: $picker) { _ in
            NativeCommunityPlacePicker(session: session, actor: .init(scope: actor.scope, sessionID: actor.sessionID), chinese: chinese) { value in
                picker = nil
                action?.cancel(); action = Task {
                    await requalify()
                    guard let canonical, current == actor, !Task.isCancelled,
                          value.row.selection.canonicalPoiId == canonical.canonicalID, value.row.mappingDigest == canonical.mappingDigest else { unavailable = true; selected = nil; return }
                    selected = value; unavailable = false
                }
            }
        }
    }
    private func requalify() async {
        selected = nil
        await reader.load(current: { self.current }) {
            let body = try NativeCommunityWire.bytes(["action": "detail", "publicationId": experience.id])
            let outcome = try NativeExperienceOutcome.decode(await access.request(body, actor), actor: actor)
            guard try outcome.matches(NativeExperienceInput(body: body)), case .detail(let current) = outcome,
                  current.submissionVersion == experience.submissionVersion, current.safetyVersion == experience.safetyVersion,
                  current.publicationVersion == experience.publicationVersion, current.place == experience.place else { throw NativeDataError.staleSessionResponse }
            return (current, current.expiresAt)
        }
    }
    private func clear() { action?.cancel(); action = nil; reader.clear(); selected = nil; picker = nil }
}
