import Foundation

enum NativeNotificationDataCopy {
    static func title(_ scope: NativeNotificationDataScope, chinese: Bool) -> String {
        switch scope {
        case .trip: return chinese ? "行程通知资料" : "Trip notification data"
        case .device: return chinese ? "通知设备绑定资料" : "Notification device bindings"
        case .progress: return chinese ? "通知资料处理记录" : "Notification data exit records"
        }
    }
    static func scope(_ scope: NativeNotificationDataScope, chinese: Bool) -> String {
        switch scope {
        case .trip: return chinese ? "选择本人的行程或历史记录，处理其全部通知资料，包括提醒、订阅、发送、发送尝试和操作记录。" : "Select your Trips or historical contexts to handle all their notification data, including reminders, watches, dispatch, attempts and operation records."
        case .device: return chinese ? "选择本人的设备绑定。预览包括完整推送 token 和关联的跨行程发送记录；擦除范围包括这些关联记录。" : "Select your device bindings. Preview includes full push tokens and related dispatch records across Trips; erasure includes those related records."
        case .progress: return chinese ? "选择本人原处理记录，导出必要保留记录或清理临时页进度；回执和防重放围栏继续保留。" : "Select your original exit records to export retained metadata or clear temporary page progress. Receipts and replay fences remain."
        }
    }
    static func state(_ state: String, chinese: Bool) -> String {
        let zh = ["active": "当前记录", "archived": "归档行程记录", "retained": "必要保留记录", "erased": "已擦除资料的保留记录"]
        return chinese ? zh[state] ?? state : state
    }
    static func message(_ key: String, chinese: Bool) -> String {
        let zh = ["storageOrSession": "受保护恢复记录或当前会话不可用，请重新验证当前账号。", "cleanupRequired": "私有文件清理失败，未开放新操作。",
            "receiptUnknown": "原擦除回执未知。原请求已保留；只读取原回执，不自动重发或创建新操作。", "fileReady": "所选资料已完整核验并写入本机私有文件。请主动保存或分享。",
            "erased": "服务器所选资料擦除回执已核验。只证明回执列出的范围。", "unavailable": "来源、权限、版本或期限未确认，未记录完成。"]
        let en = ["storageOrSession": "Protected recovery record or current session unavailable. Revalidate the current account.", "cleanupRequired": "Private file cleanup failed; new operations are blocked.",
            "receiptUnknown": "Original erasure receipt unknown. Original bytes remain; read its receipt without automatic resend or a new operation.", "fileReady": "Selected data is fully validated in a private device file. Explicitly save or share it.",
            "erased": "Verified server erasure receipt for only the listed scope.", "unavailable": "Source, authority, version or expiry is unconfirmed. Completion was not recorded."]
        return (chinese ? zh : en)[key] ?? key
    }
    static func field(_ name: String, chinese: Bool) -> String {
        let zh = ["objectId": "所选记录标识", "reminders": "提醒", "watches": "订阅", "dismissals": "已忽略项目", "outbox": "发送队列", "attempts": "发送尝试", "operations": "操作记录", "travelReminders": "行程提醒", "device": "完整设备绑定", "devices": "设备绑定", "fences": "防重放围栏", "pageProgress": "临时页进度", "providerAccepted": "provider 已接受副本", "providerUnknown": "provider 结果未知", "activeGrants": "发送授权", "provider_accepted_copies_not_recallable": "已接受的 provider 副本无法召回", "provider_ack_unknown": "provider 回执未知", "device_delivered_notifications": "设备上已送达通知", "device_local_journals": "本机原通知恢复日志", "device_os_permission": "系统通知权限", "device_push_token_system_copy": "系统持有的推送 token 副本", "external_export_files": "外部已保存导出文件", "backup_restore_target_acceptance": "备份恢复后的目标隔离未验收", "original_trip_and_business_results": "原行程与业务成果保留", "device_bindings": "未选中的设备绑定保留", "trip_reminder_watch_source_rows": "原行程提醒和订阅来源保留", "other_unselected_exit_requests": "其他未选中的处理记录", "selected_trip_notification_rows": "所选行程的全部通知记录", "selected_trip_user_reminder_rows": "所选行程的用户提醒", "selected_device_bindings": "所选设备绑定", "associated_attempt_rows": "关联发送尝试", "associated_outbox_rows": "关联发送队列", "selected_transient_page_progress": "所选临时页进度", "minimal_exit_receipts": "最少擦除回执保留"]
        return chinese ? zh[name] ?? name : name.replacingOccurrences(of: "_", with: " ")
    }
}
