# AI-09 TripPatch Golden Contract

`TripPatch` is a closed union with `expectedVersion`; arbitrary JSON Patch paths are forbidden. It supports a bounded title edit, Day upsert/delete, and Item upsert/delete. A Day has an opaque stable ID, calendar date, optional IANA time zone, and an ordered Item list. An Item has an opaque stable ID, title, parent Day, and optional RFC3339 start/end window. A title-only or title/day-only legacy snapshot remains readable; absent `items` is normalized to an empty list.

The contract rejects unknown keys, unknown operation kinds, stale versions, malformed IDs/dates/time zones/timestamps, duplicate final dates or Item IDs, missing Day references, deletion of missing records, and non-positive time windows. Patches apply in declared operation order, then normalize Day order by date/ID and Item order by ID before incrementing the snapshot version. This makes an Item create after its Day creation valid, and the inverse order invalid.

The pure TypeScript function is mirrored by the owner-confirmed SQL transaction. SQL accepts legacy `{ "title": "..." }` patches only for compatibility; all new writes carry the closed `{ expectedVersion, operations }` shape. CAS persistence, idempotency storage, audit, and proposal confirmation remain transaction ownership, rather than client authority. Full rollback uses a server-minted immutable snapshot reference; users cannot insert such a reference through the Proposal RLS policy.

Rollback: revert this contract; no database state or runtime Trip write exists.
