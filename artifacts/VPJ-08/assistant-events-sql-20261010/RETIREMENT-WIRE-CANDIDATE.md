# Review candidate: source retirement without deleting unrelated delivery

Not authorized or implemented in product. Original SOURCE/WIRE has a genuine conflict: exact source erasure removes an ordinal, but a cursor without a generation cannot cross that gap while preserving contiguous delivery. Denying forever blocks legitimate future tasks. Retaining erased Task/Turn/source keys violates erasure. Do not silently skip or reset.

Minimal proposed single closed union extension (Main decision required):

```
{eventId: conversationId+":"+sequence, sequence,
 type:"source_retired", retiredSequence: positive safe integer <= sequence}
```

This type has **no taskId, turnId, status, tool/state, artifactId, revision, source key, receipt ID, timestamp or reason**. Common task/turn keys apply only to the original five variants. The current actor/session/epoch/conversation authorization remains mandatory; no new stream epoch/session/identity.

In the original authorized erasure transaction, each matching original event row is scrubbed in place into this closed ordinal: task/turn/artifact/revision/status/tool/state and original discriminator/source tuple are erased; only already assigned conversation ordinal and owning conversation remain. `retiredSequence` equals its own sequence. This makes old cursor existence validation possible without retaining deleted source. Only canonical original erase guards/transaction authority can invoke the internal retirement trigger. No client writes/recovery writer/service bypass.

Also append one idempotent notification per retired ordinal in that same transaction using the current counter: source_retired at the newly allocated sequence, retiredSequence = the erased old sequence. This lets an already-acknowledged consumer erase its previously admitted hint by the old eventId. Reader from zero gets ordinal tombstones and later valid events continuously. Future deleted-anchor reconnect reads the new retirement notification and subsequent valid events. Counter allocation rollback remains atomic. Deletion of a whole conversation/account cascades both tables, so no deleted parent survives. Ordinal-only counts are private delivery bookkeeping of a retained authorized conversation, not proof a deleted source is readable.

Native must admit source_retired only as this exact union; discard cached event metadata keyed by retiredSequence; never infer a Task cancellation or billing outcome. Current exact original artifact GET remains content authority. Old resumed events cannot recreate retired source. Native cursor still advances only after complete qualified frame admission and scope fencing. SSE id continues to be the newly admitted sequence. A retirement at an original ordinal must be harmless if the same ordinal was previously consumed; the appended notification reaches that client at a later cursor.

SQL schema change from current draft: task_id/turn_id nullable only for source_kind='retired'; add retired_sequence bigint with 1<=retired_sequence<=sequence; all original source fields null for retired rows; source_key becomes only `ordinal:<sequence>` or `retirement:<retiredSequence>` (unique owner/conversation discriminator key). Original-source uniqueness must include conversation_id to permit private ordinal keys across an owner's conversations. The original source tuples remain exact and unchanged for live sources. Closed CHECK branches reject partially scrubbed rows. Internal update guard only permits source-retirement under original delete trigger, never replacement with live metadata.

Privacy integration still required: catalog recognizes both application relations; result/conversation/linked-Trip source witnesses include live index entries within their original selection scope and qualify count/CAS; scrub/notification happen only after source erase authority has locked and verified the original graph. No original parent deletion scope expands. D2 export treats the new private ordinal bookkeeping explicitly, without surfacing raw source keys or creating a new D2 scope requirement for event reads. Full actual catalog pins and original handler/hook definitions await source proof and owner release; no automatic harvested hash or namespace exclusion.

Affected sole owners: SQL candidate tables/helper/lifecycle/schema/handler; TS protocol/decoder/transport fixture and WIRE; Native strict Decoder/Projection/consumer persistence tests. No old grounded schema or old GET changes. This is proposed for Main's one batch decision before product implementation.
