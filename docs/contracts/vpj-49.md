# VPJ-49 — local confirmed-Trip sharing

Issue: [#241](https://github.com/JTCAO515/VP-V4/issues/241). S4 local iOS feature,
iOS 17+. This consumes the existing native v2 confirmed snapshot; it does not require
new preference, order, media, database or hosted-sharing contracts.

## User flow and privacy

`NativeTripView` offers sharing only for `confirmationState == confirmed`. The
editor takes an immutable snapshot, including its account generation. The user
chooses the whole trip or one existing day, optionally includes the trip title
and travel dates, and individually selects item titles by the pair of day ID and item ID. All free text and travel
dates default to hidden. An arbitrary title may include a hotel, room, companion
or order reference: the app explains this instead of claiming automatic detection.
Users can exclude any such title. Times, IDs, credentials, preferences, private
materials and structured order/companion fields are never projected.

The pure `NativeTripShareCard.make` projection accepts only that saved detail and
explicit selection. Drafts and pending proposals are not inputs. Missing or
initial confirmation state and nonexistent selected days are rejected. The card
labels a user-selected confirmed plan that may include AI-generated text; it
explicitly is not a booking receipt or travel testimonial. It uses ordinary system
text, product colors and the VisePanda name; no external image, font, map, licensed
photo or invented testimonial is introduced.

One bilingual template paginates every four rows without truncation. Each page
includes the saved version, UTC image-generation time and page count. `ImageRenderer`
creates the images locally; the privacy preview displays those exact `UIImage`
instances and only those instances enter `UIActivityViewController`. There is no
server export, hosting URL, collaboration permission, analytics or app-managed
file cache. The user selects a destination in Apple's system Share Sheet. Exported
copies cannot be remotely recalled and do not auto-update; the preview states both.

Before generating or handing images to the system, the existing authenticated
Trip read rechecks the saved version and content. Read failure blocks the action
and offers retry. Account/session generation changes, selection changes or a new
saved revision invalidate the images; the sheet asks the user to close and export
the latest plan. Foregrounding also refreshes. A snapshot remains a historical
snapshot: a change after system handoff cannot revoke the recipient's copy.

## Verification and scope

See [verification](../../artifacts/VPJ-49/verification.md). Simulator rendering and
system Share Sheet are real native operations. The repeatable UI input server is
explicitly synthetic and loopback-only; it is not evidence of Supabase, Staging
identity, actual hotel orders, cross-Trip preferences or remote delivery. The
existing upstream #192/#199 retain their own remaining acceptance. This local
feature adds no new upstream data capabilities and does not close those issues.

Regression coverage includes both languages, default privacy, single-day selection,
explicit inclusion/removal, rejection of unconfirmed state, account/version fences,
all-page rendering, OCR of actual export pixels, UI preview and real system handoff.
Revert this PR to remove the feature; no migration or remote cleanup is required.
