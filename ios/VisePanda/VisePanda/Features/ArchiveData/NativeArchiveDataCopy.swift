import Foundation

enum NativeArchiveDataCopy {
    static func boundary(_ code: String, chinese: Bool) -> String {
        let values: [String: (String, String)] = [
            "archived_trip_id_title_head_confirmation_lifecycle": ("所选归档行程的编号、标题、版本、确认状态及归档状态", "Selected archived Trip ID, title, version, confirmation and archive state"),
            "head_snapshot_safe_days_items": ("当前版本已保存的日期、地点安排、时区与时间窗口", "Stored current-version days, items, time zones and time windows"),
            "all_available_snapshot_versions_titles_timestamps_safe_content": ("全部实际保存的历史版本、标题、时间及相同范围的行程内容", "Every stored historical version, title, timestamp and the same Trip content projection"),
            "selected_trip_lifecycle_operation_receipts": ("直接关联此行程的状态操作回执", "State-operation receipts directly linked to this Trip"),
            "original_archive_terminal_business_state": ("原归档状态继续保留", "Original archived state remains"),
            "confirmed_trip_proposal_history": ("已确认的行程及提议历史继续保留", "Confirmed Trip and Proposal history remains"),
            "original_selected_trip_deletion_receipt": ("原行程删除请求及回执继续管理删除", "Original Trip deletion requests and receipts still govern deletion"),
            "financial_records": ("金融记录保留", "Financial records remain"),
            "operation_fences": ("原操作防重与权限记录保留", "Original operation and authority fences remain"),
            "snapshot_versions_never_stored": ("从未保存的历史版本无法补造", "Historical versions never stored cannot be reconstructed"),
            "fields_outside_original_safe_content_projection": ("原安全投影之外的字段不包含在文件中", "Fields outside the original safe content projection are omitted"),
            "other_domains_use_existing_module_handlers": ("聊天、结果、记忆等其他资料需使用各自模块的出口", "Chats, results, Memory and other data use their respective module exits"),
            "raw_pdf_attachment_device_bytes": ("原始 PDF、附件及本机文件字节不包含在此文件中", "Raw PDFs, attachments and device-file bytes are omitted"),
            "external_orders_payments_copies": ("外部订单、支付与另存副本不处理", "External orders, payments and saved copies are outside this operation"),
            "backup_restore_target_acceptance": ("备份与恢复后的目标环境隔离尚未验收", "Backup and post-restore target isolation remain unverified"),
            "selected_request_all_binding_fields": ("所选出口请求的全部归属、选区、摘要、状态与期限字段", "Every ownership, selection, digest, state and expiry field of selected exit requests"),
            "selected_request_page_progress": ("所选请求的各节分页进度", "Section pagination progress of selected requests"),
            "selected_request_minimal_erasure_receipt": ("所选请求已保存的最小清理回执", "Stored minimal cleanup receipts of selected requests"),
            "selected_transient_page_progress": ("仅清理所选请求的临时分页进度", "Clears only selected requests' transient pagination progress"),
            "nonreplayable_request_owner_session_epoch_scope_selection_source_preview_request_hash_time_fences": ("请求编号、账号、会话、选区、版本摘要及期限围栏保留，旧请求不能重新开始", "Request, account, session, selection, digest and expiry fences remain; old requests cannot restart"),
            "immutable_minimal_erasure_receipt": ("不可修改的最小清理回执保留", "Immutable minimal cleanup receipts remain"),
            "original_session_account_cascade_semantics": ("沿用原会话与账户撤销清理规则", "Original session and account cleanup rules apply"),
            "unselected_requests": ("未选择的请求不处理", "Unselected requests are untouched"),
            "source_trip_data_separate_original_delete_handler": ("原行程资料仍由原行程删除界面处理", "Source Trip data remains governed by the original Trip deletion screen"),
            "external_files_copies": ("已另存或交付的外部文件无法召回", "Saved or delivered external files cannot be recalled")
        ]
        guard let pair = values[code] else { return chinese ? "未识别边界，请刷新。" : "Unrecognized boundary. Refresh." }
        return chinese ? pair.0 : pair.1
    }
    static func state(_ value: String, chinese: Bool) -> String {
        switch value {
        case "archived": chinese ? "已归档" : "Archived"
        case "previewed": chinese ? "已预览" : "Previewed"
        case "exporting": chinese ? "采集中" : "Collecting"
        case "exported": chinese ? "采集完成" : "Collected"
        case "erased": chinese ? "临时进度已清理" : "Transient progress cleared"
        default: chinese ? "不可读取" : "Unavailable"
        }
    }
}
