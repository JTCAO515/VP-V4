# Real UI orchestration Spec P2: failure priority before attachments

Original source0f1831ea/proof08106049 is preserved. Fixed source **91128dd01c802013b6f277f47a5c2aa2bf381359**, same dedicated acceptance-driver branch. Only real_ui.py and its own test_real_ui.py changed. UI source, shared PBX/Root/Session/transport/journals, default permissions and exact scope gates remain byte-unchanged.

The prior direct verify_observation failure test missed the run() orchestration order. run() fetched summary, then exported/found the attachment before checking actual failedTests or nonzero xcodebuild exit. A known failure with missing attachment/export failure/crash could therefore be downgraded to UNRUN by the outer driver.

Actual RED: pure mocked full run() path,12 methods with3 failing methods. Known summary failure plus missing attachment, known failure plus export error, and nonzero exit with passing summary plus missing attachment did not produce UIFailed. This is executed script-state evidence with synthetic commands/results, not a real App/runtime failure reproduction.

Fix:

1. A shared pure require_pass_summary first checks authoritative integer failedTests>0 → UIFailed, then nonzero process exit → UIFailed, then exactly1total/1passed/0failed/0skipped; missing/notrun/skip without known failure remains UIUnavailable/UNRUN.
2. run() applies this immediately after reading summary, before export/find_attachment. Known failures never attempt optional attachment export. If summary reading itself fails, an already nonzero process exit is preserved as FAIL; zero exit with no known failure remains UNRUN.
3. verify_observation also starts with the same summary rule. PASS still requires the exact case summary AND one unique matching attachment with the original strict source/run/actor/request/Session/content/provenance gates. No metadata/scope JSON can promote an unexecuted case.

GREEN: final **26 finite Python tests,0fail**, all mock/local metadata/plist/driver paths. Seven added full-orchestration cases cover the requested five classes plus unreadable-summary positive/negative: summaryfail+noattachment; summaryfail+exporterror; nonzero exit+contradictory pass summary; nonzero exit+unreadable summary; zero exit+unreadable summary; no known fail+missing attachment; valid single case+single observation. The failure cases assert no export/no attachment read after known failure. Actual subprocess/command/plist/attachment adapters are mocked; only new private temporary test log directories are used. No real xcodebuild, simctl, App, GoTrue, consent, data/model/provider, fees or new resource action was run.

The existing19 finite tests remain included; no127/129 or other old App matrix was rerun. Existing iOS17 Swift6 source typecheck and synthetic process proofs are reused because those sources are byte-unchanged. Diff whitespace/allowed paths PASS. Logs in orchestration-p2-red.txt and orchestration-p2-green.txt are explicitly synthetic test output; SHA pins bind before/after source.

Remaining integration is unchanged: the sole shared owner registers one new opt-in UI test in PBX using the already-supplied exact candidate, prepares prebuilt products and an exclusive installed QA resource. The raw-body observer hooks remain optional to the primary UI flow. Actual canary/ordinary Auth/provider/target/UI/device is UNRUN. This fix requests no real permission and does not imply authorization from the prior timing question.

Owner estimate: no remaining implementation item in this P2 after fixed-source delivery; only fixed-head review/integration remains outside this owner's execution lease. There is no measured hour basis for PBX/prebuilt/resource startup or actual canary, so that duration and an online date are UNKNOWN. Next useful verification is the shared integrator's registered single-case default skip/startup check without real Auth/fees, then a separately approved exact canary. Source stable handed off before evidence closeout; final STOP with no in-flight/planned/successor work.
