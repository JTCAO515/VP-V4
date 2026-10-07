import Foundation

enum NativeResultDataCopy {
    static func scope(_ sensitive: Bool, chinese: Bool) -> String {
        sensitive ? (chinese ? "所选成果及其全部版本" : "Selected result and all its revisions")
            : (chinese ? "本清理出口的临时预览进度" : "This cleanup exit's transient preview progress")
    }
    static func label(_ code: String, chinese: Bool) -> String {
        let labels: [String: (String, String)] = [
            "artifactIds": ("所选成果", "Selected results"), "revisions": ("全部成果版本", "All result revisions"),
            "eventIds": ("全部成果事件", "All result events"), "executionIds": ("独占执行副本", "Exclusive execution copies"),
            "journalIds": ("独占执行日志副本", "Exclusive execution journal copies"), "publicationKeys": ("发布身份围栏", "Publication identity fences"),
            "conversationIds": ("原会话", "Original conversations"), "goalIds": ("原目标", "Original goals"),
            "messageIds": ("原消息", "Original messages"), "taskIds": ("原任务", "Original tasks"),
            "turnIds": ("原轮次", "Original turns"), "threadIds": ("原线程", "Original threads"),
            "tripIds": ("原行程", "Original Trips"), "memoryIds": ("原显式记忆", "Original explicit Memory"),
            "sourceArtifactIds": ("原来源成果", "Original source results"), "proposalIds": ("原提案", "Original proposals"),
            "artifacts": ("所选成果敏感内容", "Selected result's sensitive content"), "resultEvents": ("成果事件敏感内容", "Sensitive result event content"),
            "planning": ("独占规划副本", "Exclusive planning copies"), "executionRuns": ("独占执行记录", "Exclusive execution records"),
            "callWindows": ("独占调用记录", "Exclusive call records"), "collectorOrigins": ("独占采集来源副本", "Exclusive collector source copies"),
            "collectorOutputs": ("独占采集输出副本", "Exclusive collector output copies"), "resultClaims": ("独占成果声明副本", "Exclusive result claim copies"),
            "completionProofs": ("独占完成证明副本", "Exclusive completion proof copies"), "completedReceipts": ("独占完成回执副本", "Exclusive completion receipt copies"),
            "localJournals": ("独占本地执行日志副本", "Exclusive local execution journal copies"),
            "conversations": ("保留原会话", "Preserved original conversations"), "goals": ("保留原目标", "Preserved original goals"),
            "messages": ("保留原消息", "Preserved original messages"), "tasks": ("保留原任务", "Preserved original tasks"),
            "turns": ("保留原轮次", "Preserved original turns"), "threads": ("保留原线程", "Preserved original threads"),
            "trips": ("保留原行程", "Preserved original Trips"), "memories": ("保留原显式记忆", "Preserved original explicit Memory"),
            "sourceArtifacts": ("保留来源成果", "Preserved source results"), "proposals": ("保留原提案", "Preserved original proposals"),
            "budgetAttempts": ("保留预算与尝试记录", "Preserved budget and attempt records"), "planningSources": ("保留原规划来源", "Preserved original planning sources"),
            "SCOPE_TOO_LARGE": ("关系或副本范围超出安全清理上限", "The graph or copies exceed the safe cleanup bound"),
            "ACTIVE_WORK": ("仍有活动工作，当前无法安全清理", "Active work prevents safe cleanup"),
            "SHARED_OR_FOREIGN_SCOPE": ("涉及共享或其他用户对象，不能清理", "Shared or other-user objects prevent cleanup"),
            "CROSS_RESULT_REFERENCE": ("其他成果依赖此成果，须先处理原依赖", "Another result depends on this result; resolve the original dependency first"),
            "CONVERSATION_SOURCE_REFERENCE": ("会话仍引用此成果来源，须先处理原引用", "A conversation still references this result; resolve the original reference first"),
            "PROPOSAL_REFERENCE": ("已应用或未应用提案仍有依赖，须通过原提案流程处理", "An applied or unapplied proposal remains dependent; use its original flow"),
            "DECISION_REFERENCE": ("选择记录仍依赖此成果，须先处理原选择关系", "A decision still depends on this result; resolve the original decision relation first"),
            "READINESS_REFERENCE": ("准备事项仍有引用，须通过原流程处理", "Readiness references require their original flow"),
            "GUIDE_REFERENCE": ("旅途指南仍有引用，须通过原流程处理", "Guide references require their original flow"),
            "SCOPED_EDIT_REFERENCE": ("局部修改仍有引用，须通过原流程处理", "Scoped edits require their original flow"),
            "NOTIFICATION_REFERENCE": ("通知仍有引用，须通过原通知流程处理", "Notification references require their original flow"),
            "BRIEF_REFERENCE": ("旅行简报仍有引用，须通过原流程处理", "Brief references require their original flow"),
            "KNOWLEDGE_MIXED_COPY": ("知识副本混合了其他资料，无法安全独占清理", "A knowledge copy mixes other data and cannot be exclusively cleaned up"),
            "CORE_EXPORT_COPY": ("已有导出副本，须通过原导出清理流程处理", "Existing export copies require their original cleanup flow"),
            "OTHER_DELETE_PENDING": ("存在其他未决清理，须先核验原操作", "Another cleanup is pending; verify its original operation first"),
            "SOURCE_UNSUPPORTED": ("来源资格或独占关系尚不能核验，不能清理", "Source authority or exclusivity cannot be verified; cleanup is blocked"),
            "one_selected_artifact_all_revisions_and_events": ("仅所选一个成果的全部版本和事件敏感内容", "Sensitive content in every revision and event of the one selected result"),
            "proven_exclusive_completed_planning_result_copies": ("经核验独占且已完成的规划与执行副本", "Verified exclusive completed planning and execution copies"),
            "original_conversations_goals_messages_tasks_turns_threads": ("保留原会话、目标、消息、任务、轮次与线程", "Original conversations, goals, messages, tasks, turns and threads remain"),
            "confirmed_trip_content_history_proposals": ("保留原行程内容、历史与提案", "Original Trip content, history and proposals remain"),
            "explicit_memory_profiles_receipts_consents": ("保留原显式记忆、偏好、回执与同意", "Original explicit Memory, profiles, receipts and consent remain"),
            "original_source_results_and_evidence": ("保留原来源成果与证据", "Original source results and evidence remain"),
            "financial_budget_dispatch_and_source_records": ("保留财务、预算、派发与原来源记录", "Financial, budget, dispatch and original source records remain"),
            "permanent_artifact_publication_execution_journal_and_operation_fences": ("保留永久成果身份、发布、执行、日志及操作围栏，旧写入不能复活成果", "Permanent result identity, publication, execution, journal and operation fences remain to prevent revival by old writes"),
            "original_source_policy_consent_authority_ids": ("保留原来源政策与同意授权标识", "Original source policy and consent identities remain"),
            "cross_result_or_conversation_source_dependents_rejected": ("跨成果或会话来源依赖会阻挡清理", "Cross-result or conversation source dependencies block cleanup"),
            "applied_or_unapplied_proposal_and_decision_dependencies_rejected": ("已应用或未应用提案、选择依赖会阻挡清理", "Applied or unapplied proposal and decision dependencies block cleanup"),
            "active_shared_or_unqualified_copies_rejected": ("活动、共享或资格不明的副本会阻挡清理", "Active, shared or unqualified copies block cleanup"),
            "brief_guide_notification_knowledge_and_core_export_copies_rejected": ("简报、指南、通知、知识及原导出副本会阻挡清理", "Brief, guide, notification, knowledge and original export copies block cleanup"),
            "provider_and_external_copies_not_erased": ("供应商与外部副本不在本次清理范围", "Provider and external copies are outside this cleanup scope"),
            "backup_restore_and_old_device_acceptance_unverified": ("备份恢复与旧设备清理尚未验收", "Backup restore and old-device cleanup remain unverified"),
            "selected_transient_preview_graph_counts_references_conflicts": ("仅清理所选操作的临时预览关系、数量、引用与阻挡明细", "Only selected operations' transient preview graphs, counts, references and conflicts are cleared"),
            "selection_actor_epoch_hash_time_operation_fences": ("保留选择、本人会话资格、摘要、时间与操作围栏", "Selection, actor/session authority, digests, times and operation fences remain"),
            "immutable_minimal_decisions_and_identity_tombstones": ("保留不可变最小决策与永久身份围栏", "Immutable minimal decisions and permanent identity fences remain"),
            "source_results_not_erased": ("此临时进度清理不会擦除原成果内容", "Clearing transient progress does not erase source result content"),
            "unselected_operations": ("未选操作保留", "Unselected operations remain"),
            "external_copies": ("外部副本保留", "External copies remain")
        ]
        guard let value = labels[code] else { return chinese ? "尚不能核验此字段" : "This field cannot yet be verified" }
        return chinese ? value.0 : value.1
    }
}
