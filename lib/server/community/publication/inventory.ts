/** Complete scoped handlers; unified account dispatcher has not enrolled this module. */
export const communityPublicationInventory={
  scope:'community_publication_module',coverage:'complete_for_community_publication',allAccountExport:'not_enrolled',allAccountDelete:'not_enrolled',
  ingress:{native:'/api/community/publication/native/v1',ops:'/api/ops/community/publication',rpc:'community_workspace',protocol:'community-publication-j3j4/1'},
  commands:{export:'export',delete:'delete'},
  owned:['own_publication_metadata','own_preview_consent','own_text_rights_declaration','authored_rights_review_notes','authored_attribution','own_qualification','saved_experience_references','operation_fences','audit_metadata'],
  erased:['own_preview_consent','own_text_rights_declaration','authored_rights_review_notes','authored_attribution','own_qualification','saved_experience_links'],
  exported:['own_publications_without_source_body','own_saved_reference_metadata_without_experience_body','own_authored_rights_reviews_without_foreign_identity','own_qualification','own_digest_receipts','own_action_audit'],
  retained:['operation_fences','publication_tombstones','reference_tombstones','audit_metadata'],
  excluded:['foreign_submission_body','foreign_rights_review_notes','original_j1_data_exit','original_j2_data_exit','trip','fact','unified_account_jobs'],
  audience:'controlled_registered',externalAudienceEnabled:false,retrievalEligible:false,
} as const;
