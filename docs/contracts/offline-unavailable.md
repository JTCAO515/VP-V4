# Offline read availability and local storage boundary

The original Offline pack route remains unavailable unless a trusted server policy,
controlled submission source, allowed runtime API and pretrusted Native Ed25519 key
all qualify the exact confirmed Trip subset. No default lease/key or map/third-party
cache rights are created by this module.

Native Today reuses its confirmed Trip reader. Its dedicated local consumer stores
only verified date/item-text projections under the signed field allowlist, with
partial coverage/version/sync/expiry labels. User-edit drafts are a separate AES-GCM,
owner/epoch/Trip namespace with device-only keys, file protection and backup exclusion.
They do not grant cache rights or write Trip offline. Online recovery uses the existing
TripProposal diff/CAS/explicit-confirm chain; controlled new text capture is separate
from ordinary draft restoration.

Expiry, wall rollback, untrusted boot identity and revoke/delete/archive/account
replacement restrict or remove saved text; failed cleanup blocks reads. The installed
trusted-key registry defaults empty. Current default configuration does not establish
successful live offline permits. See the fixed server wire in
[vpj25-offline-read.md](vpj25-offline-read.md) after the same-batch source integration,
and [Native evidence](../../artifacts/VPJ-25/native-offline-trip-20261003/verification.md).

No permanent AppGroup/old-device resurrection, background monitoring or live-fact
claim follows from this cache. Roll back the consumer normally; preserve existing
confirmed Trip and authoritative receipts.
