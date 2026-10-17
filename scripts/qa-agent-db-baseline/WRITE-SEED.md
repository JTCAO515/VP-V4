# Native write fixture input for independent service consumer

Use a new owned `Fixture` from this fixed commit; `start/sql/close` remain the c66
interface. Apply separate platform.sql once to the fresh DB, then baseline.sql.
The image ID and isolation guards are fixed in run.py. There is no target/DSN flag.
Do not call contracts.exercise as a seed: it deliberately completes, revokes and
cancels to prove negatives. Its explicit SQL is the source-owned seed reference.

Minimum setup before API calls:

1. Fixture admin creates two synthetic auth.users + recent auth.sessions rows.
2. service_role invokes original native_prepare_v2(owner,session,attempt), then each
   ordinary authenticated actor invokes native_session_v2('login',attempt). Use the
   returned epoch, not an echoed claim. Real GoTrue/JWT verification remains UNRUN.
3. Fixture admin inserts immutable text_policies with all fields shown in
   contracts.py: synthetic recipient/notices/regions/terms, context_mode
   qa_session_history_v1, retention retain_after_hide_v1, current effective time,
   one-hour expiry/recheck, notice hash 64 'a'. Both actors explicitly accept via
   qa_native_session_v1('qa_accept_policy_v1',epoch,payload). No Turn or answer seed.
4. For worker SQL tests only, fixture admin enables the local disabled-first
   hosted_worker_control and creates the model scope/provider-limit rows. No real
   worker process, provider call or external credential is started.

Exact producer tuple:

- provider qwen; model qwen3.7-plus-2026-05-26 (current PROTOCOL_MODELS source).
- endpoint https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions,
  stored as metadata only; no network invocation.
- priceVersion synthetic-price; currency CNY; scope ID
  80000000-0000-4000-8000-000000000099; owner/policy IDs are constants A/P in contracts.py.
- scope limit/task limit1000 micros, attempt limit10, concurrency5;
  provider limit1000, per-attempt100; reserve100, synthetic validated usage7.
- A consumer that changes its synthetic budget size must seed sufficient matching
  limits; it must not alter application routing or call a real provider.

API admission is through unchanged qa_native_session_v1 + qa_submit_message_v1.
The worker reserve call uses the original Turn ID: the existing wrapper binds it
to canonical ServiceTask ID before ledger mutation. Ready matching occurs before
LIMIT; owner/policy/scope/notice/model/price/endpoint must agree. Completion requires
real SQL dispatch and settled synthetic usage; no fixture-seeded answer is used.
Unknown dispatch uses pending with null actual cost, cannot release, cannot claim
again, and retains original text/request/Task. Cancellation does not settle money.

Named parameters and DTOs remain in service-ports.json pinned to648f0224. All21
catalog entrypoints are installed, but this is Native QA scope, not whole-app or
Browser auxiliary-relation acceptance. Out-of-scope product writers are not exposed;
private dependency anchors start empty. Unexpected out-of-scope calls fail
technically instead of returning success stubs. Source ledger/table introspection
in contracts.py is fixture-only and is not a new public application RPC.
