# AI-51 unrun checks

- Magic-link delivery/callback browser E2E is not run: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are intentionally not configured in this worktree or deployment, and the hosted project's allowed Redirect URLs/custom SMTP have not been configured for beta use.
- Remote owner/other-user Route Handler proof is not run: it requires the same public configuration plus a real authenticated browser session. Existing AI-14 remote RLS evidence validates the database actor boundary only, not this new HTTP adapter.
- 1280×800 and 390×844 browser QA is not applicable to this API/session-boundary slice; AI-13 owns the Canvas UI evidence after this dependency lands.
- No production email, public account invitation, or deployment claim is made by this slice.
