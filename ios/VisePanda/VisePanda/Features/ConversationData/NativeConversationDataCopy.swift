import Foundation

enum NativeConversationDataCopy {
    static func scope(_ scope: NativeConversationDataScope, chinese: Bool) -> String {
        if scope == .sensitive { return chinese ? "所选会话的敏感资料" : "Selected conversation's sensitive data" }
        return chinese ? "本删除出口的临时预览进度" : "This deletion exit's transient preview progress"
    }
    static func root(_ root: NativeConversationDataRoot, chinese: Bool) -> String {
        root == .conversation ? (chinese ? "助手会话" : "Assistant conversation") : (chinese ? "独立线程" : "Standalone thread")
    }
    static func label(_ code: String, chinese: Bool) -> String {
        let labels: [String: (String, String)] = [
            "conversationIds": ("会话", "Conversations"), "threadIds": ("线程", "Threads"), "turnIds": ("轮次", "Turns"),
            "taskIds": ("任务", "Tasks"), "goalIds": ("目标", "Goals"), "messageIds": ("消息", "Messages"), "artifactIds": ("成果", "Results"),
            "conversations": ("会话记录", "Conversation records"), "goals": ("目标", "Goals"), "messages": ("消息", "Messages"),
            "threads": ("线程", "Threads"), "turns": ("轮次", "Turns"), "events": ("轮次事件", "Turn events"),
            "idempotency": ("轮次重复请求记录", "Turn replay records"), "feedback": ("反馈", "Feedback"),
            "artifacts": ("成果", "Results"), "revisions": ("成果全部版本", "All result revisions"), "resultEvents": ("成果事件", "Result events"),
            "sourceReceipts": ("消息来源回执", "Message source receipts"), "intakes": ("旅行需求", "Travel intakes"),
            "intakeBindings": ("需求绑定", "Intake bindings"), "planning": ("规划副本", "Planning copies"),
            "actionReceipts": ("规划动作回执", "Planning action receipts"), "observations": ("规划观察资料", "Planning observations"),
            "modelDispatches": ("规划模型请求副本", "Planning model request copies"), "checkpoints": ("规划检查点", "Planning checkpoints"),
            "attemptBindings": ("规划尝试绑定", "Planning attempt bindings"), "localJournals": ("规划模型日志副本", "Planning model journal copies"),
            "executionRuns": ("规划执行副本", "Planning execution copies"), "callWindows": ("调用窗口", "Call windows"),
            "collectorOrigins": ("采集来源", "Collector origins"), "collectorOutputs": ("采集输出", "Collector outputs"),
            "resultClaims": ("成果声明", "Result claims"), "completionProofs": ("完成证明副本", "Completion proof copies"),
            "completedReceipts": ("规划完成回执副本", "Planning completion receipt copies"), "grounded": ("有依据回答副本", "Grounded answer copies"),
            "assistJobs": ("辅助任务副本", "Assist job copies"), "work": ("工作副本", "Work copies"),
            "memoryConsumers": ("本轮 Memory 使用引用", "This turn's Memory consumer references"), "goalLinks": ("目标行程链接", "Goal Trip links"),
            "textBodies": ("原私有输入与输出", "Original private input and output"), "taskDigests": ("任务目标摘要", "Task goal digests"),
            "tasks": ("最小任务身份与权限记录", "Minimal task identity and authority records"), "taskTurns": ("任务轮次身份", "Task turn identities"),
            "capacity": ("任务容量记录", "Task capacity records"), "budgetAttempts": ("预算尝试记录", "Budget attempt records"),
            "textDispatches": ("原文字调用身份记录", "Original text dispatch identity records"), "goalTripReceipts": ("原行程链接操作回执", "Original Trip link operation receipts"),
            "selected_conversation_goals_messages_intakes_source_receipts": ("所选会话的目标、消息、需求及来源回执", "Selected conversation's goals, messages, intakes and source receipts"),
            "exclusive_threads_turns_events_feedback": ("只属于所选会话的线程、轮次、事件和反馈", "Threads, turns, events and feedback exclusive to the selection"),
            "exclusive_results_all_revisions_events": ("独占成果的全部版本与事件", "All revisions and events of exclusive results"),
            "closed_planning_grounded_worker_copies": ("完整关系图内的规划、回答和工作副本", "Planning, answer and work copies within the closed graph"),
            "selected_turn_memory_consumer_references": ("所选轮次的 Memory 使用引用", "Selected turns' Memory consumer references"),
            "selected_private_text_input_output_permanently_hidden": ("原私有输入输出永久隐藏，输入替换为固定删除标记", "Original private input and output permanently hidden; input replaced with a fixed deletion marker"),
            "selected_task_goal_digest_fixed_deleted_marker": ("任务目标摘要替换为固定删除标记的摘要", "Task goal digests replaced with the digest of a fixed deletion marker"),
            "confirmed_trip_content_history_proposals": ("已确认 Trip 的正文、历史和 proposal", "Confirmed Trip content, history and proposals"),
            "explicit_memory_profiles_receipts_consents": ("原显式 Memory、Profile、回执及同意记录", "Original explicit Memory, profiles, receipts and consent records"),
            "other_conversations_and_domains": ("其他会话、财务及其他领域资料", "Other conversations, financial records and other domains"),
            "minimal_task_capacity_budget_dispatch_link_receipts": ("最小任务、容量、预算、调用及行程链接回执", "Minimal task, capacity, budget, dispatch and Trip link receipts"),
            "permanent_entity_identity_and_operation_fences": ("永久实体身份、删除标记及操作围栏", "Permanent entity identities, tombstones and operation fences"),
            "original_source_policy_consent_authority_ids": ("原来源的政策与同意标识；恢复仍核验同一原始授权", "Original source policy and consent identities; recovery checks the same original authority"),
            "applied_or_unapplied_proposal_source_requires_original_flow": ("涉及已应用或未应用 proposal 来源的对象须使用原处理流程", "Objects referenced by applied or unapplied proposals require the original flow"),
            "shared_cross_scope_or_active_work_rejected": ("共享、跨范围或仍在执行的对象拒绝本次擦除", "Shared objects, cross-scope objects and active work are rejected"),
            "readiness_guide_scoped_edit_notification_brief_links_rejected": ("准备检查、指南、定向编辑、通知和 Brief 引用须原流程处理", "Readiness, guide, scoped-edit, notification and Brief references require their original flows"),
            "existing_core_export_copies_require_original_cleanup": ("已有核心导出副本须通过原出口清理", "Existing core-export copies require their original cleanup"),
            "provider_and_external_copies_not_erased": ("供应商及外部副本不在此擦除范围", "Provider and external copies are outside this erasure scope"),
            "backup_restore_and_old_device_acceptance_unverified": ("备份恢复与旧设备行为尚未验证", "Backup restore and old-device behavior are unverified"),
            "selected_transient_preview_graph_conflicts_references": ("所选操作的临时预览关系图、阻挡及引用", "Selected operations' transient preview graph, conflicts and references"),
            "root_selection_actor_epoch_hash_time_operation_fences": ("root 选择、身份、epoch、摘要、时间及操作围栏", "Root selection, actor, epoch, digests, times and operation fences"),
            "immutable_minimal_decisions_and_entity_tombstones": ("不可变最小决策及实体删除标记", "Immutable minimal decisions and entity tombstones"),
            "source_conversation_data_not_erased": ("原会话资料不因清理预览进度而擦除", "Source conversation data is preserved when cleaning preview progress"),
            "unselected_operations": ("未选操作保留", "Unselected operations remain"), "external_copies": ("外部副本保留", "External copies remain"),
            "SCOPE_TOO_LARGE": ("关系图超出本出口容量", "Graph exceeds this exit's capacity"),
            "ACTIVE_WORK": ("存在仍在执行或未结算的工作", "Active or unsettled work exists"),
            "SHARED_OR_FOREIGN_SCOPE": ("存在共享或不属于本人的关系", "Shared or foreign-scope relations exist"),
            "CROSS_SCOPE_REFERENCE": ("存在所选范围之外的引用", "References outside the selection exist"),
            "PROPOSAL_REFERENCE": ("proposal 来源仍引用此资料", "A proposal source still references this data"),
            "READINESS_REFERENCE": ("准备检查仍引用此资料", "Readiness still references this data"),
            "GUIDE_REFERENCE": ("指南仍引用此资料", "A guide still references this data"),
            "SCOPED_EDIT_REFERENCE": ("定向编辑仍引用此资料", "A scoped edit still references this data"),
            "NOTIFICATION_REFERENCE": ("通知仍引用此资料", "A notification still references this data"),
            "BRIEF_REFERENCE": ("Brief 仍引用此资料", "A Brief still references this data"),
            "CORE_EXPORT_COPY": ("已有核心导出副本仍包含此资料", "An existing core-export copy still contains this data"),
            "OTHER_DELETE_PENDING": ("原删除流程尚未决", "An original deletion flow remains pending"),
            "SOURCE_UNSUPPORTED": ("源关系无法完整核验", "Source relations cannot be fully verified")
        ]
        guard let label = labels[code] else { return code }
        return chinese ? label.0 : label.1
    }
}
