# VPJ-58 actual device Guide cache exit

Sole Native owner: `vpj58-native-guide-cache-data-20261008`. Base is Turn Native
`c69faef74e68bf15deffe254992d782a99f0a9e7`, including unmerged Profile/Export/Offline/Turn dependencies.
This is #239 ALL1/ALL2's independent `guide_cache` device gap, not a reopened Guide/server task.

## Actual source graph and permissions

- `NativeSession.placeGuide` is the application's one retained Guide Store instance. The feature
  injects that exact object; no fabricated record, copied server domain, Session-library scan,
  global registry or account-wide enumeration. Test stores are separate injected synthetic sources.
- Store holds selection, ready, qualifiedDigest, progress, cacheAllowed and monotonic deadline.
  Foreground suspend clears ready but may retain licensed identifiers/progress. Existing clear
  has no inspectable receipt. New source snapshot includes actual instance/generation/state revision,
  necessary selected Trip/place/locale/interest/digest, positive rights revision, licensed source IDs,
  conservative speech progress, ready presence and busy state. Body/URI/source text are excluded.
- `NativePlaceGuideReady.Rights` has display/tts/cache/prompt only. No narration, published fact,
  source-body or audio export permission exists. The metadata export explicitly excludes them.
  Only cache-licensed IDs/progress survive/export; a cache=false ready remains visibly selectable
  for clearing but its ephemeral positions/IDs are excluded. Historical safe binding metadata does
  not become a current playback/rights grant.
- Original View metadata export calls SERVER `export`, validates canonical records/bindings in
  Models and retains a view-leased String. It stays the original server capability. This feature's
  file is a distinct DEVICE projection of actual retained instances, never server deletion proof.
- FollowUpStore retains policy/pending/submitted/answer, with original pending body in Session
  Keychain via NativePlaceGuidePending. Its body/nonce/fencedReference/status and all original
  FollowUp/journal bytes are outside this local cleanup. No forget/sourceUnavailable/completePlaceGuide
  invocation occurs from the cache exit. Old Guide read failures after clear must return before
  View's sourceUnavailable path. Cached answer presentation is hidden synchronously through a weak reference to this View’s
  actual FollowUpStore using hideForLocalGuideCacheClear, preserving draft/pending/submitted/awaiting
  and original bytes; old refresh callbacks fail their existing generation checks.
- NativeVoiceAudioController holds Guide purpose ID/text/locale/expiry/offset/pause/progress callback.
  System speech is an utterance, with driver completion fenced by its generation. No Guide audio
  file exists. Shared NativeVoiceAudioFiles are recording files for original Voice capture; local
  cache clear must not call generic cancel/eraseAll on unrelated speech/recording. Guide-only stop
  cancels its timer, stops the system utterance, nils Guide fields/callback and inspects them empty.
  Translation single-play IDs/finalTranslation/transcript and recording fields are unchanged.
- NativeSession placeGuideRequest uses original NativeDataScope/ordinary auth and tripRequest.
  Local destructive action/receipt/export binds exact NativeCommunitySafetyActor (endpoint/owner/
  mobileEpoch/generation plus verified sessionID), actor loss/scene loss invalidates preview/files.
  No new privacy JWT is added to existing Guide read/replay. No server/SQL/provider call is needed.
- Coverage retains exact 34-module catalog `data-coverage-catalog/2026-10-07.11`; only device
  guide_cache branch delegates to the owned view. recordDevice reports prepared bytes separately
  from actual UIActivity completion/cancel/failure; no ShareLink completion inference.
- PBX candidate is additive three own production files/one own test, eight new file/build IDs plus
  one group, preserving Turn 9+LegacyAsk, all F158D Offline and Profile IDs/source order.

## One bounded flow

Read actual source list → explicitly select all listed owner instances → fixed 30-second wall+uptime
preview → compare exact instance list/state revision/selection/rights/generation and renderer CAS →
bounded protected metadata file → user system handoff with completed/cancel/error outcome →
explicit confirm of the still-current preview → physically remove this feature's export file →
Guide-only renderer stop/inspection → synchronous MainActor per-store CAS/clear/empty inspection →
immutable minimal local receipt → optional bounded protected receipt file/system handoff.

Preview does not renew when polling or exporting. Clock rollback/uptime rollback, source mutation,
rights revision change, epoch/actor/session change, list drift or 30 seconds fails closed. There is
no truncation: >16 instances or invalid source metadata is unavailable. No selected source produces
no cleanup receipt. Partial/uninspectable cleanup leaves failure notice and no success receipt.
Receipt contains operation, actor-binding hash, completion time/counts and explicit server/pending/
external boundaries, no erased content/selection/source body. It is immutable in this screen's
lifetime; exports use a single distinct protected, backup-excluded temporary root with finite cleanup.
No persistent operation recovery is claimed for volatile source state.

Clear invalidates Store generation and captured callback generation, empties ready/digest/licensed
IDs/progress/rights/TTL/busy/notice, and suppresses automatic refresh. Fresh explicit source recheck
can rebind/read under current original permissions. Old async read/progress save/driver completion
cannot restore state; no permanent same-epoch ban, silent reload or old-permit rebase. External
already-consumed audio and saved copies cannot be recalled. Server Guide forget remains its original flow.

## Shared precise candidates — ungranted until Main lease

`Candidates/*.patch` and `pins.json` are exact before/after candidates for Store/View/Audio/
ModuleView/PBX. No shared source is written before actual current-owner release and Main exact
lease. FollowUpStore’s exact four-line presentation hook and Session’s two adjacent existing-cleanup
hooks are also candidates. The Session hunks purge only the distinct own export root with the
existing storageError failure fence; transports, LegacyAsk compatibility and pending journals are
unchanged. Startup/lifecycle cleanup is not a false cross-process or backup erasure proof.

## Verification scope

Necessary new own source/clear/clock/actor/late callback/protected file/handoff negatives and original
Guide/Audio compatibility, then actual App test build. Reuse unchanged Offline/Turn/Profile evidence.
Local synthetic proof is not real Auth/server/provider/device voice/human/share/backup acceptance.
Target phone, provider, fees, backup and actual system delivery are UNRUN until separately observed.
