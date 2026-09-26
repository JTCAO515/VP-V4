# VPJ-34 Q2: Sandbox transaction to Journey Pass grant

The native Profile uses the VPJ-33 catalog SKU. `storeKitProductId=null` and
`VISEPANDA_STOREKIT_SANDBOX_ENABLED` unset keep purchasing and grant reads off.
No Production transaction is accepted. Local Xcode StoreKit JWS is separate from
official Sandbox and cannot create a server grant.

`POST /api/storekit/native/v1` accepts only `{signedTransaction}` from the
current native mobile session. The server verifies the Apple certificate chain,
Sandbox environment and app bundle, then obtains the current transaction from
the Apple App Store Server API and verifies that signed response. Transaction
identity, original identity, SKU, non-renewing type, quantity, purchase time and
`appAccountToken=auth.uid()` must agree. A pending or cancelled StoreKit result
never reaches this route; unverified, mismatched, unavailable and revoked results
never return an active grant. The Apple API credentials and service key remain
server-only.

Sandbox activation requires `VISEPANDA_STOREKIT_SANDBOX_ENABLED=true`, a reviewed
real SKU in the sole VPJ-33 catalog, `VISEPANDA_STOREKIT_SANDBOX_SIGNING_KEY`,
`VISEPANDA_STOREKIT_SANDBOX_KEY_ID`, `VISEPANDA_STOREKIT_SANDBOX_ISSUER_ID`, and
`VISEPANDA_STOREKIT_STAGING_SERVICE_KEY` on the bounded Staging deployment.
Never put those values in the app bundle, repository, chat or a Web public env.

The service-role-only `storekit_apply_verified_v1` owns the append-only transaction
identity `(environment,transaction_id)` and serializes grants per owner. Every
new interval lasts exactly 720 elapsed hours, begins no earlier than the trusted
Apple purchase time or the latest recorded end, and snapshots the VPJ-33 catalog
version, policy version and capacity. A replay returns the original interval and
snapshot even after policy advances. Revocation changes only its matching row;
erased transaction tombstones remain unique and cannot be claimed again. The
account's rolling ServiceTask window is outside this ledger.

`GET /api/storekit/native/v1` and `GET /api/storekit/web/v1` read the same RLS
rows for their authenticated actor. Their `effective_state` derives from server
time (`queued`, `active`, `expired`, `revoked`), never a device clock. The Web route
requires the same bounded local/Staging runtime target as native. Both replies
are private and uncached. Service-role-only `storekit_export_owner_v1` and
`storekit_erase_owner_v1` provide the data lifecycle hooks; erasure clears the
owner and account token while retaining transaction tombstones. Privacy request
execution integration remains a separate lifecycle task.

This Q2 contract does not claim Q3 cross-device restoration, App Store Server
Notifications, proactive refund reconciliation, or Q4 late-transaction ordering.
Actual Sandbox purchase and both-client target-environment readback require the
configured SKU, Apple account/API credentials, applied migration and test device.
