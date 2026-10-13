# Executor definite-dispatch denial regression

Runtime source SHA256: `78a26edcdc434886cdf4d6a15c46b0c2536f7fefdb52b9aec94760b76afd559a`.
Base owner commit: e7d3ac2719656cbb8540aef127293d619c77265f; this patch only changes executor denial accounting.

The executor now releases an original reserved attempt only before any dispatch call,
or after receiving the exact SQL `{kind:"blocked"}` decision with no authorization or
physical send. Missing/unknown acknowledgment is never a release proof. A release
keeps actual_micros NULL; no zero-cost settlement or validated-usage receipt is fabricated.

Actual PG17.6 proof used the exact reviewed QA migration at 16018dd2:
`supabase/migrations/20261013050429_qa_agent_web.sql`, SHA256
`df5565ae49363dc83d4e0db9686653d43dc79cb2b011e4d56e343f45d654afa9`.
The original migrations and reviewed QA producer were installed in a unique owned
container only. Real PostgreSQL RPCs/ledger/work were used; Auth claims and provider
transport/usage are synthetic. This does not establish real target/provider acceptance.

| Scenario | Final original budget row | Actual micros | Provider sends | Next reservation |
| --- | --- | --- | --- | --- |
| Scope closes after reserve; SQL explicitly blocked | released | NULL | 0 | reserved after scope restore |
| Unknown ACK before SQL invocation | reserved | NULL | 0 | exhausted, prior reservation retained |
| Lost ACK after actual SQL dispatch | pending | NULL | 0 | exhausted, prior dispatch retained |
| Transport fails after acknowledged dispatch | pending | NULL | 1 synthetic attempt | exhausted |
| Normal synthetic validated output | settled | 20 synthetic priced micros | 1 | reserved |

Every case made one reserve and one authorization call; no automatic second provider
attempt. The accepted flow completed original text storage after original settlement.
The blocked case created no text_dispatches receipt and restored concurrency capacity.

PASS: actual five-case SQL proof plus original migration replay; 13 affected executor,
worker and original-protocol/context/hosted-flow tests; full repository TypeScript;
source lint (825 files); diff whitespace checks. An additional unit negative confirms
an unrecognized/extra-field denial response does not prove release.

Raw result: `result-86e15414-752.json`. Container
`qa-agent-denial-86e15414-752` used image
`sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f`,
network none, no ports or mounts, exact owner+nonce labels. Cleanup verified its labels,
removed only this container and confirmed inspect ABSENT. Existing resources untouched.

Reproduce from this owner checkout:

```
node --experimental-strip-types artifacts/qa-agent-service/budget-denial-proof/proof.mjs
```

The script refuses an unknown reviewed-migration hash, uses pull=never, and always
records its own result and cleanup. Initial sandbox Docker preflight was permission
denied; the scoped official escalation executed the owned proof successfully.
No product migration, worker installer, UI, target deployment or remote data was changed.
Target provider and independent final-head review/CI remain Main-owned and UNRUN here.
