import Foundation

enum NativeDataCoverageCopy {
    static let order = ["trip", "conversations", "results", "profile", "memory", "turn", "user_artifact", "brief", "entitlements", "case", "ugc", "safety", "publication", "notifications", "notification_devices", "notification_exit_progress", "lifecycle", "coverage_progress", "guide", "order_references", "pdf_intake", "material_exit_progress", "case_attachments", "archive", "materials", "app_group", "local_share", "guide_cache", "offline", "local_journals", "provider", "backup", "external_copies", "financial_records"]
    static func title(_ id: String, chinese: Bool) -> String {
        let labels: [String: (String, String)] = [
            "trip": ("行程", "Trips"), "conversations": ("对话与目标", "Conversations and goals"), "results": ("生成结果", "Generated results"),
            "profile": ("基础偏好", "Basic preferences"), "memory": ("记忆及派生资料", "Memory and derived data"), "turn": ("任务与历史", "Tasks and history"),
            "user_artifact": ("服务器材料", "Server materials"), "brief": ("旅行者资料", "Traveler Brief"), "entitlements": ("权益引用", "Entitlement references"),
            "case": ("服务请求与进度", "Service requests and progress"), "ugc": ("投稿与审核记录", "Submissions and review records"),
            "safety": ("举报、屏蔽与申诉", "Reports, blocks and appeals"), "publication": ("体验发布与收藏引用", "Experience publication and saved references"),
            "notifications": ("行程通知资料", "Trip notification data"),
            "notification_devices": ("通知设备绑定资料", "Notification device bindings"), "notification_exit_progress": ("通知资料处理记录", "Notification data exit records"), "lifecycle": ("行程状态与操作记录", "Trip states and operation records"), "coverage_progress": ("范围导出进度与请求围栏", "Scoped export progress and request fences"),
            "guide": ("讲解选择元数据", "Guide selection metadata"), "order_references": ("订单引用", "Order references"), "pdf_intake": ("PDF 解析记录", "PDF intake records"),
            "material_exit_progress": ("资料处理记录", "Data operation records"),
            "case_attachments": ("服务附件", "Service attachments"), "archive": ("归档行程", "Archived Trips"), "materials": ("本机材料文件", "Device material files"), "app_group": ("共享容器", "Shared app container"),
            "local_share": ("本机分享临时副本", "Temporary device share copies"), "guide_cache": ("本机讲解缓存", "Device Guide cache"),
            "offline": ("离线行程资料", "Offline Trip data"), "local_journals": ("本机待确认请求", "Pending device requests"),
            "provider": ("服务商副本", "Provider copies"), "backup": ("备份副本", "Backup copies"),
            "external_copies": ("外部已保存文件", "Files saved outside the app"), "financial_records": ("财务留存", "Financial retention")
        ]
        guard let value = labels[id] else { return chinese ? "未知模块" : "Unknown module" }; return chinese ? value.0 : value.1
    }
    static func state(_ value: NativeDataCoverageState?, chinese: Bool) -> String {
        guard let value else { return chinese ? "尚无操作回执" : "No operation receipt" }
        switch value {
        case .scopedComplete: return chinese ? "所选范围已确认" : "Selected scope confirmed"
        case .queued: return chinese ? "已排队，未完成" : "Queued; incomplete"
        case .partial: return chinese ? "部分完成或已取消" : "Partial or cancelled"
        case .unknown: return chinese ? "结果未知" : "Outcome unknown"
        case .unavailable: return chinese ? "当前不可用" : "Currently unavailable"
        case .preview: return chinese ? "仅预览，未执行" : "Preview only; not executed"
        }
    }
    static func missing(_ id: String, chinese: Bool) -> String {
        switch id {
        case "app_group", "local_share": return chinese ? "本构建未配置共享容器／分享扩展，未激活；不能报告已清空。" : "This build has no configured shared container/share extension. It is inactive; erasure cannot be claimed."
        case "external_copies": return chinese ? "系统已导出或他人保存的副本无法远端召回。" : "Files exported by the system or saved by others cannot be recalled remotely."
        case "financial_records", "entitlements": return chinese ? "财务账与商店交易不在此删除范围。必要留存字段及期限须以实际来源为准，目前未确认。" : "Financial ledgers and store transactions are outside this deletion scope. Required retained fields and periods depend on actual sources and are unconfirmed."
        case "provider", "backup": return chinese ? "尚无外部执行及擦除证据，结果未知。" : "External execution and erasure are unverified; the outcome is unknown."
        case "notifications", "notification_devices", "notification_exit_progress": return chinese ? "明确选择记录、预览完整字段后才可导出或擦除服务器通知资料。防重放围栏与最少回执保留；provider、设备与外部副本边界另列，未完成范围不报成功。" : "Select records and review complete fields before exporting or erasing server notification data. Replay fences and minimal receipts remain. Provider, device and external-copy boundaries are listed separately; incomplete scopes are not successful."
        case "lifecycle": return chinese ? "此模块导出仅包含行程状态和操作元数据；行程正文走核心导出。删除须另行明确选择行程，围栏记录保留。" : "This module exports Trip states and operation metadata. Core export handles Trip content. Deletion requires a separately selected Trip; operation fences remain."
        case "coverage_progress": return chinese ? "当前可取得单次范围导出的进度与证明；完整进度清单及其删除尚未接入。请求围栏随原会话／账户撤销清理，不报全账户完成。" : "A scoped export can provide its own progress and proof. Full progress inventory/export/deletion are unavailable. Request fences clear with original session/account revocation; no all-account completion is claimed."
        case "guide_cache": return chinese ? "现有讲解只保留受限临时状态，退出或到期清理；尚无独立缓存清理回执。" : "The existing Guide keeps limited temporary state and clears it on exit/expiry. No independent cache cleanup receipt is available."
        case "local_journals": return chinese ? "各模块保留自己的未确认请求；需在原模块核对，不能批量丢弃后宣称服务器操作已完成。" : "Each module retains its own unresolved requests. Check them in that module; discarding requests cannot prove server completion."
        default: return chinese ? "此操作尚未接入，缺项继续保留在覆盖清单中。" : "This operation is not connected. The missing scope remains in the coverage list."
        }
    }
}
