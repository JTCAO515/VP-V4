# Trip Actions Projection v1

V4-12 replaces fictional Bookings with owner-scoped `TripActionReference` records. Each record names the durable Trip source, one bounded label, an explicit freshness state and an optional recorded HTTPS external link. The Canvas never treats a link as an official channel and never creates orders, payments, inventory or provider completion.

Authenticated users have no direct mutation grant. A future accepted artifact workflow requires a separate owner-bound artifact receipt contract before it can enter this projection. Missing external links render unavailable; `recheck_required` stays visible.

Rollback: hide the Actions View/read route. Do not delete owner action references after migration; use a forward migration if the contract changes.
