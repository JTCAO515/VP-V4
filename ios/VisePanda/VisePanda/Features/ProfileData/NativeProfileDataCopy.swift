import Foundation

enum NativeProfileDataCopy {
    static func scope(_ sensitive: Bool, chinese: Bool) -> String {
        sensitive ? (chinese ? "本人 Profile 敏感资料及节奏历史" : "My Profile fields and pace history")
            : (chinese ? "本人清理操作的临时预览进度" : "My cleanup operations’ transient previews")
    }
    static func label(_ key: String, chinese: Bool) -> String {
        let labels: [String: (String, String)] = [
            "displayName": ("显示名称", "Display name"), "travelPace": ("保存的旅行节奏", "Saved travel pace"),
            "locale": ("保存的语言", "Saved language"), "currency": ("保存的币种", "Saved currency"),
            "distanceUnit": ("距离单位", "Distance unit"), "temperatureUnit": ("温度单位", "Temperature unit"),
            "defaultDepartureTime": ("默认出发时间", "Default departure time"),
            "paceNotice": ("节奏用途同意", "Pace purpose consent"), "paceOperation": ("原节奏操作", "Original pace operation"),
            "paceRequest": ("原节奏请求历史", "Original pace request history"), "paceUndo": ("节奏撤销历史", "Pace Undo history"),
            "display_name": ("显示名称", "Display name"), "travel_pace": ("保存的旅行节奏", "Saved travel pace"),
            "distance_unit": ("距离单位", "Distance unit"), "temperature_unit": ("温度单位", "Temperature unit"),
            "default_departure_time": ("默认出发时间", "Default departure time"), "pace_notice": ("节奏用途同意", "Pace purpose consent"),
            "pace_operation": ("原节奏操作", "Original pace operation"), "pace_request": ("原节奏请求历史", "Original pace request history"), "pace_undo": ("节奏撤销历史", "Pace Undo history"),
            "briefPreviews": ("旅行简报预览", "Traveler Brief previews"), "sharedBriefs": ("已分享旅行简报", "Shared Traveler Briefs"),
            "scopedEditContexts": ("限定行程修改的混合来源", "Mixed sources for scoped Trip editing"), "scopedEditWork": ("限定行程修改工作", "Scoped Trip editing work"),
            "recoveryContexts": ("恢复方案的混合来源", "Mixed sources for recovery"), "coreExports": ("已有核心导出副本", "Existing core export copies"),
            "SCOPE_TOO_LARGE": ("范围过大；本次无法确认完整来源", "Scope too large; complete sources cannot be confirmed"),
            "ACTIVE_PROFILE_USE": ("当前工作正在使用此资料", "Active work is using this Profile"),
            "CORE_EXPORT_COPY": ("已有核心导出副本无法在此范围完整清理", "An existing core export copy cannot be fully cleared in this scope"),
            "OTHER_DELETE_PENDING": ("另一个资料清理操作尚未完成", "Another cleanup operation is pending"),
            "SOURCE_UNSUPPORTED": ("来源无法完整核验", "The source cannot be fully verified"),
            "account_auth_sessions": ("账号、登录身份与当前会话保留", "Account, authentication and current sessions remain"),
            "profile_owner_identity_created_at_monotonic_revisions": ("资料所属身份、创建时间与递增版本保留", "Profile owner identity, creation time and increasing revisions remain"),
            "system_fallbacks_without_pace_consent": ("系统缺省设置保留；不视为新的节奏同意", "System fallbacks remain and do not grant new pace consent"),
            "explicit_memory_trip_history_financial_provider_and_other_modules": ("显式 Memory、Trip 历史、财务、提供商及其他模块保留", "Explicit Memory, Trip history, financial, provider and other modules remain"),
            "mixed_domain_copies_under_original_controls": ("混合领域副本由原流程控制", "Mixed domain copies remain under their original controls"),
            "immutable_minimal_decisions_operation_replay_fences": ("最小不可变决策与操作防回放围栏保留", "Minimal immutable decisions and operation replay fences remain"),
            "external_provider_downloaded_export_backup_and_old_device_copies_not_recalled": ("外部提供商、已下载导出、备份及旧设备副本无法召回", "External providers, downloaded exports, backups and old device copies cannot be recalled"),
            "mixed_domain_copies_not_cascade_erased": ("本次不连带擦除混合领域副本", "Mixed domain copies are not erased by this cleanup"),
            "target_backup_and_old_device_acceptance_unverified": ("目标环境备份与旧设备结果尚未验收", "Target backup and old device behavior remains unverified"),
            "selected_transient_preview_counts_conflicts_copy_references": ("仅清理所选临时预览、计数、阻挡及副本引用", "Clears only selected transient previews, counts, conflicts and copy references"),
            "actor_selection_hash_time_operation_fences": ("身份、所选范围、摘要、时间及操作围栏保留", "Actor, selection, digest, time and operation fences remain"),
            "immutable_minimal_decisions": ("最小不可变决策保留", "Minimal immutable decisions remain"),
            "profile_owner_identity_monotonic_revision_erasure_floor": ("资料所属身份、递增版本和清理版本下限保留", "Profile owner identity, increasing revision and erasure floor remain"),
            "profile_source_not_modified": ("本范围不修改 Profile 源资料", "This scope does not modify source Profile data"),
            "unselected_progress": ("未选中的进度保留", "Unselected progress remains"), "external_copies": ("外部副本保留", "External copies remain"),
        ]
        guard let value = labels[key] else { return key }
        return chinese ? value.0 : value.1
    }
}
