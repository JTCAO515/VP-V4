# Native submitted-request process recovery

Synthetic, loopback-only HTTP fixture for
`VisePandaUITests/NativeAskProcessRecoveryUITests`. It is not an Auth, database,
provider, RLS or billing integration test. It does not load credentials or make
outbound requests. The app uses its real Keychain and is terminated/relaunched.

1. Start `python3 tests/fixtures/native-pending/server.py` (owned port 59653).
2. Build the complete native test targets with the available Xcode toolchain and
   ad-hoc Simulator signing, as in `scripts/ios/ci.py`.
3. In a private copy of the generated `.xctestrun`, set
   `VisePandaUITests.EnvironmentVariables.VP_NATIVE_PENDING_UI_TEST` to `1`.
4. Run `xcodebuild test-without-building -xctestrun <copy>` on an owned Simulator,
   with `-only-testing:VisePandaUITests/NativeAskProcessRecoveryUITests` and
   `-parallel-testing-enabled NO`. Keep the `.xcresult` screenshots and outcomes.
5. Stop the fixture and delete the owned Simulator. The tests sign out normally;
   deleting a failed test's owned Simulator also removes its synthetic Keychain.

The English case loses the POST receipt; the Chinese case acknowledges the POST
but hides history across termination. Each requires one POST total and the same
recovered answer. The latter also checks send/new-question remain disabled while
history is absent. Existing generic CI explicitly skips these opt-in scenarios.
Storage failures, notice/mode changes, same-payload retry and owner switching are
covered separately by `NativeAskPersistenceTests`.
