# Ops HTTP CI preflight diagnostic

Exact failed head84d47bfd6d7d6978eb841953a9e438bbdaf760de; run37318660143/job111791946400. Completed job log obtained through the normal GitHub job-log API while sibling lanes were still running. Original failure excerpt is preserved in ops-http-84d47bfd-failure.log.gz.

Observed: ops-local-review8 PASS, knowledge-publication0 tests (preflight exit1), knowledge-private-source-34-to-350 tests (preflight exit1), service-case-access6 PASS. Both failed at tests/integration/ops/run-local.mjs:15 with only “Disposable test port unavailable”. No API request/status/body, source read or SQL assertion ran in those two steps. This is not evidence of a Guide core failure or Brief clock failure; #218 development closure remains distinct from CI engineering.

Actual registry runs the3 Ops steps sequentially with the same unmodified default base56900 (offsets20,21,22,23,24,27,29,31). The preceding test waits for its owned Next CLI child exit; wrapper waits for Supabase stop and returns0 when the step passes. Neither establishes release of every socket. Original failed log did not record exact blocked port, error code, kernel state or process ownership. Residual listener vs ephemeral connection/TIME_WAIT vs another source is UNKNOWN; no old-run attribution is invented.

Main approved only diagnostic delta in Ops runner: preserve base/offsets/bind/failure condition; record exact port+Node error.code and reuse existing nativeHTTPPortObservation (safe port-scoped Linux TCP state/ephemeral range, no PID/command line/remote address/credentials). No automatic port switch, retry, process kill, global runner change or relaxed gate.

Actual affected negative: node --test tests/contract/ops/port-preflight.test.mjs ->1 PASS,0 skip. The fixture owns the original first default port56920, spawns the real runner, observes exit1/EADDRINUSE with exact diagnostic keys/port, empty stdout and the existing socket still listening. Host macOS reports kernel observation unavailable; no Linux-state observation is claimed locally. The test closes only its own fixture socket. Syntax check and diff check PASS.

Fresh main4f450bd6 was normally merged into local8916983f before this diagnostic change. Next normal final-head CI must use the new diagnostic to establish any remaining exact socket cause. No blind rerun of84d47bfd was requested. Session/PBX/Guide runtime are unchanged, and the #235 released hunk remains available.
