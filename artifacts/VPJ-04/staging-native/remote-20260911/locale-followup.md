# Same-Trip notice locale correction

The remote f5db769 browser run exposed a status message that retained its original language after switching zh/en. TripContentEditor and TripCanvas stored translated strings. They now store a closed message identifier and render the existing copy for the current locale. This also keeps async results in the current language and avoids resetting a pending status merely because the locale changed. No request, draft, confirmation, version, styling or locale-persistence behavior changed.

Actual verification: lint/typecheck passed; eight affected Canvas/Proposal source checks passed. One old implementation-specific assertion first expected a translated string to be stored; it now checks the message identifier and current-locale rendering, preserving the original degraded-Proposal and stale-route assertions.

`node tests/integration/identity/run-native-io.mjs --same-trip` ran against a fresh owned local Auth/PostgreSQL/Next stack and exited0:1pass/0fail/0skip. Four real-cookie browser runs (zh/en ×1280x800/390x844) confirm a Trip, observe the stored status, switch to the other locale and back, assert both translated messages, preserve the item draft value and verify the native server still reports version1. Original same-ID/CAS/owner-isolation assertions also pass. Owned accounts and the disposable stack were removed. See locale-local-result.txt.

This correction is locally verified source added after the recorded remote run. The fixed remote host remains on f5db769; no new remote accounts or WAF allowance were created for this UI-only change. Reload's existing zh default, physical/device/fault cases and remote screenshot limitations remain open. Previous remote failure observations are not rewritten as passing on the old version.
