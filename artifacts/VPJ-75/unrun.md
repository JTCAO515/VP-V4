# VPJ-75 (#359) — explicitly UNRUN

Slice 1 (schema/idempotency data model) is done — see
`359-wiki-schema-slice1-20260914/verification.md`. Everything else in
#359's acceptance is not started:

- **Generation dispatcher RPC.** No `ops_wiki_generate_*` function exists
  yet — `wiki_generation_jobs`/`wiki_page_revisions` can only be written by
  direct SQL right now (used only for this slice's own verification
  inserts, immediately rolled back with `supabase db reset`). No app code
  path writes them.
- **Real bounded LLM worker.** No call to `lib/server/model-gateway/**` or
  any provider has been made for wiki generation. Cost/budget/timeout/
  cancel/resume behavior for an actual worker is entirely unverified.
- **Ops diff review UI.** No page shows a generated draft changeset for
  human review before publish.
- **Statement-level source linking.** `statement_refs` exists as a column
  but nothing populates or validates that every key claim actually links
  to a real EvidenceSpan.
- **Docling/parser integration**, per #288's existing REJECT — not
  attempted this slice, not silently assumed fine.
- **Contradiction/conflict handling** between competing source material —
  no logic exists to surface "these two sources disagree" to a reviewer.
- **expectedVersion conflict rejection on write** — the `version` column
  exists on `wiki_pages`, but no RPC yet implements the
  reject-on-mismatch check (pattern already established in
  `ops_review_workspace_publication_v1`).
- **Prompt-injection resistance** against fixed zh/en adversarial source
  material — no fixture set exists yet.

#359 remains OPEN. This slice does not claim any acceptance bullet as
fully done — only that the underlying data model exists and is verified
sound (including one real bug found and fixed during verification).
