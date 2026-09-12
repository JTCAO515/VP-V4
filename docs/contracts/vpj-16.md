# VPJ-16 — scoped first-party knowledge consumption

This incremental contract implements a native reader for the published `knowledge-read/1`
interface introduced by PR337. It does not complete #206's Ask grounding/claim coverage.

## Native reader

In a configured native Staging build, Explore reads the fixed `api/knowledge/native/v1`
endpoint through `NativeSession`; credentials remain inside that service. The request is GET,
with typed city/scene/zh-or-en scope, no cookies, redirects or new model recipient. Unconfigured
builds retain the existing explicitly labelled Explore preview.

Results must match schema, selection, first-party recipient, trip-planning purpose and
CN-mainland content territory. Displayed text retains every condition/exclusion and source
locator. Empty eligible results and unavailable identity/service remain distinct. This does
not claim all cities/scenarios or guarantee the described physical service.

Every response is fenced by account scope and load generation. Selection/account changes,
leaving Explore or backgrounding make the previous result ineligible for display. A generation
check rejects late responses. Only the visible Explore tab loads. Session busy is excluded
from cancellation identity because a request may itself refresh its credentials.

Snapshots remain memory-only. Server evaluatedAt and each expiresAt determine a monotonic
lifetime after subtracting request duration, capped at30 seconds; the reader then clears and
rechecks. Failed refresh never retains old text. Revocation is observed on the next refresh,
return to foreground or selection change, with at most30 seconds of snapshot lifetime; this is
not an instantaneous push subscription. Source links open only explicit HTTP(S) URLs without
embedded credentials. Other source locators remain plain text.

## Remaining integration

Ask still needs request-scoped evidence retrieval and claim coverage, required/background and
conflict handling, reliable partial answers and concrete gap taxonomy. First-party publication
does not itself authorize arbitrary model recipient use. Real native/Staging and synthetic
UI evidence are recorded separately in `artifacts/VPJ-16/native-knowledge-20260913/verification.md`.
Complete Issue and release acceptance remains separate from this consumer slice.
