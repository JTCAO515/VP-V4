# Native goal-return consumer candidate

Source input is the original E3 Server WIRE and its exact source hashes in candidate-manifest.json. The RPC is not installed according to that WIRE; no live or target capability is claimed.

The decoder accepts only goal-return/1 version5, five exact source keys and the current expected UUID/version/parent/sequence tuple. eventId stays a canonical decimal int64 string; numeric, boolean, zero, overflow or leading-zero IDs reject. Only nextStep unknown is accepted. A uniform unavailable response cannot carry a reason or scope detail. Raw result text comes solely from the original NativeFiveResultRecord decoder and exact reader, not this reference wire.

Private store: current actor/session/epoch and source selection → discover reference → exact original typed decision/1 current/chosen read with identical goal/version/input parent/sequence → rediscover identical artifact/revision/eventId → transient decision. No timestamp sort, fallback to global/older result, result producer, goal writer, save/adopt/confirm, billing or telemetry. Its entire publication lease is 20s from request start; stale generation, cancelled/replaced/inactive selection or expired read cannot publish. A 20s watchdog clears a still-loading reference and makes refresh available; late responses retain no authority. The view clears on original assistant invalidation, result/conversation/Turn erasure, Memory changes and hide; reopening uses the original exact result reader again. Actual next action stays unknown.

Shared candidates only, all complete before/patch/after:

1. NativeSession: fixed GET method with exact five query fields and current original actor before/after; the original result projection fence explicitly covers goal-return, alongside the existing Turn fence. No new transport, credentials, cookies, recipient or endpoint selection.
2. NativeAssistantConversationView: derive a read-only context from the existing confirmed current goal/current parent/sequence/actor and pass it to the private entry view; exact result opening uses the original selected-result sheet. All original composer and Ops hunks are preserved in the before snapshot. Main must rebase against the actual current holder’s newest shared source before a new lease if that snapshot changed.
3. project.pbxproj: only three new private source refs/build refs/root group/app Sources. No targets/settings/ordered original sources changed.

Current worktree shared files remain UNAPPLIED; default optional transports on the private EntryView are nil, so no new live request is enabled. Only a disposable compilation copy applies the candidates. Source registration and actual invocation require new exact original-holder releases and Main lease; old PR678 or Ops release does not authorize these new deltas. If the SQL/HTTP wire changes, compare source pins, then regenerate the affected candidate/decoder and checks before applying.

The existing personalization and consented-observation gaps remain open. Tests/compilation are source evidence only. Real ordinary Auth/RPC discovery→exact read→rediscovery, every original deletion/withdrawal/race, rendered large text/keyboard, target and physical/VoiceOver remain UNRUN. No helper PR is created for this preparation.
