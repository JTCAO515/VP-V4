import { NOTIFICATION_MODULES } from '../notification-data/coverage.ts';
import { COVERAGE_PROGRESS_MODULE } from '../coverage-progress/coverage.ts';
/** ALL1 denominator. A registered scoped handler is not all-account completion. */
export { COVERAGE_PROGRESS_CATALOG_VERSION as CATALOG_VERSION } from '../coverage-progress/coverage.ts';
export type Location = 'server' | 'device' | 'external';
export type Module = Readonly<{
  id: string; location: Location; version: string; scope: string;
  exportHandler: string | null; deleteHandler: string | null;
  selection: 'owner' | 'trip' | 'memory_plan' | 'case' | 'guide_reference' | 'material_records' | 'notification_records' | 'coverage_records' | 'device_files' | 'none';
  capacity: string; retention: readonly string[]; missing: readonly string[];
}>;
const server = (id: string, version: string, scope: string, exportHandler: string | null, deleteHandler: string | null,
  selection: Module['selection'], capacity: string, retention: string[], missing: string[] = []): Module =>
  ({ id, location: 'server', version, scope, exportHandler, deleteHandler, selection, capacity, retention, missing });
const core = (id: string) => server(id, 'core-export-d2/1', 'core-export-d2/1', 'core', null, 'owner',
  '100 rows/page; 1000 pages/module; 8MiB artifact; original protected download/expiry',
  ['original_module_retention', 'external_copies_not_recallable'], ['scoped_delete_not_registered']);
export const MODULE_CATALOG: readonly Module[] = [
  server('trip', 'trip-core-v1', 'trip-core-v1', 'core', 'trip', 'trip', 'one explicitly selected Trip; async receipt; optional original linked-chat plan',
    ['financial_records', 'provider_erasure_unknown', 'backup_erasure_unverified']),
  core('conversations'), core('results'), core('profile'),
  server('memory', 'memory-bulk-delete-d4/1', 'memory-bulk-delete-d4/1', 'core', 'memory', 'memory_plan',
    '100 selected memories; original preview/CAS/selection required', ['original_chat_input', 'trip_intent', 'financial_records']),
  core('turn'), core('user_artifact'),
  server('brief', 'traveler-brief-data/1', 'traveler-brief-data/1', 'brief', 'brief', 'case',
    'owner export: 10000 rows/512KiB, double sourceDigest read/30s expiry; delete: selected case/recipient/grant/Brief revision', ['operation_fences', 'minimal_audit_metadata']),
  server('entitlements', 'core-export-d2/1', 'core-export-d2/1', 'core', null, 'owner', 'original core lease/pages/artifact',
    ['minimal_financial_ledger', 'store_transactions'], ['financial_delete_not_supported']),
  server('case', 'service-case-data/1', 'service-case-data/1', 'case', 'case', 'case', 'owner export: 10000 rows/512KiB, double sourceDigest read/30s expiry; delete: selected case/current grant revision',
    ['operation_fences', 'minimal_audit_metadata', 'external_recipient_copies']),
  server('ugc', 'community-j1/1', 'community_module', 'ugc', 'ugc', 'owner', '100 per retained array; 1MB response; overflow fails',
    ['operation_fences', 'submission_tombstones', 'audit_metadata']),
  server('safety', 'community-safety-j2/1', 'community_safety_module', 'safety', 'safety', 'owner', '100 per retained array; 1MB response; overflow fails',
    ['operation_fences', 'record_tombstones', 'audit_metadata']),
  server('publication', 'community-publication-j3j4/1', 'community_publication_module', 'publication', 'publication', 'owner',
    '100 per retained array; 1MB response; controlled registered audience', ['operation_fences', 'publication_tombstones', 'reference_tombstones', 'audit_metadata']),
  ...NOTIFICATION_MODULES,
  server('lifecycle', 'coverage-module-export/1', 'trip-lifecycle-metadata/1', 'lifecycle', null, 'owner', '50/page; 10000 rows/section; 1MB whole wrapper; fixed30s current source/proof; metadata only',
    ['operation_fences'], ['delete_uses_selected_trip', 'trip_bodies_in_separate_core_export']),
  COVERAGE_PROGRESS_MODULE,
  server('guide', 'guide_selection_metadata/1', 'guide_selection_metadata', 'guide', 'guide', 'guide_reference', '100+sentinel records and bindings; selection only',
    ['nonreplayable_markers', 'original_grounded_turns_separate']),
  server('order_references', 'material-reference-data/1', 'reservation-reference-data/1', 'materials', 'materials', 'material_records',
    '1..20 explicitly selected owner references in one Trip; 5/page; 4 pages; source/CAS/proof; fixed30s; 1MB; per-reference history100+sentinel',
    ['nonreplayable_reference_operation_fences', 'original_trip_content', 'financial_records'],
    ['original_local_material_bytes', 'external_order_copies', 'external_order_cancel_refund', 'provider_verification']),
  server('pdf_intake', 'material-reference-data/1', 'pdf-intake-data/1', 'materials', 'materials', 'material_records',
    '1..20 explicitly selected owner PDF operations in one Trip; 5/page; 4 pages; source/CAS/proof; fixed30s and original material TTL; 1MB',
    ['pdf_operation_replay_fences', 'applied_trip_proposal_history', 'confirmation_event', 'financial_records'],
    ['original_pdf_bytes', 'full_page_text', 'device_appgroup_copies', 'external_files', 'scheduled_target_retention']),
  server('material_exit_progress', 'material-reference-data/1', 'material-exit-progress/1', 'materials', 'materials', 'material_records',
    '1..20 explicitly selected owner exit requests in one Trip; own minimal fence inventory; source/CAS/proof; selected transient progress erasure',
    ['nonreplayable_request_object_operation_fences', 'selected_object_ids', 'request_source_preview_hashes', 'minimal_erasure_receipt'],
    ['other_unselected_exit_requests']),
  server('case_attachments', 'unavailable/1', 'case_attachments', null, null, 'owner', 'existing bundles explicitly declare attachments unavailable',
    ['unknown'], ['attachment_handler_unavailable']),
  server('archive', 'trip-lifecycle-export/2', 'archived_trip', null, 'trip', 'trip', 'selected archived Trip; lifecycle lease not enrolled',
    ['operation_fences'], ['export_lease_not_enrolled']),
  ...['materials', 'app_group', 'local_share', 'guide_cache', 'offline', 'local_journals'].map((id): Module => ({
    id, location: 'device', version: 'device-scoped/1', scope: id, exportHandler: null, deleteHandler: null,
    selection: 'device_files', capacity: 'original owner/endpoint/epoch/TTL selected device consumer',
    retention: ['external_copies_not_recallable'], missing: ['device_receipt_required'],
  })),
  ...['provider', 'backup', 'external_copies', 'financial_records'].map((id): Module => ({
    id, location: 'external', version: 'boundary/1', scope: id, exportHandler: null, deleteHandler: null,
    selection: 'none', capacity: 'unknown', retention: [id === 'financial_records' ? 'minimal_legal_financial_fields' : 'unknown'],
    missing: [id === 'external_copies' ? 'not_remotely_recallable' : 'external_runtime_unverified'],
  })),
];
export const moduleById = (id: string) => MODULE_CATALOG.find(module => module.id === id);
