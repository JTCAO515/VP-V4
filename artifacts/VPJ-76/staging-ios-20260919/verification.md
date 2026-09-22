# #360 native Staging setup and policy consent — 2026-09-19

## Installed application

The real `VisePanda` SwiftUI app from repository commit `2370391` built,
installed, and launched on an **owned, newly created** iPhone 17 Pro
Simulator (iOS 26.5; UDID `32AC3819-97BA-41F1-B4B7-4F37942FF7AF`).
The XcodeBuildMCP build/run returned bundle ID `space.go2china.VisePanda`
and a running process ID. The built app's merged `Info.plist` was read back:

- `VisePandaNativeEnvironment=staging`
- `VisePandaNativeTaskContext=knowledge_intent_v1`
- `VisePandaStagingAPIOrigin=https://vp-v4-5dcdig8mo-jtcao515s-projects.vercel.app`

This is an installed Simulator app, not a physical iPhone observation.
No Swift source or shared Xcode project setting was edited for the build.

## Real identity and consent

The owned ordinary Staging author account signed in through the App's native
login UI and obtained an active session. The Ask tab displayed the actual
versioned Qwen notice `vpj75-76-staging-qwen-20260919-v1` supplied by the
new immutable `knowledge_intent_v1` policy. The test account explicitly
checked the notice acknowledgement and tapped “允许AI处理” in the App.

Independent remote SQL readback observed policy
`74f22a81-c9e0-44b7-a7a1-d6f6425d931d`, hash
`4b765da2fd88d71d9f4ac7762c40802a9c3f07cf5f23a5f563b21d70c47a9bf9`,
provider `qwen`, current validity `true`, and exactly **1** active consent.
The App then displayed an enabled composer. At this step no Ask question
had been submitted and no EvidencePack or iOS answer had been observed.
[Installed App after consent](native-consent-accepted.jpg) is the actual
Simulator viewport screenshot.

The bounded policy expires at 2026-09-19T14:16:38Z and is scoped to the
branch Preview plus these owned synthetic test accounts. Account-specific
Qwen contract terms, internal inference location, retention and training
settings remain unknown as stated in the notice. Original Trip rows remain
untouched; publication was still disabled during this step.

## First real App Ask: honest clarification baseline

The installed App sent the exact visible text “What documents do I need to
board a train in Shanghai?” as a new grounded question under the accepted
policy. The first attempt to automate typing under the Simulator's Chinese
keyboard produced a corrupted unsent draft; it was never submitted. The
isolated Simulator was switched to an English keyboard and restarted. The
input was checked verbatim in the runtime UI before Send.

Real Staging SQL readback found turn
`8db8c8e3-debd-42d1-a8e0-acfe1d4426f9` initially `queued`, with the
exact input and current policy. There was no deployed automatic worker.
The existing dedicated `run-staging-text-worker.mjs` was therefore invoked
once, bound to this owner/policy and a CNY 10 scoped budget. The reviewed
public Qwen highest context-tier rate was used conservatively: CNY 6/M
input and 24/M output, with a 6,400,000-micro reservation covering the
module's 1,048,576-token input bound plus 1024 output tokens. This is a
budget estimate, not a supplier invoice.

The real provider transport recorded configured → attempted →
response_buffered; the real usage receipt reported 2582 input + 29 output
= **2611 tokens**. The budget attempt settled at **16,188 CNY micros**
under that conservative tariff, and the worker returned `finished`.
The DB turn reached `completed` with intent and original outcome
`clarification`; the App reloaded and showed a request for more details
rather than a fact answer. [Actual App viewport](native-first-ask-clarification.jpg).

This is an **expected clarification** for the actual question: it did not
identify the adult foreign-passport and domestic e-ticket scope required by
`vp-knowledge-intent-v7`. It must not be scored as over-refusal. Publication
was also still disabled. This does not prove EvidencePack quality or
consumption of a new #359 publication. The original 3 Trip rows and their
full-row digest remained unchanged after this call.

The direct same-owner structured baseline was also called against real
`knowledge_read_v1` for `shanghai/rail/zh` while the publication switch
remained off. It returned `KNOWLEDGE_DISABLED` (HTTP 400 through the real
PostgREST RPC); no Fact set was available to compare yet. This baseline is
retained for the later reviewed-publication window.

## Publication-on direct baseline and native answer

The owned Staging publication-read switch was enabled under exact checks:
61 migrations, two owned active Ops members, 9 Auth users, 3 original Trips
and an unchanged Trip digest. No publication row was changed by the switch.
Authenticated `knowledge_read_v1` then returned 3 eligible Shanghai rail
facts in both zh and en; the required Q2/Q11 facts were present before any
new #359 candidate was published.

The next fully scoped native question, “Adult foreign passport on a domestic
China e-ticket: what booking ID and ticket proof for boarding?”, was first
run while publication was disabled. Its Qwen output validated, but the
database resolver translated `KNOWLEDGE_DISABLED` to a terminal
`technical_failure`. This is the expected environment failure, not a model
classification error. That second worker call used 2589 input + 31 output
= **2620 tokens** and settled 16,278 CNY micros at the conservative
highest-tier internal rate.

After the publication switch was enabled, the installed App submitted an
exactly inspected shorter question: “Adult foreign passport, mainland
e-ticket: what ID and ticket proof for boarding?” It created turn
`22791211-9d2f-4539-a0c6-da250be15299`; the real worker reported
2586 input + 31 output = **2617 tokens**, settled 16,260 CNY micros, and
finished. The DB result was `rail_boarding_documents/single`,
`original_outcome=answered`, current projection, with a frozen basis of
two eligible publications. Both required claims —
`original_valid_booking_id` and
`valid_ticket_not_itinerary_or_receipt` — were `covered` by real Fact IDs,
with assertion IDs, source-revision IDs, four conditions and one exclusion
per fact. The App displayed the recognized problem and answer preview:
[actual installed App viewport](native-rail-answer-existing-facts.jpg).

For these **three** real provider worker runs, the metadata journals show
wall times 5758/6080/6886 ms (p50 6080 ms, nearest-rank p95 6886 ms;
sample too small for an SLO), **7848** provider tokens total and **48,726
CNY micros** of conservative internal settlement. The Qwen account invoice
remains unavailable; these micros are not a verified actual charge.
Independent SQL readback after all three calls again found 3 original
Trips with the exact prior full-row digest
`df58483b35f0002eb3bb9a9e829c8198`.

This proves native and structured answer behavior for **existing** rail
Facts. It does not yet prove consumption of the new #359 candidate or
EvidencePack v2 from the fallback search path.

## New Preview native build boundary

After the Web/native AI-assist timeout repair, the iOS Simulator build and
install succeeded again with the new exact Preview host
`vp-v4-64u5z6ck5-jtcao515s-projects.vercel.app` pinned as
`VP_NATIVE_STAGING_API_ORIGIN` (bundle
`space.go2china.VisePanda`, process 19253, iPhone 17 Pro iOS 26.5
Simulator). The synthetic author signed into the rebuilt App, and the
remote account session became valid. No native AI-assist action was
completed on this build; a build and login cannot substitute for a real
fallback response or a physical iPhone acceptance run. A fresh remote
SQL read after the Web retry and native login still found the original
3 Trip rows and exact digest `df58483b35f0002eb3bb9a9e829c8198`.
