/** J1 owns a complete scoped user command path. This inventory does not enroll
 * the older all-account job/dispatcher or promise erasure of its other modules. */
export const communityDataInventory = {
  scope:'community_module',coverage:'complete_for_community',allAccountExport:'not_enrolled',
  ingress:{native:'/api/community/native/v1',ops:'/api/ops/community',rpc:'community_workspace'},
  commands:{export:'export',delete:'delete',withdraw:'withdraw'},
  ownedRecords:['submissions','authored_review_notes','receipts','audit_metadata','reviewer_qualification','trusted_disclosures'],
  erased:['submission_title','submission_content','benefit_disclosure','place_binding','authored_review_notes','authored_attribution','reviewer_qualification','trusted_disclosures'],
  retained:['operation_fences','submission_tombstones','audit_metadata'],
  excluded:['trip','fact','other_authors_content','original_account_export_jobs'],
  publicReading:false,
} as const;
