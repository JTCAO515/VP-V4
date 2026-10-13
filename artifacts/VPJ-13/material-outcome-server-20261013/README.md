# VPV10-START-002 server delivery

Baseline daa7bae44a660381fb3295d0d2afc327ea98d3ba; original four untracked drafts
were preserved and continued. `pins.json` records received drafts, final owned
source hashes and original source hashes checked byte-for-byte against baseline.

Implemented: strict original PDF receipt association; ordinary authenticated adapter;
request-lifetime runtime composition; exact current-head readback, archive/current actor
and selection fences; closed original request bytes; abort/size/history bounds.
Internal contract and remaining shared integration are in the new module WIRE.md.
No original/shared source, SQL, API, measurement union, Core, registry or CI changed.

PASS: 55 new behavior tests (consumer + real SDK with synthetic in-memory signed JWT
and intercepted HTTP); 6 original affected PDF tests; strict affected source/tests
and transitive dependencies typecheck; source policy lint. No skips.
Initial affected typecheck found two readonly assignments in adversarial test setup;
the setup now replaces complete immutable source objects and final typecheck passes.

UNRUN: live Auth/PostgREST/SQL, real protected selection holder, Native/device render,
measurement lifecycle/collection, target deployment, final CI/review/protected merge.
No fixture signature/SDK transport result establishes live source or user presentation.
Main owns actual shared source holder coordination and PR/CI/protected merge.

Local validation reused the existing same project dependency tree read-only because
this worktree has no node_modules. The validation-only loader is portable and uses
VP_MATERIAL_DEPENDENCY_ROOT or current working tree; it is not used in product code.
The recorded typecheck.json contains the absolute local dependency root for this run.
With ordinary installed repository dependencies CI can run these .test.ts directly.

Executed from this WT:

```sh
VP_MATERIAL_DEPENDENCY_ROOT=/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj13-experience-measurement-server-20261012 node --experimental-strip-types --loader ./artifacts/VPJ-13/material-outcome-server-20261013/dependency-loader.mjs --test tests/contract/journey-material-outcome/server/*.test.ts tests/contract/intake/pdf-intake.test.ts tests/contract/pdf-intake/sql.test.mjs
node /Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj13-experience-measurement-server-20261012/node_modules/typescript/bin/tsc -p artifacts/VPJ-13/material-outcome-server-20261013/typecheck.json
node scripts/lint.mjs
```

Rollback is removal of this unintegrated new-path package. Original Trip/PDF behavior
and continuation remain owned by their existing sources. Missing protected selection
and screenshot return unobservable before authentication/network; there is no sink.
