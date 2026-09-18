# VPJ-12 single screenshot import and Trip proposal

The Trip screen opens a single-item Photos Picker. It accepts one selected
raster image intended to be a travel screenshot; imported screenshots can lose
PhotoKit's screenshot subtype, so the picker uses the image filter. It does
not request full-library or email access. ImageIO checks PNG/JPEG/HEIC/HEIF,
12 MB and 8,192 pixels per side / 16 million pixels total before the selected
image enters the on-device inbox. Vision recognizes Chinese and English text
locally. Neither image bytes nor OCR text are sent to a provider.

The private inbox is scoped to the authenticated subject UUID within the app's
Application Support directory, excluded from backup and written with complete
file protection. It retains at most one image per review; Close, cancellation
or successful proposal preparation removes it. Account replacement/logout
clears the whole app-owned inbox; a failed cleanup stays visible in Trip and
retries when protected data becomes available or Trip reopens. Logical access
expires after 24 hours and the next Trip access/import purges expired files.
A failed delete is surfaced instead of being silently reported as successful. The preview-only
screen keeps the image in memory and cannot propose a Trip change.
An open review invalidates its receipt at expiry; immediately before a
Proposal request, the UI re-reads the owner-scoped receipt so a missing,
expired or corrupted image cannot be turned into a Trip proposal from a
cached digest.

The correction UI shows recognized source lines and allows one user-selected
date, amount, address and status value with its source line. A date must be a
real `yyyy-MM-dd` calendar day. Against the selected saved Trip, a stable ID
derived from Trip ID, exact image digest and field kind distinguishes added,
duplicate and conflicting fields. The confirmed date becomes/reuses a Trip
day; the other confirmed fields become explicitly `User-checked screenshot`
Trip items with their source line. These items do not assert an external order
or supplier status. A replay of the same bytes and corrections has no patch.

Only after the user finishes correction can the native Trip store construct a
local draft and call the existing owner-scoped TripProposal API. The store
rechecks owner, Trip ID and saved version before posting. The existing visible
proposal diff, explicit confirmation, atomic Patch and reload remain the only
saved Trip path. Failure/cancellation leaves the saved Trip untouched; a
failed or ambiguous proposal request retains the local draft. Retry first
reads/reconciles any pending proposal and posts again only after the server
proves none exists. While the outcome is unknown, local edits and discard are
locked so the submitted patch remains the one being reconciled. A definite
pre-insert stale-version or invalid-input rejection unlocks the draft;
transport loss and post-commit authentication uncertainty do not.

The C0 synthetic contract in `user-artifact-c0.md` remains separate from this
native path. The rejected VPJ-73 Docling configuration is not invoked; local
Vision is the bounded parser for this slice. The inbox is device-local, not a
server-side cross-device archive. Full acceptance requires a real authenticated
Trip proposal/confirm/reload observation and the applicable deletion and
cross-account tests; source OCR success alone is not supplier confirmation.
