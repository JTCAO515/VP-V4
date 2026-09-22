# VPJ-30 outstanding acceptance

UNRUN: actual APNs/device permissions/registration/dispatch, provider acknowledgement,
background/offline delivery and lock-screen behavior, cancellation/Trip/consent changes
racing a real send, device account replacement, real native HTTP→GoTrue→DB interaction,
VoiceOver/screen interaction, #207 watch and #215 Next Step continuation, privacy
export/delete/restore module integration, Staging migration and runtime checks.

This PR supplies retained user intentions and current eligibility projection. There is
no real scheduler/outbox/transport; status never says scheduled/sent. Real send remains
unavailable. Client text explicitly states this before saving. Local OS timers cannot
substitute for delivery-time authoritative checks. #221 stays OPEN.

Device build UNRUN after missing AMap local SDK caused the initial build failure;
iOS Simulator build PASS does not replace pinned CI or signed-device acceptance.
Existing required CI must be followed on the PR; no auto-merge authorization.
