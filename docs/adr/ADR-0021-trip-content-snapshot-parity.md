# ADR-0021: Trip content snapshot parity

Status: accepted for LAUNCH-03/#153.

## Decision

Trip's current projection is normalized into owner-scoped `trip_days` and `trip_items` rows, while every confirmed version also retains one append-only JSON content snapshot. The snapshot contains title, Days, Items, dates, optional IANA time zones, and optional RFC3339 time windows. Old title-only snapshots are preserved and normalize to an empty Day list.

New proposal patches use the frozen `TripPatch(expectedVersion, operations)` union. The transaction locks the owner Trip, rechecks the base version, validates/applies the same closed operation vocabulary, replaces the current projection atomically, writes the next immutable snapshot/event/audit/idempotency row, and only then reports `applied`. A reused idempotency key with another digest fails; a stale or cross-owner request has no content write.

Rollback is not an arbitrary client content replacement. The rollback RPC alone writes an owner-visible `rollback_snapshot_version`; proposal RLS rejects user-supplied values for that field. Confirmation resolves that immutable snapshot under the locked owner Trip and appends a new version.

## Consequences and rollback

Authenticated users can read only their Day/Item rows and cannot directly mutate them. The two fixed confirmation/rollback functions remain the narrow, owner-checked `security definer` exception from ADR-0019. There is no production replay or data migration in this change.

Before migration execution, revert the repository change. After execution, use a reviewed forward migration; never delete Trip history, snapshots, or user content as a rollback mechanism.
