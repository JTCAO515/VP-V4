# Lodging context source boundary

Fixed core af1cbb976ad09f39d7f102ae107ea40ee8d7e01d, based on actual main8d30d0ba. This is the ordinary-owner, read-only context layer; the original Hotel owner integrates Native/local state and the single complete H3/H4 PR.

PASS 3 affected cases: node --experimental-strip-types --test tests/contract/lodging/context.test.mjs, zero skipped:
- Explicit date/occupancy/budget scope, partial or invalid dates/rooms, preserved original total and floor allocation with remainder. Budget arithmetic is not a quote.
- Place identity never grants hotel classification, inventory, price or check-in eligibility. User notes are unverified and do not affect evidence/rank; commission is absent from the closed input and objective ordering. Booked/not-needed/deferred user intent suppresses booking offers.
- Actual Native handler with signed fixture token and mocked HTTP/Auth/Trip/session transport: exact current Trip context, future route/source gaps unknown/pending, changed same-subject/session epoch refuses result, no new writer dispatch. This is not real Auth, production JWT, target RLS or provider acceptance.

PASS TypeScript and diff whitespace. Initial HTTP case failed503 because the snapshot fixture used an object where the actual getTrip reader expects rows. Only the fixture response shape was corrected; the original200 success and401 epoch-replacement assertions remain and subsequently pass.

UNRUN real target Auth/roles, provider/Maps calls, commercial inventory/quotes, device and human acceptance. No flags, credentials, roles or target permissions were enabled.

Current producer gap: supported canonical categories and reviewed Ontology do not expose a typed reviewed hotel-classification relation. Current context therefore qualifies only a canonical place identity and explicitly leaves hotelClassification unknown. Main assigned the SQL producer contract separately; this layer is not whole #505/#213 completion. Existing comparison artifacts retain prose only, without a current exact-departure route receipt; no minutes are parsed from that prose. Saved pace provenance is local-preview-only and is not applied by server ranking or converted to bed/budget Memory.

Approved classification consumer fixed e701c8835fd51754d321f3ff0cf8c019c8467f39 consumes the separately approved read_reviewed_lodging_classifications_v1 closed scope/receipt. It upgrades hotelClassification only when both the requested canonical/provider identity and the current independently reviewed hotel receipt qualify. Quote, stock, bed matching and guest eligibility remain unknown.

PASS one additional receipt parser/qualification case and one actual Native handler + signed fixture token/mock HTTP double-read case: moving response clocks do not imply changed source authority; changed rights are refused; output expiry never exceeds the first classification window. Stable source/mapping/version/digests/rights/source references are compared and both reads enforce current TTL. These are fixture receipts, not actual Ops review/publication, target permission or live classified hotel content. Necessary current SQL/HTTP composition remains UNRUN until the fixed producer runtime is supplied.
