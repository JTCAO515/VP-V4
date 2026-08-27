import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { FailureCode } from "@/lib/server/contracts/errors";

type PendingCookie = { name: string; value: string; options: CookieOptions };

export type TripSnapshot = Readonly<{ id: string; title: string; headVersion: number; updatedAt: string }>;
export type TripAudit = Readonly<{ id: string; action: string; proposalId: string; createdAt: string }>;
export type ConfirmInput = Readonly<{ proposalId: string; idempotencyKey: string; digest: string }>;
export type ProposalRevisionInput = Readonly<{ proposalId: string; title: string }>;
export type PendingProposalRead = Readonly<{
  trip: TripSnapshot;
  proposal: Readonly<{
    id: string;
    revision: number;
    baseTripVersion: number;
    status: "pending";
    createdAt: string;
    expiresAt: string;
    titleDiff: Readonly<{ before: string; after: string }>;
    evidence: "not_recorded";
    assumptions: "not_recorded";
  }>;
}>;
type AdapterSuccess<T> = Readonly<{ data: T }>;
type AdapterFailure = Readonly<{ error: FailureCode }>;
export type AdapterResult<T> = AdapterSuccess<T> | AdapterFailure;

export function getSupabasePublicConfig(): Readonly<{ url: string; publishableKey: string }> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}

export function createUserDataAdapter(request: NextRequest) {
  const current = getSupabasePublicConfig();
  if (!current) return null;
  const pendingCookies: PendingCookie[] = [];
  const client = createServerClient(current.url, current.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { pendingCookies.push(...cookies); },
    },
  });

  const applyCookies = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  };
  const authenticated = async (): Promise<AdapterResult<string>> => {
    const { data, error } = await client.auth.getClaims();
    const subject = data?.claims?.sub;
    return error || typeof subject !== "string" ? { error: "UNAUTHENTICATED" } : { data: subject };
  };
  const getTrip = async (tripId: string): Promise<AdapterResult<Readonly<{ trip: TripSnapshot; audits: readonly TripAudit[] }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: trip, error: tripError } = await client.from("trips").select("id,title,head_version,updated_at").eq("id", tripId).maybeSingle();
    if (tripError || !trip) return { error: "FORBIDDEN" };
    const { data: audits, error: auditError } = await client.from("trip_audit_events").select("id,action,proposal_id,created_at").eq("trip_id", tripId).order("created_at", { ascending: false });
    if (auditError) return { error: "INTERNAL_ERROR" };
    return { data: {
      trip: { id: trip.id, title: trip.title, headVersion: trip.head_version, updatedAt: trip.updated_at },
      audits: (audits ?? []).map((audit) => ({ id: audit.id, action: audit.action, proposalId: audit.proposal_id, createdAt: audit.created_at })),
    } };
  };
  const getPendingProposal = async (tripId: string): Promise<AdapterResult<PendingProposalRead>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: trip, error: tripError } = await client.from("trips").select("id,title,head_version,updated_at").eq("id", tripId).maybeSingle();
    if (tripError || !trip) return { error: "FORBIDDEN" };
    const { data: proposal, error: proposalError } = await client.from("trip_proposals")
      .select("id,revision,base_trip_version,status,patch,created_at,expires_at")
      .eq("trip_id", tripId)
      .eq("status", "pending")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    const read = proposal && !proposalError ? pendingProposalRead({
      trip: { id: trip.id, title: trip.title, headVersion: trip.head_version, updatedAt: trip.updated_at },
      proposal,
    }) : null;
    return read ? { data: read } : { error: "PROPOSAL_NOT_CONFIRMABLE" };
  };
  const revisePendingProposal = async (tripId: string, input: ProposalRevisionInput): Promise<AdapterResult<Readonly<{ proposalId: string; revision: number; baseTripVersion: number }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client.from("trip_proposals")
      .select("trip_id,status")
      .eq("id", input.proposalId)
      .maybeSingle();
    if (proposalError || !proposal || proposal.trip_id !== tripId || proposal.status !== "pending") return { error: "FORBIDDEN" };
    const { data, error } = await client.rpc("revise_trip_proposal", { p_proposal_id: input.proposalId, p_title: input.title.trim() });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    if (!result) return { error: "INTERNAL_ERROR" };
    if (result.outcome === "version_conflict") return { error: "STALE_TRIP_VERSION" };
    if (result.outcome !== "revised" || !result.proposal_id || !result.revision || result.base_trip_version === null) return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return { data: { proposalId: result.proposal_id, revision: result.revision, baseTripVersion: result.base_trip_version } };
  };
  const confirm = async (tripId: string, input: ConfirmInput): Promise<AdapterResult<Readonly<{ outcome: "applied" | "already_applied"; resultingVersion: number }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client.from("trip_proposals").select("trip_id").eq("id", input.proposalId).maybeSingle();
    if (proposalError || !proposal || proposal.trip_id !== tripId) return { error: "FORBIDDEN" };
    const { data, error } = await client.rpc("confirm_and_apply_trip_proposal", {
      p_proposal_id: input.proposalId, p_idempotency_key: input.idempotencyKey, p_digest: input.digest,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    if (!result) return { error: "INTERNAL_ERROR" };
    if (result.outcome === "version_conflict") return { error: "STALE_TRIP_VERSION" };
    if (result.outcome !== "applied" && result.outcome !== "already_applied") return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return { data: { outcome: result.outcome, resultingVersion: result.resulting_version } };
  };
  return { applyCookies, authenticated, getTrip, getPendingProposal, revisePendingProposal, confirm };
}

export function pendingProposalRead(input: Readonly<{
  trip: TripSnapshot;
  proposal: Readonly<{
    id: string;
    revision: number;
    base_trip_version: number;
    status: string;
    patch: unknown;
    created_at: string;
    expires_at: string;
  }>;
}>): PendingProposalRead | null {
  const patch = input.proposal.patch;
  if (input.proposal.status !== "pending" || input.proposal.expires_at <= new Date().toISOString()) return null;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const title = (patch as { title?: unknown }).title;
  if (typeof title !== "string" || !title.trim()) return null;
  return {
    trip: input.trip,
    proposal: {
      id: input.proposal.id,
      revision: input.proposal.revision,
      baseTripVersion: input.proposal.base_trip_version,
      status: "pending",
      createdAt: input.proposal.created_at,
      expiresAt: input.proposal.expires_at,
      titleDiff: { before: input.trip.title, after: title },
      evidence: "not_recorded",
      assumptions: "not_recorded",
    },
  };
}

function mapRpcFailure(message: string): FailureCode {
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return "IDEMPOTENCY_KEY_REUSE";
  if (message.includes("STALE_TRIP_VERSION")) return "STALE_TRIP_VERSION";
  if (message.includes("PROPOSAL_NOT_CONFIRMABLE") || message.includes("INVALID_PATCH")) return "PROPOSAL_NOT_CONFIRMABLE";
  return "INTERNAL_ERROR";
}
