import type { WikiGenerationDraftOutput } from "../../model-gateway/prompt/wiki-generation";
import type { PageType, ValidationStatus, JobStatus } from "./contract";
export type WikiPageList = { pages: { pageKey: string; pageType: PageType; version: number }[] };
export type WikiRead = {
  pageKey: string; pageType: PageType; version: number;
  revisions: {
    id: string; version: number; draftContent: WikiGenerationDraftOutput | null;
    validationStatus: ValidationStatus; changeNote: string; jobId: string;
    promptVersion: string; configDigest: string; inputDigest: string; generatedAt: string;
    sourceRevisionIds: string[]; statementRefs: string[];
    sources: { id: string; missing: boolean; snippetHash: string | null; lineageStatus: string | null;
      declaration: { publisher?: string; uri?: string; locator?: string; snippet?: string; sourceKey?: string; revisionLabel?: string } | null }[];
  }[];
  jobs: { id: string; status: JobStatus; startedAt: string | null; finishedAt: string | null; errorCode: string | null; costTokens: number | null; costUnknown: boolean }[];
};
