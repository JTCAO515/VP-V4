import { isSourcedCandidateInput, type SourcedCandidateInput, type SourcedCandidateRead } from "./source-assertion.ts";
export type OpsCandidate = Readonly<{
  id: string; authorId: string; title: string; content: string;
  status: "pending" | "reviewed" | "rejected"; version: number;
  reviewerId: string | null; reviewNote: string | null; createdAt: string; reviewedAt: string | null;
  published: false; retrievalEligible: false;
  structured?: SourcedCandidateRead;
  audit: readonly { id: string; actorId: string; action: "submitted" | "reviewed" | "rejected"; version: number; createdAt: string }[];
}>;
export type OpsWorkspace = Readonly<{ actorId: string; candidates: readonly OpsCandidate[] }>;
export type OpsInput = SourcedCandidateInput | { action: "submit"; operationId: string; candidateId: string; title: string; content: string }
  | { action: "review"; operationId: string; candidateId: string; expectedVersion: 1; decision: "reviewed" | "rejected"; note: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isOpsInput(value: unknown): value is OpsInput {
  if (isSourcedCandidateInput(value)) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.operationId !== "string" || !uuid.test(v.operationId) || typeof v.candidateId !== "string" || !uuid.test(v.candidateId)) return false;
  const bounded = (text: unknown, limit: number) => typeof text === "string" && text.trim().length > 0 && text.length <= limit;
  return (v.action === "submit" && Object.keys(v).length === 5 && bounded(v.title, 160) && bounded(v.content, 4000))
    || (v.action === "review" && Object.keys(v).length === 6 && v.expectedVersion === 1 && (v.decision === "reviewed" || v.decision === "rejected") && bounded(v.note, 400));
}
export function opsLocalConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV || env.OPS_LOCAL_REVIEW !== "1" || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { url: url.origin, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  } catch { return null; }
}

/** Deployment configuration selects the database; request headers never select authority. */
export function opsRuntimeConfig(request: Pick<Request, "url">, env: NodeJS.ProcessEnv = process.env) {
  if (env.OPS_STAGING_REVIEW !== "1") return opsLocalConfig(env);
  const host = env.VERCEL_URL;
  if (env.OPS_LOCAL_REVIEW === "1" || env.VERCEL_ENV !== "preview" || !host
      || !/^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$/.test(host)
      || env.NEXT_PUBLIC_SUPABASE_URL !== "https://dzqdzetcctkhbrhlxxgn.supabase.co"
      || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const url = new URL(request.url);
    const custom = "https://staging.go2china.space";
    const allowed = url.origin === `https://${host}`
      || (env.OPS_STAGING_CUSTOM_ORIGIN === custom && url.origin === custom);
    if (!allowed || url.username || url.password) return null;
    return { url: env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  } catch { return null; }
}
