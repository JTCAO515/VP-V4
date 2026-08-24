# AI-10 unrun checks

- Supabase RPC/CAS/RLS, reload and fault-injection integration are not run: local database paths are not configured.
- The current `InMemoryTripWorkspace` is a deterministic fixture adapter, not persistence evidence.
- L5-L7 are unrun: no UI, deployment, provider, or production behavior changes.
