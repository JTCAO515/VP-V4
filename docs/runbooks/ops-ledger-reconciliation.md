# Read one budget scope without exporting content

The service-only reader remains available to trusted workers. The new `/ops/budget`
page lets a live authorized Ops member read the same metadata through
`GET /api/ops/budget?scopeId=<uuid>` when the existing Ops environment and membership
are enabled. It cannot stop or resume a budget scope.
Confirm the authorized environment and scope through the existing operator process. Do not
put a service key in a browser, mobile app, report, command-line argument or log.

The trusted host supplies its existing bounded RPC client. Example integration (no configured
client or network call is created by this code):

```ts
const result = await readOpsLedgerScope(async (name, params) => {
  const { data, error } = await authorizedServiceClient.rpc(name, params)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error("Operational read unavailable");
  return data;
}, authorizedScopeId);
if (result.kind === "available") {
  const diagnostic = renderOpsLedgerReport(result.snapshot);
  // Display only in the already-authorized operator context.
}
```

1. If unavailable, do not infer empty or healthy. Check the selected scope/environment and
   service execution rights through existing access procedures; never retry with a user JWT
   impersonating the owner or bypass RLS.
2. Read attempt states first. A reserved attempt has not necessarily reached a provider;
   dispatched/pending are not proof of completion. Every provider subtotal must reconcile.
3. Read ledger debit and unresolved hold separately. A pending hold is not free and should
   not be deleted to make a cost report look smaller. Use the budget owner's reconciliation
   procedure and actual provider evidence before settling unknown charges.
4. Compare distinct task IDs with Turn linkage. Missing IDs may be earlier synthetic/provider
   tasks, deleted Turns or absent integration; do not invent user success/failure. Owner mismatch
   is an integrity signal for the existing ledger producer, not permission to inspect another
   owner's body.
5. Compare business outcomes with technical terminals. `partial`, `clarification` and `answered`
   are separate recorded categories. They do not measure answer quality. Hidden or mismatched
   outcomes stay unobserved. Duplicate terminals require investigation in the owning worker;
   this reader never repairs them.
6. Actual bills, semantic quality, model latency, tools, human time and ServiceTask counts remain
   unknown. Do not populate an SLO success badge, invoice total or zero value from this report.

To reproduce without credentials or an existing database, use the opt-in test below. It creates
a unique `--network none` PostgreSQL container with no published ports, applies the full local
migration chain and deletes only that container after tests. It never discovers `.env` or remote
Supabase. The pinned image must already be available; no provider call is made.

```sh
VP_OPS_DB_TEST=1 node --experimental-strip-types --test tests/integration/observability/ops-ledger.test.mjs
```

On a host with the compatible PostgreSQL 17.6.1.167 image instead of 17.6.1.159,
set `VP_OPS_DB_IMAGE=public.ecr.aws/supabase/postgres:17.6.1.167`. The test
still creates one network-isolated disposable container. It now checks the Ops
member gate as well as the service-only reader.

Provider/city/capability kill switches, stop/resume UI, complete metric sources,
remote deployment and full #229 acceptance remain open. A successful local read
does not close those gates.
