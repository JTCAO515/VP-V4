# Native grounded event continuity

S2 / #196. `GET /api/chat/native/v4/turns/{turnId}/events` is available only
under the existing local or explicit Staging grounded configuration. It uses the
native bearer session, rejects cookies, Origin and query parameters, and never
submits a Turn, dispatches a provider, settles usage or changes a Trip.

## Wire and consumer

`grounded-events/1` is an additive native protocol; legacy metadata SSE is unchanged.
`Last-Event-ID` is the nonnegative canonical sequence, initially zero. Event IDs
remain the existing database `event_id`; neither reconnect nor replay creates IDs.
The cursor cannot exceed the Turn's latest sequence. At most 200 events are read.

- `turn`: SSE `id` equals JSON `sequence`. Contains `turnId`, `eventId`, `type`,
  `state` and `schemaVersion`. Nonterminal events have `turn:null`. A terminal
  event contains the complete `grounded-turn/1` projection in the same frame.
- `projection`: no SSE ID. Contains `turnId`, `afterSequence`, `schemaVersion`
  and a complete current Turn. Restores facts after cache loss or expiry even if
  the terminal cursor has already been acknowledged. This is not a new event.
- `heartbeat`: no ID; reports `afterSequence`, with retry 2000 milliseconds.
- `unavailable`: no ID, empty object. Ends a failed active stream without
  advancing a cursor or implying successful generation or reconciled usage.

Each connection returns the first authorized snapshot immediately and follows
database changes at one-second intervals, for at most seven snapshots within the
existing ten-second native request lifetime. It closes at terminal; pending clients
reconnect. This delivers validated cards, not tokens of internal classifier JSON.
The model's current nonstreaming intent classifier and tariff ledger are unchanged.

Native consumes URLSession bytes as they arrive. A frame is limited to 256 KiB,
the connection to 2 MiB and 15 seconds. Incomplete/invalid frames are rejected;
cursor advancement occurs only after complete frame and factual validation. Cards
replace their existing Turn by ID. A cursor never authorizes cached facts.

## Authority and lifecycle

The append-only `read_grounded_events(policy,turn,after)` RPC composes the existing
grounded read in one transaction: actor/session guard, selected policy, active
consent, visible content/task, current source and original evidence-basis checks.
The existing Turn lock fences completion/cancellation while events and projection
are read. The new function grants execution only to authenticated actors; it adds
no table grants. Each stream snapshot repeats these checks. No database transaction
or row lock is held while waiting for the next snapshot.

Foreground pending Turns use the event connection. Background/tab changes cancel
the view task and hide facts; foreground restoration reloads authority/history and
resumes the same Turn. Session scope and read generation fence every callback;
Send/Cancel/withdraw/reload invalidate the prior event read. The live connection
does not make the store busy or disable generation cancellation. Network EOF does
not acknowledge or submit a pending request. The existing Keychain request-before-
send and matching-history recovery remain authoritative across process restart.

All visible facts retain the existing maximum 30-second monotonic lease. Full
connection elapsed time is subtracted from new cards. A new card cannot extend
other cards' leases. Expired facts remain inaccessible until current history reads
revalidate them. Withdrawing policy/source authority never replays historical fact
text merely because an event ID was valid in the past.

## Evidence and rollback

See `artifacts/VPJ-08/native-events-20260913/verification.md` for exact versions,
tests and unrun target acceptance. Prior pre-dispatch crash, same-task repair and
Web evidence remain scoped to their original implementations. This increment does
not implement provider token streaming, post-dispatch unknown-usage reconciliation,
Trip proposal/commit recovery or all #196 acceptance.

Rollback uses the previous supported native/API build or disables the existing
grounded deployment flag. The new RPC is additive and preserves all task/event
data. If removal is needed, apply a forward migration revoking/dropping only
`read_grounded_events(uuid,uuid,bigint)`; never edit an applied migration or restore
revoked facts, consents or sessions. Production release remains separately gated.
