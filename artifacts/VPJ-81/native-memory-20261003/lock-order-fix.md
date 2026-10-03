# #631 pre-merge Memory/worker lock order repair

Main delegated 2026-10-03. native_memory_command_v1 now locks actual actor auth.users KEY SHARE NOWAIT before guard_mobile_rpc_v2/native_session_v2 account locks; removes the later auth.users FOR UPDATE upgrade. Existing Memory RPCs only touch owner Memory/consent/receipts and guard account, and owner FK checks use compatible KEY SHARE; no old domain migration/RPC/permission/CAS change.

PASS actual current checkout PostgreSQL 5/5, 0 skip. Two bounded psql sessions explicitly produce the risky intersection: administrator fixture A holds account first (legacy/in-flight preload), B holds auth KEY SHARE and waits account, A invokes the real ordinary authenticated Memory command with the new prefix. The real pg_stat_activity wait was observed; both sessions commit without deadlock or partial write, exactly one immutable command receipt and exact retry reused. This is local Unix-socket database lock evidence, not Native device or deployed signed collector evidence. Existing four Memory cases pass unchanged in the same affected file; disposable container removed.

Main/native integrator adopts this delta onto #631; #562 remains Closed. No target migration/deployment or registry edits. Before merge, 130 is an un-applied new migration being corrected in its owning development branch; deployed migrations remain unchanged.
