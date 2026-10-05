import Foundation

enum NativeMaterialReferenceCopy {
    static func tripState(_ state: String, chinese: Bool) -> String {
        switch state {
        case "active": return chinese ? "有效行程" : "Active Trip"
        case "archived": return chinese ? "已归档行程" : "Archived Trip"
        case "deleted": return chinese ? "已删除行程的保留记录" : "Retained records for a deleted Trip"
        case "retained": return chinese ? "历史关联记录" : "Historical context records"
        default: return chinese ? "行程状态不可得" : "Trip state unavailable"
        }
    }
    static func title(_ scope: NativeMaterialReferenceScope, chinese: Bool) -> String {
        switch scope {
        case .reservations: return chinese ? "订单引用资料" : "Reservation reference data"
        case .pdf: return chinese ? "PDF 导入资料" : "PDF intake data"
        case .progress: return chinese ? "资料处理记录" : "Data operation records"
        }
    }
    static func state(_ state: String, chinese: Bool) -> String {
        let values: [String: (String, String)] = ["active": ("可读取", "Readable"), "pending": ("待原行程确认", "Awaiting original Trip confirmation"),
            "confirmed": ("已由原行程确认", "Confirmed by the original Trip"), "rejected": ("原提案已失效", "Original proposal rejected"),
            "cancelled": ("导入已取消", "Intake cancelled"), "expired": ("临时材料已过期", "Temporary material expired"),
            "erased": ("敏感临时资料已擦除", "Sensitive temporary data erased"), "retained": ("仅保留必要记录", "Required metadata retained"),
            "unknown": ("原状态未知", "Original state unknown"), "previewed": ("已预览", "Previewed"),
            "exporting": ("导出处理中", "Export in progress"), "exported": ("导出处理已完成", "Export operation completed")]
        guard let value = values[state] else { return chinese ? "状态不可用" : "State unavailable" }
        return chinese ? value.0 : value.1
    }
    static func field(_ name: String, chinese: Bool) -> String {
        let values: [String: (String, String)] = ["kind": ("类型", "Kind"), "supplier": ("供应商", "Supplier"),
            "externalReference": ("外部订单引用", "External reservation reference"), "title": ("名称", "Title"),
            "startsAt": ("开始时间", "Starts"), "endsAt": ("结束时间", "Ends"), "timeZone": ("时区", "Time zone"),
            "address": ("地址", "Address"), "terms": ("条款", "Terms"), "status": ("用户记录的状态", "User recorded status"),
            "date": ("日期", "Date"), "amount": ("用户校正的金额文字", "User corrected amount text"),
            "evidenceTier": ("用户自行提供", "User reported"), "sourceQualification": ("来源尚未核实", "Source unverified"),
            "locator": ("原文位置", "Original locator"), "revision": ("记录版本", "Record revision"),
            "cancelled": ("临时导入已取消", "Temporary intake cancelled"), "originalState": ("原导入状态", "Original intake state"),
            "state": ("处理状态", "Operation state"), "pages": ("已读取页数", "Pages read"), "rows": ("已读取记录数", "Records read"),
            "progressErased": ("临时读取进度已擦除", "Temporary read progress erased")]
        if name.hasSuffix(".locator") { return chinese ? "页码与行号" : "Page and line" }
        guard let value = values[name] else { return chinese ? "资料字段" : "Data field" }
        return chinese ? value.0 : value.1
    }
    static func boundary(_ name: String, chinese: Bool) -> String {
        let values: [String: (String, String)] = [
            "current_reference": ("当前订单引用", "Current reservation reference"), "reference_events": ("引用版本记录", "Reference revision records"),
            "reference_operation_metadata": ("引用操作元数据", "Reference operation metadata"),
            "selected_current_reference": ("所选当前订单引用", "Selected current reservation references"),
            "selected_reference_events": ("所选引用的版本记录", "Selected reference revision records"),
            "selected_reference_operations": ("所选引用的操作记录", "Selected reference operations"),
            "nonreplayable_object_operation_fences": ("阻止已擦除引用与操作重放的必要记录", "Required records preventing erased reference and operation replay"),
            "original_trip_content": ("原行程内容", "Original Trip content"), "financial_records": ("独立财务记录", "Separate financial records"),
            "original_local_material_bytes": ("本机原材料文件", "Original device material files"), "external_order_copies": ("外部订单副本", "External reservation copies"),
            "external_order_cancel_refund": ("外部取消与退款", "External cancellation and refunds"), "provider_verification": ("供应商核实", "Provider verification"),
            "live_corrected_fields": ("仍有效的校正字段", "Live corrected fields"), "original_locator_hashes": ("原页行位置与摘要", "Original page/line locators and hashes"),
            "minimal_pdf_operation_metadata": ("必要的 PDF 操作元数据", "Minimal PDF operation metadata"),
            "temporary_input_bytes": ("服务器临时导入请求", "Temporary server intake request bytes"),
            "temporary_command_fields": ("服务器临时校正字段", "Temporary server corrected fields"),
            "unapplied_pdf_proposal_patch": ("尚未确认的 PDF 候选改动", "Unapplied PDF proposal patches"),
            "pdf_operation_replay_fences": ("阻止 PDF 操作重放的必要记录", "Required PDF replay fences"),
            "applied_trip_proposal_history": ("已确认行程的原历史", "Original confirmed Trip history"), "confirmation_event": ("原行程确认回执", "Original Trip confirmation receipt"),
            "original_pdf_bytes": ("原 PDF 文件", "Original PDF files"), "full_page_text": ("完整页面正文", "Full page text"),
            "device_appgroup_copies": ("本机与共享收件箱副本", "Device and shared inbox copies"), "external_files": ("外部文件与已保存副本", "External files and saved copies"),
            "scheduled_target_retention": ("目标环境定期清理尚未验收", "Target scheduled retention remains unverified"),
            "selected_exit_request_metadata": ("所选资料处理请求记录", "Selected data operation request metadata"),
            "selected_exit_page_progress": ("所选读取进度", "Selected read progress"), "retained_exit_fence_metadata": ("必要的处理围栏记录", "Required operation fence metadata"),
            "selected_transient_exit_page_progress": ("所选临时读取进度", "Selected temporary read progress"),
            "nonreplayable_request_object_operation_fences": ("阻止请求、对象及操作重放的必要记录", "Required request, object and operation replay fences"),
            "selected_object_ids": ("所选对象标识", "Selected object identifiers"), "request_source_preview_hashes": ("请求、来源与预览摘要", "Request, source and preview hashes"),
            "minimal_erasure_receipt": ("必要的擦除回执", "Minimal erasure receipt"), "other_unselected_exit_requests": ("未选择的其他处理请求", "Other unselected operation requests")]
        guard let value = values[name] else { return chinese ? "未声明范围" : "Undeclared scope" }
        return chinese ? value.0 : value.1
    }
    static func message(_ value: String, chinese: Bool) -> String {
        let values: [String: (String, String)] = ["receiptUnknown": ("回执尚未确认。只读取原操作回执；不会创建新的擦除操作。", "Receipt is unknown. Read the original operation receipt; no new erasure is created."),
            "fileReady": ("所选范围的私有导出文件已核验。系统保存或外部分享的最终结果仍由你确认。", "The selected scope’s private export file is verified. Confirm the final system save or external handoff yourself."),
            "erased": ("回执已证明所选服务器资料范围擦除。原行程与外部订单保持其原状态。", "The receipt proves erasure of the selected server data scope. Original Trips and external reservations retain their original state."),
            "unavailable": ("当前权限、来源、版本或期限无法核实。刷新所选记录后重新预览。", "Current authority, source, version or expiry is unverified. Refresh selected records and review again."),
            "cleanupRequired": ("本机私有文件清理未完成。完成清理前不会开始新操作。", "Private device file cleanup is incomplete. Complete cleanup before starting another operation."),
            "storageOrSession": ("受保护恢复记录或当前会话不可用。尚未执行新的操作。", "The protected recovery record or current session is unavailable. No new operation was executed.")]
        guard let result = values[value] else { return chinese ? "操作尚未核实" : "Operation unverified" }
        return chinese ? result.0 : result.1
    }
}
