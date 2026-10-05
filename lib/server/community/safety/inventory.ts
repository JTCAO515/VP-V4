/** Scoped actor metadata only. This module never claims unified account exit. */
export const communitySafetyInventory={
  scope:'community_safety_module',coverage:'complete_for_community_safety',allAccountExport:'not_enrolled',allAccountDelete:'not_enrolled',
  ingress:{native:'/api/community/safety/native/v1',ops:'/api/ops/community/safety',rpc:'community_workspace',protocol:'community-safety-j2/1'},
  commands:{export:'export',delete:'delete'},
  owned:['own_report_details','own_appeal_statements','own_blocks','authored_moderation_notes','authored_attribution','own_qualification','controlled_reader_grants','operation_fences','audit_metadata'],
  erased:['own_report_details','own_appeal_statements','own_block_target_links','authored_moderation_notes','authored_attribution','own_qualification','controlled_reader_grants'],
  exported:['own_reports','own_author_dispositions','own_appeals','own_blocks','own_reader_grant_metadata_without_content','own_authored_decisions_without_foreign_details','own_digest_receipts','own_authored_action_audit','own_qualification'],
  retained:['operation_fences','record_tombstones','audit_metadata'],
  excluded:['foreign_report_details','foreign_appeal_statements','foreign_submission_body','original_j1_data_exit','trip','fact','unified_account_jobs','public_explore_search_cache'],
  publicReading:false,
} as const;
