# Native CI runtime isolation

The signed CI attempt completed all account-state cases but failed with XCTest accessibilityAudit Code-56 (audit service timeout). Its one same-HEAD rerun passed the maximum-size case, then failed to launch the app and obtain a background assertion in two later methods. Those failures occurred before those screen audits. The unchanged maximum-size method passed locally; neither assertions nor audit types were weakened.

The runner now completes unsigned build and ad-hoc build-for-testing before creating one owned temporary iPhone17Pro/iOS26.5 Simulator. It verifies the complete signature and waits for bootstatus before running the whole scheme without building. Finally it shuts down/deletes only the created Simulator; reference devices are read only. This is a controlled isolation/readiness correction, not a claim that the exact host-service root cause is proven.

The first local pipeline failed before tests because UUID validation also lowercased the destination, while Xcode matched the original uppercase spelling. Its owned Simulator cleanup succeeded. The corrected runner validates but preserves the returned identifier.

The complete corrected local runner passed:21 tests passed,0 failed,8 explicit-API-environment cases skipped. The skips remain UNRUN in this pipeline; separate earlier real identity/Trip evidence is unchanged. All build, signature, boot, test and cleanup commands exited0. Raw environment metadata records2586 because the run started with the one case-preservation correction uncommitted; dc601ed contains the identical executed script, whose SHA256 is recorded in results.json. No production Swift or test assertion changed.

Failures remain at Native run34466126997 attempts1/2 and the private local pr301-ci-isolated-run logs. Full corrected xcresults are in the private local pr301-ci-isolated-final cache. Commands/environment/results here contain no credentials. Final exact-HEAD independent review and remote CI are required separately; this local pass is not a remote pass, physical acceptance or closure of#188/#191/#192.
