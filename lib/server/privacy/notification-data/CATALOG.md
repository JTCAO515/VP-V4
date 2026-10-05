# Final notification catalog / Native producer mapping

Version: data-coverage-catalog/2026-10-06.4. Full denominator 34 entries (old32
plus TWO added scopes; existing notifications is upgraded, not duplicated).
All three server entries use moduleVersion notification-data/1, selection
notification_records (20 ASCII chars), exportHandler/deleteHandler
notification_data. Outer CoverageInput.tripId is null; objectIds in actual command
select Trip UUIDs, device UUIDs or old exit request UUIDs by scope.

| module ID | scope | order |
| --- | --- | --- |
| notifications | notification-trip-data/1 | Original notifications row position, upgrade metadata-only row |
| notification_devices | notification-device-data/1 | Immediately after notifications |
| notification_exit_progress | notification-exit-progress/1 | Immediately after notification_devices, before lifecycle |

Producer fixture: tests/fixtures/privacy/notification-data/native-catalog-v4.json,
full 34 exact registry-shaped entries with clearly synthetic actor/session. Owned
coverage.ts exports descriptors/selection/recovery/outcome functions. Native add
these two IDs/version4/selection to exact decoder whitelist, order and copy; all
three notification_data entries open the existing new NotificationData consumer
with mapped explicit scope. Preserve every existing module and unavailable boundary.
No new UI activation/config/APNs/phone action follows from this registration.

Shared TS registration ready (catalog.ts + contract.ts + registry.ts + outcomes.ts):
replace only old notifications catalog row with NOTIFICATION_MODULES, add selector
literal notification_records, version4; insert new handler notification_data/path,
exact owned selection classifier/body builder, outcome delegation. Preserve old
notifications metadata export handler in registry for direct old boundaries; it
cannot classify the new full-data module. Current shared coverage files unchanged
until exact Main lease, per original dispatch ownership rule. Native Copy.order/
fixture shared release is Main-managed; this TS never writes those Native files.

Necessary legacy sender fixture adaptation is reviewable in LEGACY-FIXTURES.patch:
only new begin_fenced action, leaseBudgetMs and minted internal sendPermit. All
original expected outcomes, no-retry assertions, payload/privacy checks and
HTTP2/CLI behavior remain. Two files tests/unit/notifications/{delivery,hosted}.test.mjs
are outside the three granted sender files; await exact fixture lease before apply.
