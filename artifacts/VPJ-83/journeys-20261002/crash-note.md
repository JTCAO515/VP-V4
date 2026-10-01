# iOS 17 cross-tab crash and fix

Observed in the initial signed-out maximum-text Journeys UI run on iPhone SE iOS 17.5. Local original report: `~/Library/Logs/DiagnosticReports/VisePanda-2026-10-02-001808.ips`; failed result bundle: `/tmp/vpj83-journeys-ui.xcresult`.

Signal: SIGABRT / NSInternalInconsistencyException. Last exception frames: `UINavigationBar.layoutSubviews` → `UIView layoutSublayersOfLayer` → `CA::Transaction::commit`. Diagnostic reason, excluding process addresses: “Layout requested for visible navigation bar ... when the top item belongs to a different navigation bar ... title='Ask' ... possibly from a client attempt to nest wrapped navigation controllers.”

Trigger: Journeys Open current VP callback used the original shell root entry; the shell's entry UUID recreated that tab's entire NavigationStack while switching tabs. Fix: retain the stack/controller and reset its existing router path instead. Actor scope continues to recreate all tab views on replacement/logout. Final scoped iPhone SE UI checks pass 2/2; no target/provider/device acceptance inferred.
