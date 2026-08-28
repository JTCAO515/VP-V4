import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { FailureCode } from "@/lib/server/contracts/errors";
import type { TurnFeedbackKind, TurnFeedbackReason } from "@/lib/server/turn/feedback/contract";

type PendingCookie = { name: string; value: string; options: CookieOptions };

export type TripSnapshot = Readonly<{ id: string; title: string; headVersion: number; updatedAt: string }>;
export type TripAudit = Readonly<{ id: string; action: string; proposalId: string; createdAt: string }>;
export type ConfirmInput = Readonly<{ proposalId: string; idempotencyKey: string; digest: string }>;
export type ProposalRevisionInput = Readonly<{ proposalId: string; title: string }>;
export type ProposalRejectInput = Readonly<{ proposalId: string }>;
export type ChatThreadSnapshot = Readonly<{ id: string; tripId: string | null; status: "active" | "archived"; createdAt: string; updatedAt: string }>;
export type ChatTurnEventHistory = Readonly<{ eventId: string; sequence: number; type: string; state: string; createdAt: string }>;
export type ChatTurnFeedback = Readonly<{ id: string; kind: TurnFeedbackKind; reason: TurnFeedbackReason; createdAt: string }>;
export type ChatTurnHistory = Readonly<{ id: string; status: string; createdAt: string; updatedAt: string; events: readonly ChatTurnEventHistory[]; feedback: readonly ChatTurnFeedback[] }>;
export type ChatThreadRead = Readonly<{ thread: ChatThreadSnapshot; turns: readonly ChatTurnHistory[] }>;
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
  const rejectPendingProposal = async (tripId: string, input: ProposalRejectInput): Promise<AdapterResult<Readonly<{ proposalId: string; status: "rejected" }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client.from("trip_proposals")
      .select("trip_id,status,expires_at")
      .eq("id", input.proposalId)
      .maybeSingle();
    if (proposalError || !proposal || proposal.trip_id !== tripId) return { error: "FORBIDDEN" };
    if (proposal.status !== "pending" || proposal.expires_at <= new Date().toISOString()) return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    const { data, error } = await client.from("trip_proposals")
      .update({ status: "rejected" })
      .eq("id", input.proposalId)
      .eq("trip_id", tripId)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle();
    if (error) return { error: "INTERNAL_ERROR" };
    if (!data || data.status !== "rejected") return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return { data: { proposalId: data.id, status: "rejected" } };
  };
  const listChatThreads = async (): Promise<AdapterResult<readonly ChatThreadSnapshot[]>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.from("chat_threads")
      .select("id,trip_id,status,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return { error: "INTERNAL_ERROR" };
    return { data: (data ?? []).map(chatThreadSnapshot) };
  };
  const createChatThread = async (tripId?: string): Promise<AdapterResult<ChatThreadSnapshot>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    if (tripId) {
      const { data: trip, error: tripError } = await client.from("trips").select("id").eq("id", tripId).maybeSingle();
      if (tripError || !trip) return { error: "FORBIDDEN" };
    }
    const { data, error } = await client.from("chat_threads")
      .insert({ owner_id: actor.data, trip_id: tripId ?? null })
      .select("id,trip_id,status,created_at,updated_at")
      .maybeSingle();
    return error || !data ? { error: "INTERNAL_ERROR" } : { data: chatThreadSnapshot(data) };
  };
  const getChatThread = async (threadId: string): Promise<AdapterResult<ChatThreadRead>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: thread, error: threadError } = await client.from("chat_threads")
      .select("id,trip_id,status,created_at,updated_at")
      .eq("id", threadId)
      .maybeSingle();
    if (threadError || !thread) return { error: "FORBIDDEN" };
    const { data: turns, error: turnsError } = await client.from("turns")
      .select("id,status,created_at,updated_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (turnsError) return { error: "INTERNAL_ERROR" };
    const turnIds = (turns ?? []).map((turn) => turn.id);
    const { data: events, error: eventsError } = turnIds.length === 0
      ? { data: [], error: null }
      : await client.from("chat_turn_events")
        .select("turn_id,event_id,sequence,event_type,state,created_at")
        .eq("thread_id", threadId)
        .order("sequence", { ascending: true });
    if (eventsError) return { error: "INTERNAL_ERROR" };
    const { data: feedback, error: feedbackError } = turnIds.length === 0
      ? { data: [], error: null }
      : await client.from("turn_feedback")
        .select("id,turn_id,feedback_kind,reason_code,created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
    if (feedbackError) return { error: "INTERNAL_ERROR" };
    const eventsByTurn = new Map<string, ChatTurnEventHistory[]>();
    for (const event of events ?? []) {
      const list = eventsByTurn.get(event.turn_id) ?? [];
      list.push({ eventId: event.event_id, sequence: event.sequence, type: event.event_type, state: event.state, createdAt: event.created_at });
      eventsByTurn.set(event.turn_id, list);
    }
    const feedbackByTurn = new Map<string, ChatTurnFeedback[]>();
    for (const item of feedback ?? []) {
      const list = feedbackByTurn.get(item.turn_id) ?? [];
      list.push({ id: item.id, kind: item.feedback_kind as TurnFeedbackKind, reason: item.reason_code as TurnFeedbackReason, createdAt: item.created_at });
      feedbackByTurn.set(item.turn_id, list);
    }
    return { data: { thread: chatThreadSnapshot(thread), turns: (turns ?? []).map((turn) => ({ id: turn.id, status: turn.status, createdAt: turn.created_at, updatedAt: turn.updated_at, events: eventsByTurn.get(turn.id) ?? [], feedback: feedbackByTurn.get(turn.id) ?? [] })) } };
  };
  const startChatTurn = async (threadId: string, input: Readonly<{ turnId: string; idempotencyKey: string; digest: string }>): Promise<AdapterResult<Readonly<{ turnId: string; reused: boolean }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("start_chat_turn", { p_thread_id: threadId, p_turn_id: input.turnId, p_idempotency_key: input.idempotencyKey, p_digest: input.digest });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.turn_id ? { data: { turnId: result.turn_id, reused: result.reused === true } } : { error: "INTERNAL_ERROR" };
  };
  const cancelChatTurn = async (turnId: string): Promise<AdapterResult<Readonly<{ sequence: number; state: "cancelled" }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: turn, error: turnError } = await client.from("turns").select("status").eq("id", turnId).maybeSingle();
    if (turnError || !turn) return { error: "FORBIDDEN" };
    if (turn.status === "cancelled") {
      const { data: prior, error: priorError } = await client.from("chat_turn_events").select("sequence,state").eq("turn_id", turnId).eq("state", "cancelled").maybeSingle();
      return priorError || !prior ? { error: "INTERNAL_ERROR" } : { data: { sequence: prior.sequence, state: "cancelled" } };
    }
    if (["completed", "proposal_ready", "unavailable", "failed"].includes(turn.status)) return { error: "CANCELLED" };
    const { data, error } = await client.rpc("cancel_chat_turn", { p_turn_id: turnId });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.state === "cancelled" && typeof result.sequence === "number" ? { data: { sequence: result.sequence, state: "cancelled" } } : { error: "INTERNAL_ERROR" };
  };
  const replayChatTurn = async (turnId: string, afterSequence: number): Promise<AdapterResult<readonly ChatTurnEventHistory[]>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: turn, error: turnError } = await client.from("turns").select("id").eq("id", turnId).maybeSingle();
    if (turnError || !turn) return { error: "FORBIDDEN" };
    const { data, error } = await client.from("chat_turn_events")
      .select("event_id,sequence,event_type,state,created_at")
      .eq("turn_id", turnId)
      .gt("sequence", afterSequence)
      .order("sequence", { ascending: true });
    if (error) return { error: "INTERNAL_ERROR" };
    return { data: (data ?? []).map((event) => ({ eventId: event.event_id, sequence: event.sequence, type: event.event_type, state: event.state, createdAt: event.created_at })) };
  };
  const recordTurnFeedback = async (turnId: string, input: Readonly<{ kind: TurnFeedbackKind; reason: TurnFeedbackReason }>): Promise<AdapterResult<Readonly<{ feedbackId: string; reused: boolean }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("record_turn_feedback", { p_turn_id: turnId, p_feedback_kind: input.kind, p_reason_code: input.reason });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.feedback_id ? { data: { feedbackId: result.feedback_id, reused: result.reused === true } } : { error: "INTERNAL_ERROR" };
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
  return { applyCookies, authenticated, getTrip, getPendingProposal, revisePendingProposal, rejectPendingProposal, listChatThreads, createChatThread, getChatThread, startChatTurn, cancelChatTurn, replayChatTurn, recordTurnFeedback, confirm };
}

function chatThreadSnapshot(input: Readonly<{ id: string; trip_id: string | null; status: string; created_at: string; updated_at: string }>): ChatThreadSnapshot {
  return { id: input.id, tripId: input.trip_id, status: input.status === "archived" ? "archived" : "active", createdAt: input.created_at, updatedAt: input.updated_at };
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
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  if (message.includes("terminal turn cannot emit events")) return "CANCELLED";
  if (message.includes("INVALID_FEEDBACK")) return "INVALID_INPUT";
  if (message.includes("NO_RESULT_TO_FEEDBACK")) return "PROPOSAL_NOT_CONFIRMABLE";
  if (message.includes("STALE_TRIP_VERSION")) return "STALE_TRIP_VERSION";
  if (message.includes("PROPOSAL_NOT_CONFIRMABLE") || message.includes("INVALID_PATCH")) return "PROPOSAL_NOT_CONFIRMABLE";
  return "INTERNAL_ERROR";
}
