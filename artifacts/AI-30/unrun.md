# AI-30 unrun checks

- No signed URL, TUS upload, Storage bucket, malware scanner, EXIF decoder, provider Files API,
  object deletion, provider deletion, or deletion worker is configured or called.
- No local Supabase runtime exists. The complete owner/other-owner RLS and durable deletion receipt
  matrix remains unrun; the integration and security suites record their existing runtime skips.
- C3 raw media remains denied by the accepted policy baseline. No C3 upload/persistence/provider
  exception, backup, preview, production, account, credential, or media sample was created.

The implementation is a pure pre-adapter denial boundary. Without a server-verified,
owner-bound actor/PolicyReceipt/provider-file receipt it returns only `media_unavailable`; it never
receives media bytes, emits a signed URL, or produces an executable deletion intent. Rollback is a
Git revert with no durable state to clean up.
