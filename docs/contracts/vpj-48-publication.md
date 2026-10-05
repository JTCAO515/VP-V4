# VPJ-48 J3 / VPJ-64 J4 controlled experiences

The `community-publication-j3j4/1` protocol extends the existing authenticated
`community_workspace(jsonb)` entry without exposing private tables. The canonical
wire and SQL ownership are [WIRE.md](../../lib/server/community/publication/WIRE.md).
J1's `published` status remains internal approval. It grants neither reading nor
publication rights on its own.

An author reads the current exact source preview, explicitly consents to controlled
registered display and declares ownership of this text. A separately qualified
reviewer records the basis for reviewing that limited declaration; a qualified
publisher independently publishes the exact source, safety and publication revision.
An unknown or inapplicable rights basis cannot publish. These labels express an
author declaration and independent review, not a third-party licence or legal guarantee.
Current qualifications and the original J1 review conflict marker survive anonymization
as minimal denial fences. No authority comes from client affiliation or metadata.

Only an existing lawful J2 reader may read the list, search or detail. Each operation
rechecks source, safety, rights, publication revision and reader grant/current TTL.
Anonymous/global public audiences and knowledge retrieval remain disabled. Native
and Ops configuration for this implementation accepts a local owned fixture only;
no deployment flag, role, GRANT, Storage, provider, credentials policy or real-user
configuration is changed by code delivery.

Saving creates an owner-bound identifier and exact version reference, never a body
snapshot. Reopening it resolves the current source or returns unavailable with no
content. Search, saved items, old URLs, operation recovery and resumed UI all use the
same currentness gate. Client content stays in memory and clears on expiry, lifecycle
or identity change. A terminal publication never republishes through source restoration
or rights re-enrollment; old saved references never silently bind another revision.

If a current original canonical mapping exists, the experience exposes only canonical
ID, mapping digest and optional honest label. The user must independently choose
the matching current saved place in their own Trip. The original place Save and
TripProposal diff/explicit Confirm perform those actions. Experience publication/save
never writes the Trip or promotes a Fact. Source invalidation changes source display;
the user's already confirmed plan remains theirs and is not automatically removed.

Every mutation uses a current ordinary actor/session/epoch and an exact-byte digest
fence. Ordinary payload limits are 24,000 UTF8 bytes/10,000 UTF16 units. Recovery has
49,152 outer bytes and preserves those original inner limits. Ambiguous transport,
expired returned save body, mismatched decode or postdispatch identity change returns
`PUBLICATION_ACK_UNKNOWN`; the journal preserves the same operation until an explicit
query/abandon confirms it. A denial of an unknown retry does not erase its journal.

The scoped export/delete inventory includes own declarations and consent, publications,
authored rights-review notes, qualification, saved references, receipts and audit
metadata. Export excludes foreign content/identities and includes retained own notes
on foreign publication records. Each collection uses a 101-row sentinel and fails
capacity instead of truncating a complete export. Exported references contain no
experience bodies and grant no display authority. Deletion invalidates publications
that rely on erased rights and preserves minimal operation/publication/reference
tombstones and audit metadata. Original J1/J2 exits remain separate. Unified account
export/delete is explicitly `not_enrolled`, not complete.

The implementation supplies no private messages, follows or infinite social feed.
Its bounded pages have explicit manual cursors. Target activation, real provider and
Storage evidence, human/device acceptance and unified account exit remain separately
reported. Scoped fixtures, local tests and a PR are not evidence of external publication.
