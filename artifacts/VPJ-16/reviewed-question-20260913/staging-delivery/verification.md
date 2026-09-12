# PR341 scoped question: Staging and delivery

PR341 merged as `e132baf0c17be3c67bed101bb4c0c39f1e00b36d` on2026-09-12T18:51:20Z. Tested PR head: `fc3f15d7ecf13fa509b547ab0a6b4d00ea075309`.

## Observed environment

Dedicated native Simulator build connects to Preview `dpl_8L37McQt7kGmFnmjUtqGaJcTErzn`, host `vp-v4-nbtf66qss-jtcao515s-projects.vercel.app`, exact tested head. Staging database `dzqdzetcctkhbrhlxxgn` received only additive migration40 after a fresh encrypted backup and complete isolated restore. All77 pre-existing tables/columns/data and248 prior schema entries matched before/after migration. Existing6 accounts and3 Trips retained. RPC authenticated-only; read/Ops default off, no active Ops member. Backup remains encrypted in the private Staging backup store; secrets and raw source/editor material are excluded here.

## Real native result

- Ordinary existing controlled-account login succeeded through native credentials. Chinese and English question returned both current published railway facts `c9e670d6-89cc-4b11-b8e6-f9a6b10dd530` and `6638fa9a-6476-4f66-918a-40af67cc66fc`; all displayed conditions/exclusions retained. This is real Staging publication consumption, not a loopback fixture.
- English source disclosure showed China Railway12306 and the Ticketing Q2/E-tickets locator. Both language answers and expanded English sources have screenshots and accessibility records. The source website was not opened and the described physical train service was not exercised.
- Read switch disabled at18:48:38.384Z. Observation at18:49:08.181667Z showed unavailable, no fact rows and no knowledge-gap text. Earlier observation still inside the30-second snapshot window retained rows. This proves the bounded observed refresh outcome, not instantaneous revocation.
- Ordinary logout completed; question showed sign-in required and no facts. Initial automation snapshots raced navigation/logout completion, and two automation tap attempts used ambiguous ID/wrong coordinate flags; subsequent observed-state targeting succeeded. These were automation attempts, not waived product tests.
- General AI text Ask was unavailable in this dedicated question Preview; no model, ServiceTask or historical answer was tested or created. No full#206 acceptance is claimed.

## Cleanup and CI

Read/Ops disabled, active Ops members0, statements12, published11/revoked1, users6/Trips3. Only this Preview host was temporarily allowed (WAF12→13) then removed (14); cleanup exited0. Owned Simulator `BC1F6687-C868-41AE-87F5-4CF1E4ED2543` shut down and deleted. Local source fixture and disposable Supabase had already been stopped.

Required CI: Quality34711647844 PASS3m39s; Budget34711647850 PASS2m37s; Native34711647883 PASS11m8s; Vercel Preview PASS. Native default CI opt-in API/knowledge checks are explicitly skipped; the separate local8-unit/4-UI and final English1-UI evidence remains in the parent verification. Raw CI tests are retained without treating skips as execution.

Main production attempt `dpl_AtmHzmkTs6sncqdXCga4KFqbTq3g` was CANCELED by the existing guard. All five production aliases remained on `dpl_AEcvPbiv2tcX5k8uGRtmBp3PPZPv`; shared staging remained `dpl_5eBh1Exfo4W8rXEh1T3AazJnUjXW`. No production release.

Physical device, manual VoiceOver/maximum text, generalized natural-language knowledge grounding, ServiceTask persistence/history and broader S1–S6 acceptance remain incomplete. See parent verification for local failure/fix history and exact tested scope.
