# Unrun acceptance

- iOS 17.5 native authentication runtime: UNRUN; current identity runtime proof is on iOS 26.5 only.
- Physical device, VoiceOver and production Keychain/signing lifecycle: UNRUN; Simulator/ad-hoc evidence is not device acceptance.
- Push registration/delivery/account binding: UNRUN; no push consumer is activated or simulated as a completed integration.
- Staging/production/real-user identity, remote migration, provider/payment/Store actions: UNRUN and outside this local authorization. Native route defaults remain closed.
- Native Trip write and real C2 consumers: not activated. Synthetic Trip/Turn records only exercise existing database authorization/replay paths.
- Ten budget-specific database cases in the broad integration suite: UNRUN because their separate environments were not configured; no budget fixture is represented as this identity acceptance.
- Aggregate #191 closeout: incomplete. The local identity result does not close external/runtime upstream or device/consumer acceptance.
