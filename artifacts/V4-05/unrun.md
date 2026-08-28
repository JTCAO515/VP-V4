# V4-05 unrun checks and external-source boundary

## Unrun external source-rights verification

- An anonymous Exa search request was rate-limited (HTTP 429).
- An anonymous Jina Reader request for the TP-RAG arXiv record was rejected (HTTP 401).
- No API key, cookie, account, credential or alternative scraper was requested or used.

These failed attempts are not evidence of a source licence, corpus quality or provider status. This
Issue therefore uses no external corpus and rejects runtime adoption.

## Not applicable to this research-only delivery

No browser, local Supabase, provider, migration, deployment, production, account or runtime
integration check is applicable: the change adds only documentation and a deterministic synthetic
evaluation. Required runnable checks are recorded in `commands.jsonl`.

## Tooling substitution

`jq empty docs/handoff.json` is required by the Issue contract but `jq.exe` is not installed in this
workspace. Its attempted command is recorded with exit code 1. `node -e` successfully parsed the
same JSON file as a read-only syntax check; this is a narrow substitution, not a claim that `jq`
ran.

## Rollback

Revert this Issue's documentation and synthetic evaluation. There is no runtime state, data,
schema, provider integration or cache to clean up.
