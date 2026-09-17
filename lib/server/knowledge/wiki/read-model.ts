import type {StructuredWikiDraft} from "./proposals";
import type { WikiGenerationDraftOutput } from "../../model-gateway/prompt/wiki-generation";
import type { PageType, ValidationStatus, JobStatus } from "./contract";
export type WikiPageList = { pages: { pageKey: string; pageType: PageType; version: number }[] };
export type WikiRead = {
  pageKey: string; pageType: PageType; version: number;
  revisions: {
    id: string; version: number; draftContent: WikiGenerationDraftOutput | StructuredWikiDraft | null;
    validationStatus: ValidationStatus; changeNote: string; jobId: string;
    promptVersion: string; configDigest: string; inputDigest: string; generatedAt: string;
    sourceRevisionIds: string[]; statementRefs: string[];
    sources: { id: string; missing: boolean; snippetHash: string | null; lineageStatus: string | null;
      withdrawnAt: string | null; withdrawnBy: string | null; withdrawalReason: string | null;
      declaration: { publisher?: string; uri?: string; locator?: string; snippet?: string; sourceKey?: string; revisionLabel?: string } | null }[];
  }[];
  jobs: { id: string; status: JobStatus; startedAt: string | null; finishedAt: string | null; errorCode: string | null; costTokens: number | null; costUnknown: boolean }[];
};
export type WithdrawnCitedSource = Readonly<{ id: string; withdrawnAt: string; withdrawnBy: string | null; withdrawalReason: string | null }>;
/** Response shape of `ops_wiki_withdrawal_scan_v1` (migration
 * 20260917110000): the automated, all-pages/all-in-flight-jobs counterpart
 * to `citedWithdrawnSources`, which only covers one already-fetched
 * revision's sources. `affectedRevisions` covers every page's current and
 * previous revision (the same two-revision scope `ops_wiki_read_v1` already
 * exposes per page); `affectedJobs` covers every `queued`/`running` job
 * whose recorded `sourceRevisionIds` (recorded at claim time only --
 * historical jobs claimed before this migration are simply absent from this
 * list, never guessed at) intersects a withdrawn source. Read-only: this
 * never hides, cancels, merges or retroactively invalidates anything it
 * reports. */
export type WikiWithdrawalScan = Readonly<{
  affectedRevisions: readonly Readonly<{ pageKey: string; pageType: PageType; version: number; revisionId: string; withdrawnSourceIds: readonly string[] }>[];
  affectedJobs: readonly Readonly<{ jobId: string; pageKey: string; status: JobStatus; startedAt: string | null; withdrawnSourceIds: readonly string[] }>[];
}>;
/** Pure, derived entirely from fields `ops_wiki_read_v1` already returns on every
 * revision's `sources[]` since migration 20260917100000 -- no new migration, RPC
 * or fetch. Surfaces, for one already-generated revision, which of ITS cited
 * sources have SINCE been withdrawn, so `/ops/wiki` can flag this prominently at
 * the revision level (next to its validation status) instead of only inside the
 * per-source note buried in the collapsed "Sources and original location"
 * details block. This is the read-only "cascading" half named as an explicit gap
 * in artifacts/VPJ-75/unrun.md ("no cascading revocation of a wiki_page_revisions
 * row that already cites a source withdrawn after that revision was created") --
 * it only MARKS the correlation for a human reviewer; it never hides, merges,
 * blocks any existing action, or retroactively invalidates the revision itself,
 * matching docs/contracts/wiki-source-withdrawal.md's "no cascading revocation"
 * boundary. Order-preserving; returns an empty array (not null/undefined) when
 * no cited source is withdrawn. */
export function citedWithdrawnSources(sources: WikiRead["revisions"][number]["sources"]): readonly WithdrawnCitedSource[] {
  const withdrawn: WithdrawnCitedSource[] = [];
  for (const s of sources) {
    if (s.withdrawnAt !== null) withdrawn.push({ id: s.id, withdrawnAt: s.withdrawnAt, withdrawnBy: s.withdrawnBy, withdrawalReason: s.withdrawalReason });
  }
  return withdrawn;
}
