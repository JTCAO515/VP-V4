# IOS-004 / #506 online address contract

Accepted product direction: BestJ relayed JT scope on 2026-10-15. Main owns this new shared interface; original Trip/support/DTO/UI hunk ownership must be explicitly handed off before editing those existing objects. This is development source only; no shared database, paid provider, offline permission or production action.

## Sources and version

- Prefer the existing ItemSupport `address_reference`, with exact current Trip version/day/item, `reference_current`, `matched`, traceable valid GroundedClaim and current source eligibility. Reuse the existing reader/rights/expiry fences. Do not copy references into a new Trip authority or relabel grounded data as user-provided.
- Chinese text qualification observes the actual structured address lines through `classifyChineseAddressLines`; it takes no countryCode, item title or arbitrary POI input. Known Han text is distinguished from Latin-only and ambiguous/unsupported scripts. It is not translation or verification of physical accuracy. Unknown qualification cannot be labeled Chinese; original-source information keeps its own truthful status.
- Manual data is exactly `{text, source:"user_provided", verification:"unverified"}`. No client can grant a verified status. New manual text can appear in the confirmed view only after the original Proposal visible diff and explicit Confirm, with its authoritative resulting Trip version. Missing shows `未提供`; transport/source errors remain unavailable, not a false missing result.
- References and manual additions remain distinct. If both exist, show their origin separately rather than ranking, overwriting or downgrading existing grounded evidence. Never infer address from title/model/countryCode/live POI.

## Minimal compatible manual write

The technical wire is `set_item_chinese_address` with `dayId`, `itemId`, `text:string|null`; null explicitly clears it. Target an existing item and expected Trip version through the original patch/Proposal/Confirm authority. Source and verification tags are constructed by the writer, not accepted as privileged client claims.

The minimal compatible read value is optional `TripItem.chineseAddress: UserProvidedChineseAddress`. It may be represented within the original confirmed content; it never requires copying existing grounded references into Trip DTOs. Any alternative storage must keep the same original authority and confirmation/version contract, not a second address writer.

Absent old values stay absent and do not cause a data rewrite. Old upsert/title/time/order operations preserve an existing address when they did not explicitly change it; explicit item deletion removes that item's data normally. Exact shared codec source is `lib/trip-user-address.ts`. Input keeps original UTF-8 text, max500 Unicode scalars/1500 bytes, no forbidden controls or lone surrogates, nonblank against the explicit shared scalar set. No trimming, translation, guessed default or silent clipping.

## Boundaries and required behavior

Original owner/actor/RLS, source evidence, proposal revision/digest/base version, unknown-ACK recovery, cancellation, deletion and current-read fences remain enforced. Editing, preparing and seeing a diff do not change confirmed Trip data. New data is plain unverified user text, not GroundedClaim or a model/provider permission.

Online only. Existing offline permit remains date/title-only, including cache/provenance/lifecycle; adding address to an online DTO must not add it to offline payloads, saved model context or third-party requests. No supplier query, translation, fee, background monitoring or automatic address generation.

New migrations are append-only, uniquely allocated by Main, with known-before qualification and old/new data compatibility. Preserve already accepted migrations. Historical append fixtures must test their chronological boundary, then complete current successors; current HTTP runtime input manifests must reflect actual migration order and exact reviewed source bytes. Do not put future migrations before the append under test, adopt observed hashes or weaken supported-layout/lifecycle guards.

The Web Cookie read is `GET /api/trips/:tripId/addresses?expectedTripVersion=N&dayId=D&itemId=I`, private/no-store. It rechecks the authenticated actor and original current Trip around the existing Support read. Confirmed manual data and source availability are independent: a failed or unavailable Support read retains an otherwise valid same-version manual value and marks the reference unavailable. Native consumes the existing Trip and Support readers under its own Bearer/session fences. The accepted migration chain currently leaves ordinary `read_trip_item_support_v1` execution disabled; this work adds no grant or activation and does not claim a live grounded-source acceptance.

Manual values live in the original confirmed version snapshot JSON. The new append overlays only that same owner/head/day/item in the existing content projection, preserves explicit moves and old upserts, and retains strict export/archive decoding. Original Confirm source and privileges remain unchanged. Before model dispatch, both the existing prompt and its SQL destination comparison omit only the new address field; offline date/title permits remain unchanged. The existing runtime guard retains its 296-entry inventory and metadata checks, with exact known-before to authored-after pins for the five affected functions only.

Implementation units: original-authority server/SQL/DTO and lifecycle; Native Today/editor/confirmation consumer; Web same-version address/diff consumer. Main serializes shared interface and migration order. Independent lines require the needed interface source and explicit writer scopes, and must deliver real integrated flows rather than placeholders. Verification is affected module/contract/role/version/unknown-ACK/egress/offline negatives plus existing merge gates; target/provider/device/release evidence stays separate.
