import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { FailureCode } from "@/lib/server/contracts/errors";
import type {
  TurnFeedbackKind,
  TurnFeedbackReason,
} from "@/lib/server/turn/feedback/contract";
import type { TripPlaceReference } from "@/lib/server/trip/place/contract";
import type { TripActionReference } from "@/lib/server/trip/actions/contract";
import type { PrivacyRequest } from "@/lib/server/privacy/contract";
import type { TripPatch } from "@/lib/server/trip/patch/contract";
import { assertTripPatch, type TripSnapshot as TripContentSnapshot } from "../trip/patch/contract.ts";
import { describeProposalDiff, type ProposalDayDiff } from "../trip/proposal/diff.ts";

type PendingCookie = { name: string; value: string; options: CookieOptions };

export type TripSnapshot = Readonly<{
  id: string;
  title: string;
  headVersion: number;
  updatedAt: string;
}>;
export type TripAudit = Readonly<{
  id: string;
  action: string;
  proposalId: string;
  createdAt: string;
}>;
export type MemoryConsumerReceiptRead = Readonly<{
  memoryId: string;
  sourceReceiptId: string;
  constraintKind: "preference" | "hard_constraint";
}>;
export type MemoryImpactRead = Readonly<{
  consumerKind: "turn" | "proposal";
  consumerId: string;
  sourceReceiptId: string;
  constraintKind: "preference" | "hard_constraint";
  createdAt: string;
}>;
export type MemoryProfileRead = Readonly<{
  id: string;
  state:
    | "explicit"
    | "confirmed"
    | "inferred"
    | "rejected"
    | "paused"
    | "deleted";
  constraintKind: "preference" | "hard_constraint";
  summary: string | null;
  sourceReceiptId: string;
  consentId: string;
  consentStatus: "granted" | "revoked";
  createdAt: string;
  updatedAt: string;
  impacts: readonly MemoryImpactRead[];
}>;
export type UserProfileRead = Readonly<{
  displayName: string;
  travelPace: "relaxed" | "balanced" | "packed";
  locale: "zh" | "en" | "es" | "ru" | "ar";
  currency: "CNY" | "USD" | "EUR" | "RUB" | "SAR";
  distanceUnit: "kilometre" | "mile";
  temperatureUnit: "celsius" | "fahrenheit";
  defaultDepartureTime: string;
  updatedAt: string;
}>;
export type PrivacyRequestRead = Readonly<{
  requestId: string;
  action: "export" | "delete";
  status: "requested";
  execution: "not_started";
  createdAt: string;
}>;
export type TripVersion = Readonly<{
  id: string;
  resultingVersion: number;
  proposalId: string | null;
  eventType: "initial" | "proposal_applied";
  title: string | null;
  createdAt: string;
  memoryReceipts: readonly MemoryConsumerReceiptRead[];
}>;
export type ConfirmInput = Readonly<{
  proposalId: string;
  idempotencyKey: string;
  digest: string;
}>;
export type TripCreateInput = Readonly<{ tripId: string; title: string }>;
export type TripProposalInput = Readonly<{ patch: TripPatch }>;
export type ProposalRevisionInput = Readonly<{
  proposalId: string;
  title: string;
}>;
export type ProposalRejectInput = Readonly<{ proposalId: string }>;
export type ChatThreadSnapshot = Readonly<{
  id: string;
  tripId: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}>;
export type ChatTurnEventHistory = Readonly<{
  eventId: string;
  sequence: number;
  type: string;
  state: string;
  createdAt: string;
}>;
export type ChatTurnFeedback = Readonly<{
  id: string;
  kind: TurnFeedbackKind;
  reason: TurnFeedbackReason;
  createdAt: string;
}>;
export type ChatTurnHistory = Readonly<{
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  events: readonly ChatTurnEventHistory[];
  feedback: readonly ChatTurnFeedback[];
  memoryReceipts: readonly MemoryConsumerReceiptRead[];
}>;
export type ChatThreadRead = Readonly<{
  thread: ChatThreadSnapshot;
  turns: readonly ChatTurnHistory[];
}>;
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
    dayDiffs?: readonly ProposalDayDiff[];
    patch?: TripPatch;
    evidence: "not_recorded";
    assumptions: "not_recorded";
  }>;
}>;
type AdapterSuccess<T> = Readonly<{ data: T }>;
type AdapterFailure = Readonly<{ error: FailureCode }>;
export type AdapterResult<T> = AdapterSuccess<T> | AdapterFailure;

export function getSupabasePublicConfig(): Readonly<{
  url: string;
  publishableKey: string;
}> | null {
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
      setAll: (cookies) => {
        pendingCookies.push(...cookies);
      },
    },
  });

  const applyCookies = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
    return response;
  };
  const authenticated = async (): Promise<AdapterResult<string>> => {
    const { data, error } = await client.auth.getClaims();
    const subject = data?.claims?.sub;
    return error || typeof subject !== "string"
      ? { error: "UNAUTHENTICATED" }
      : { data: subject };
  };
  const getUserProfile = async (): Promise<
    AdapterResult<UserProfileRead | null>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client
      .from("user_profiles")
      .select(
        "display_name,travel_pace,locale,currency,distance_unit,temperature_unit,default_departure_time,updated_at",
      )
      .maybeSingle();
    if (error) return { error: "INTERNAL_ERROR" };
    if (!data) return { data: null };
    return {
      data: {
        displayName: data.display_name ?? "",
        travelPace: data.travel_pace,
        locale: data.locale,
        currency: data.currency,
        distanceUnit: data.distance_unit,
        temperatureUnit: data.temperature_unit,
        defaultDepartureTime: String(data.default_departure_time).slice(0, 5),
        updatedAt: data.updated_at,
      } as UserProfileRead,
    };
  };
  const saveUserProfile = async (
    input: Omit<UserProfileRead, "updatedAt">,
  ): Promise<AdapterResult<UserProfileRead>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { error } = await client.rpc("save_user_profile", {
      p_display_name: input.displayName,
      p_travel_pace: input.travelPace,
      p_locale: input.locale,
      p_currency: input.currency,
      p_distance_unit: input.distanceUnit,
      p_temperature_unit: input.temperatureUnit,
      p_default_departure_time: input.defaultDepartureTime,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const read = await getUserProfile();
    if ("error" in read || read.data === null)
      return { error: "INTERNAL_ERROR" };
    return { data: read.data };
  };
  const listPrivacyRequests = async (): Promise<
    AdapterResult<readonly PrivacyRequestRead[]>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client
      .from("privacy_requests")
      .select("id,action,status,execution_state,created_at")
      .order("created_at", { ascending: false });
    if (error) return { error: "INTERNAL_ERROR" };
    return {
      data: (data ?? []).flatMap((request): PrivacyRequestRead[] =>
        (request.action === "export" || request.action === "delete") &&
        request.status === "requested" &&
        request.execution_state === "not_started"
          ? [{
              requestId: request.id,
              action: request.action,
              status: "requested",
              execution: "not_started",
              createdAt: request.created_at,
            }]
          : [],
      ),
    };
  };
  const requestPrivacyAction = async (
    input: PrivacyRequest,
  ): Promise<AdapterResult<PrivacyRequestRead>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("request_privacy_action", {
      p_request_id: input.requestId,
      p_action: input.action,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.request_id === input.requestId &&
      result.action === input.action &&
      result.status === "requested" &&
      result.execution_state === "not_started" &&
      typeof result.created_at === "string"
      ? {
          data: {
            requestId: result.request_id,
            action: result.action,
            status: "requested",
            execution: "not_started",
            createdAt: result.created_at,
          },
        }
      : { error: "INTERNAL_ERROR" };
  };
  const listMemoryProfiles = async (): Promise<
    AdapterResult<readonly MemoryProfileRead[]>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: profiles, error: profileError } = await client
      .from("memory_profiles")
      .select(
        "id,state,constraint_kind,summary,source_receipt_id,consent_id,created_at,updated_at",
      )
      .order("updated_at", { ascending: false });
    if (profileError) return { error: "INTERNAL_ERROR" };
    const { data: consents, error: consentError } = await client
      .from("memory_consents")
      .select("id,status");
    if (consentError) return { error: "INTERNAL_ERROR" };
    const profileIds = (profiles ?? []).map((profile) => profile.id);
    const { data: impacts, error: impactError } =
      profileIds.length === 0
        ? { data: [], error: null }
        : await client
            .from("memory_consumer_receipts")
            .select(
              "memory_id,source_receipt_id,consumer_kind,turn_id,proposal_id,constraint_kind,created_at",
            )
            .in("memory_id", profileIds)
            .order("created_at", { ascending: false });
    if (impactError) return { error: "INTERNAL_ERROR" };
    const consentStatusById = new Map(
      (consents ?? []).map((consent) => [
        consent.id,
        consent.status === "granted"
          ? ("granted" as const)
          : ("revoked" as const),
      ]),
    );
    const impactsByMemory = new Map<string, MemoryImpactRead[]>();
    for (const impact of impacts ?? []) {
      const consumerId =
        impact.consumer_kind === "turn" ? impact.turn_id : impact.proposal_id;
      if (
        (impact.consumer_kind !== "turn" &&
          impact.consumer_kind !== "proposal") ||
        typeof consumerId !== "string"
      )
        continue;
      const list = impactsByMemory.get(impact.memory_id) ?? [];
      list.push({
        consumerKind: impact.consumer_kind,
        consumerId,
        sourceReceiptId: impact.source_receipt_id,
        constraintKind:
          impact.constraint_kind === "hard_constraint"
            ? "hard_constraint"
            : "preference",
        createdAt: impact.created_at,
      });
      impactsByMemory.set(impact.memory_id, list);
    }
    return {
      data: (profiles ?? []).flatMap((profile): MemoryProfileRead[] => {
        const state = memoryState(profile.state);
        const consentStatus = consentStatusById.get(profile.consent_id);
        if (
          !state ||
          !consentStatus ||
          (profile.constraint_kind !== "preference" &&
            profile.constraint_kind !== "hard_constraint")
        )
          return [];
        return [
          {
            id: profile.id,
            state,
            constraintKind: profile.constraint_kind,
            summary:
              typeof profile.summary === "string" ? profile.summary : null,
            sourceReceiptId: profile.source_receipt_id,
            consentId: profile.consent_id,
            consentStatus,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
            impacts: impactsByMemory.get(profile.id) ?? [],
          },
        ];
      }),
    };
  };
  const setMemoryConsent = async (
    input:
      | Readonly<{ action: "create" }>
      | Readonly<{ consentId: string; action: "grant" | "revoke" }>,
  ): Promise<
    AdapterResult<
      Readonly<{
        consentId: string;
        status: "granted" | "revoked";
        reused: boolean;
      }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = input.action === "create"
      ? await client.rpc("create_memory_retrieval_consent")
      : await client.rpc(
          input.action === "grant"
            ? "grant_memory_retrieval_consent"
            : "revoke_memory_retrieval_consent",
          { p_consent_id: input.consentId },
        );
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    const status =
      result?.status === "granted"
        ? "granted"
        : result?.status === "revoked"
          ? "revoked"
          : null;
    return result?.consent_id && status
      ? {
          data: {
            consentId: result.consent_id,
            status,
            reused: result.reused === true,
          },
        }
      : { error: "INTERNAL_ERROR" };
  };
  const createExplicitMemory = async (
    input: Readonly<{
      memoryId: string;
      receiptId: string;
      consentId: string;
      constraintKind: "preference" | "hard_constraint";
      summary: string;
    }>,
  ): Promise<
    AdapterResult<
      Readonly<{ memoryId: string; state: "explicit"; reused: boolean }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("create_explicit_memory_profile", {
      p_memory_id: input.memoryId,
      p_receipt_id: input.receiptId,
      p_consent_id: input.consentId,
      p_constraint_kind: input.constraintKind,
      p_summary: input.summary.trim(),
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.memory_id && result.state === "explicit"
      ? {
          data: {
            memoryId: result.memory_id,
            state: "explicit",
            reused: result.reused === true,
          },
        }
      : { error: "INTERNAL_ERROR" };
  };
  const transitionMemory = async (
    memoryId: string,
    state: "explicit" | "confirmed" | "rejected" | "paused" | "deleted",
  ): Promise<
    AdapterResult<
      Readonly<{
        memoryId: string;
        state: MemoryProfileRead["state"];
        reused: boolean;
      }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("transition_memory_profile", {
      p_memory_id: memoryId,
      p_next_state: state,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    const nextState = memoryState(result?.state);
    return result?.memory_id && nextState
      ? {
          data: {
            memoryId: result.memory_id,
            state: nextState,
            reused: result.reused === true,
          },
        }
      : { error: "INTERNAL_ERROR" };
  };
  const listTrips = async (
    limit: number,
  ): Promise<AdapterResult<readonly TripSnapshot[]>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client
      .from("trips")
      .select("id,title,head_version,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) return { error: "INTERNAL_ERROR" };
    return { data: (data ?? []).map(tripSnapshot) };
  };
  const createTrip = async (
    input: TripCreateInput,
  ): Promise<AdapterResult<Readonly<{ trip: TripSnapshot; reused: boolean }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const title = input.title.trim();
    const existing = await client
      .from("trips")
      .select("id,title,head_version,updated_at")
      .eq("id", input.tripId)
      .maybeSingle();
    if (existing.error) return { error: "INTERNAL_ERROR" };
    if (existing.data) {
      return existing.data.title === title
        ? { data: { trip: tripSnapshot(existing.data), reused: true } }
        : { error: "IDEMPOTENCY_KEY_REUSE" };
    }
    const created = await client
      .from("trips")
      .insert({ id: input.tripId, owner_id: actor.data, title })
      .select("id,title,head_version,updated_at")
      .maybeSingle();
    if (!created.error && created.data) {
      return { data: { trip: tripSnapshot(created.data), reused: false } };
    }
    const retried = await client
      .from("trips")
      .select("id,title,head_version,updated_at")
      .eq("id", input.tripId)
      .maybeSingle();
    if (retried.error) return { error: "INTERNAL_ERROR" };
    if (retried.data && retried.data.title === title) {
      return { data: { trip: tripSnapshot(retried.data), reused: true } };
    }
    return { error: "IDEMPOTENCY_KEY_REUSE" };
  };
  const getTrip = async (
    tripId: string,
  ): Promise<
    AdapterResult<
      Readonly<{
        trip: TripSnapshot;
        audits: readonly TripAudit[];
        versions: readonly TripVersion[];
      }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: trip, error: tripError } = await client
      .from("trips")
      .select("id,title,head_version,updated_at")
      .eq("id", tripId)
      .maybeSingle();
    if (tripError || !trip) return { error: "FORBIDDEN" };
    const { data: audits, error: auditError } = await client
      .from("trip_audit_events")
      .select("id,action,proposal_id,created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    if (auditError) return { error: "INTERNAL_ERROR" };
    const { data: versions, error: versionError } = await client
      .from("trip_events")
      .select("id,resulting_version,proposal_id,event_type,created_at")
      .eq("trip_id", tripId)
      .order("resulting_version", { ascending: false });
    if (versionError) return { error: "INTERNAL_ERROR" };
    const { data: snapshots, error: snapshotError } = await client
      .from("trip_version_snapshots")
      .select("version,title,created_at")
      .eq("trip_id", tripId);
    if (snapshotError) return { error: "INTERNAL_ERROR" };
    const proposalIds = (versions ?? []).flatMap((version) =>
      version.proposal_id ? [version.proposal_id] : [],
    );
    const { data: memoryReceipts, error: memoryReceiptsError } =
      proposalIds.length === 0
        ? { data: [], error: null }
        : await client
            .from("memory_consumer_receipts")
            .select("proposal_id,memory_id,source_receipt_id,constraint_kind")
            .eq("consumer_kind", "proposal")
            .in("proposal_id", proposalIds);
    if (memoryReceiptsError) return { error: "INTERNAL_ERROR" };
    const memoryReceiptsByProposal = new Map<
      string,
      MemoryConsumerReceiptRead[]
    >();
    for (const receipt of memoryReceipts ?? []) {
      if (!receipt.proposal_id) continue;
      const list = memoryReceiptsByProposal.get(receipt.proposal_id) ?? [];
      list.push({
        memoryId: receipt.memory_id,
        sourceReceiptId: receipt.source_receipt_id,
        constraintKind:
          receipt.constraint_kind === "hard_constraint"
            ? "hard_constraint"
            : "preference",
      });
      memoryReceiptsByProposal.set(receipt.proposal_id, list);
    }
    const snapshotsByVersion = new Map(
      (snapshots ?? []).map((snapshot) => [snapshot.version, snapshot]),
    );
    return {
      data: {
        trip: tripSnapshot(trip),
        audits: (audits ?? []).map((audit) => ({
          id: audit.id,
          action: audit.action,
          proposalId: audit.proposal_id,
          createdAt: audit.created_at,
        })),
        versions: [
          ...(versions ?? []).map((version) => ({
            id: version.id,
            resultingVersion: version.resulting_version,
            proposalId: version.proposal_id,
            eventType: "proposal_applied" as const,
            title:
              snapshotsByVersion.get(version.resulting_version)?.title ?? null,
            createdAt: version.created_at,
            memoryReceipts: version.proposal_id
              ? (memoryReceiptsByProposal.get(version.proposal_id) ?? [])
              : [],
          })),
          ...(snapshotsByVersion.has(0) &&
          !(versions ?? []).some((version) => version.resulting_version === 0)
            ? [
                {
                  id: `initial-${trip.id}`,
                  resultingVersion: 0,
                  proposalId: null,
                  eventType: "initial" as const,
                  title: snapshotsByVersion.get(0)?.title ?? null,
                  createdAt:
                    snapshotsByVersion.get(0)?.created_at ?? trip.updated_at,
                  memoryReceipts: [],
                },
              ]
            : []),
        ].sort((left, right) => right.resultingVersion - left.resultingVersion),
      },
    };
  };
  const getTripPlaces = async (
    tripId: string,
  ): Promise<AdapterResult<readonly TripPlaceReference[]>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: trip, error: tripError } = await client
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .maybeSingle();
    if (tripError || !trip) return { error: "FORBIDDEN" };
    const { data, error } = await client
      .from("trip_place_references")
      .select(
        "id,reference_kind,canonical_poi_id,user_label,freshness,created_at",
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    if (error) return { error: "INTERNAL_ERROR" };
    return {
      data: (data ?? []).map((place) =>
        place.reference_kind === "canonical"
          ? {
              id: place.id,
              kind: "canonical" as const,
              canonicalPoiId: place.canonical_poi_id,
              freshness:
                place.freshness === "recheck_required"
                  ? ("recheck_required" as const)
                  : ("current" as const),
              createdAt: place.created_at,
            }
          : {
              id: place.id,
              kind: "user" as const,
              label: place.user_label,
              freshness:
                place.freshness === "recheck_required"
                  ? ("recheck_required" as const)
                  : ("current" as const),
              createdAt: place.created_at,
            },
      ),
    };
  };
  const getTripActions = async (
    tripId: string,
  ): Promise<AdapterResult<readonly TripActionReference[]>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: trip, error: tripError } = await client
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .maybeSingle();
    if (tripError || !trip) return { error: "FORBIDDEN" };
    const { data, error } = await client
      .from("trip_action_references")
      .select(
        "id,action_kind,source_kind,action_status,label,external_link_url",
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    if (error) return { error: "INTERNAL_ERROR" };
    return {
      data: (data ?? []).map((action) => ({
        id: action.id,
        kind: action.action_kind as TripActionReference["kind"],
        source: "trip" as const,
        status: action.action_status as TripActionReference["status"],
        label: action.label,
        externalLinkUrl: action.external_link_url,
      })),
    };
  };
  const getPendingProposal = async (
    tripId: string,
  ): Promise<AdapterResult<PendingProposalRead>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: trip, error: tripError } = await client
      .from("trips")
      .select("id,title,head_version,updated_at")
      .eq("id", tripId)
      .maybeSingle();
    if (tripError || !trip) return { error: "FORBIDDEN" };
    const { data: proposal, error: proposalError } = await client
      .from("trip_proposals")
      .select(
        "id,revision,base_trip_version,status,patch,created_at,expires_at",
      )
      .eq("trip_id", tripId)
      .eq("status", "pending")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: days, error: daysError } = await client
      .from("trip_days").select("day_id,trip_date,time_zone").eq("trip_id", tripId);
    if (daysError) return { error: "INTERNAL_ERROR" };
    const { data: items, error: itemsError } = await client
      .from("trip_items").select("item_id,day_id,title,starts_at,ends_at").eq("trip_id", tripId);
    if (itemsError) return { error: "INTERNAL_ERROR" };
    const read =
      proposal && !proposalError
        ? pendingProposalRead({
            trip: {
              id: trip.id,
              title: trip.title,
              headVersion: trip.head_version,
              updatedAt: trip.updated_at,
            },
            proposal,
            content: {
              version: trip.head_version,
              title: trip.title,
              days: (days ?? []).map((day) => ({ id: day.day_id, date: day.trip_date, ...(day.time_zone ? { timeZone: day.time_zone } : {}), items: (items ?? []).filter((item) => item.day_id === day.day_id).map((item) => ({ id: item.item_id, dayId: item.day_id, title: item.title, ...(item.starts_at ? { startsAt: item.starts_at } : {}), ...(item.ends_at ? { endsAt: item.ends_at } : {}) })) })),
            },
          })
        : null;
    return read ? { data: read } : { error: "PROPOSAL_NOT_CONFIRMABLE" };
  };
  const createPendingProposal = async (tripId: string, input: TripProposalInput): Promise<AdapterResult<Readonly<{ proposalId: string; revision: number; baseTripVersion: number }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("create_trip_proposal_patch", { p_trip_id: tripId, p_patch: input.patch });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    if (!result?.proposal_id || !Number.isInteger(result.revision) || !Number.isInteger(result.base_trip_version)) return { error: "INTERNAL_ERROR" };
    return { data: { proposalId: result.proposal_id, revision: result.revision, baseTripVersion: result.base_trip_version } };
  };
  const revisePendingProposal = async (
    tripId: string,
    input: ProposalRevisionInput,
  ): Promise<
    AdapterResult<
      Readonly<{
        proposalId: string;
        revision: number;
        baseTripVersion: number;
      }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client
      .from("trip_proposals")
      .select("trip_id,status")
      .eq("id", input.proposalId)
      .maybeSingle();
    if (
      proposalError ||
      !proposal ||
      proposal.trip_id !== tripId ||
      proposal.status !== "pending"
    )
      return { error: "FORBIDDEN" };
    const { data, error } = await client.rpc("revise_trip_proposal", {
      p_proposal_id: input.proposalId,
      p_title: input.title.trim(),
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    if (!result) return { error: "INTERNAL_ERROR" };
    if (result.outcome === "version_conflict")
      return { error: "STALE_TRIP_VERSION" };
    if (
      result.outcome !== "revised" ||
      !result.proposal_id ||
      !result.revision ||
      result.base_trip_version === null
    )
      return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return {
      data: {
        proposalId: result.proposal_id,
        revision: result.revision,
        baseTripVersion: result.base_trip_version,
      },
    };
  };
  const revisePendingProposalPatch = async (tripId: string, input: Readonly<{ proposalId: string; patch: TripPatch }>): Promise<AdapterResult<Readonly<{ proposalId: string; revision: number; baseTripVersion: number }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client.from("trip_proposals").select("trip_id,status").eq("id", input.proposalId).maybeSingle();
    if (proposalError || !proposal || proposal.trip_id !== tripId || proposal.status !== "pending") return { error: "FORBIDDEN" };
    const { data, error } = await client.rpc("revise_trip_proposal_patch", { p_proposal_id: input.proposalId, p_patch: input.patch });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    if (result?.outcome === "version_conflict") return { error: "STALE_TRIP_VERSION" };
    if (result?.outcome !== "revised" || !result.proposal_id || !Number.isInteger(result.revision) || !Number.isInteger(result.base_trip_version)) return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return { data: { proposalId: result.proposal_id, revision: result.revision, baseTripVersion: result.base_trip_version } };
  };
  const rejectPendingProposal = async (
    tripId: string,
    input: ProposalRejectInput,
  ): Promise<
    AdapterResult<Readonly<{ proposalId: string; status: "rejected" }>>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client
      .from("trip_proposals")
      .select("trip_id,status,expires_at")
      .eq("id", input.proposalId)
      .maybeSingle();
    if (proposalError || !proposal || proposal.trip_id !== tripId)
      return { error: "FORBIDDEN" };
    if (
      proposal.status !== "pending" ||
      proposal.expires_at <= new Date().toISOString()
    )
      return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    const { data, error } = await client
      .from("trip_proposals")
      .update({ status: "rejected" })
      .eq("id", input.proposalId)
      .eq("trip_id", tripId)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle();
    if (error) return { error: "INTERNAL_ERROR" };
    if (!data || data.status !== "rejected")
      return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return { data: { proposalId: data.id, status: "rejected" } };
  };
  const listChatThreads = async (): Promise<
    AdapterResult<readonly ChatThreadSnapshot[]>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client
      .from("chat_threads")
      .select("id,trip_id,status,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return { error: "INTERNAL_ERROR" };
    return { data: (data ?? []).map(chatThreadSnapshot) };
  };
  const createChatThread = async (
    tripId?: string,
  ): Promise<AdapterResult<ChatThreadSnapshot>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    if (tripId) {
      const { data: trip, error: tripError } = await client
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .maybeSingle();
      if (tripError || !trip) return { error: "FORBIDDEN" };
    }
    const { data, error } = await client
      .from("chat_threads")
      .insert({ owner_id: actor.data, trip_id: tripId ?? null })
      .select("id,trip_id,status,created_at,updated_at")
      .maybeSingle();
    return error || !data
      ? { error: "INTERNAL_ERROR" }
      : { data: chatThreadSnapshot(data) };
  };
  const getChatThread = async (
    threadId: string,
  ): Promise<AdapterResult<ChatThreadRead>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: thread, error: threadError } = await client
      .from("chat_threads")
      .select("id,trip_id,status,created_at,updated_at")
      .eq("id", threadId)
      .maybeSingle();
    if (threadError || !thread) return { error: "FORBIDDEN" };
    const { data: turns, error: turnsError } = await client
      .from("turns")
      .select("id,status,created_at,updated_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (turnsError) return { error: "INTERNAL_ERROR" };
    const turnIds = (turns ?? []).map((turn) => turn.id);
    const { data: events, error: eventsError } =
      turnIds.length === 0
        ? { data: [], error: null }
        : await client
            .from("chat_turn_events")
            .select("turn_id,event_id,sequence,event_type,state,created_at")
            .eq("thread_id", threadId)
            .order("sequence", { ascending: true });
    if (eventsError) return { error: "INTERNAL_ERROR" };
    const { data: feedback, error: feedbackError } =
      turnIds.length === 0
        ? { data: [], error: null }
        : await client
            .from("turn_feedback")
            .select("id,turn_id,feedback_kind,reason_code,created_at")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: true });
    if (feedbackError) return { error: "INTERNAL_ERROR" };
    const { data: memoryReceipts, error: memoryReceiptsError } =
      turnIds.length === 0
        ? { data: [], error: null }
        : await client
            .from("memory_consumer_receipts")
            .select("turn_id,memory_id,source_receipt_id,constraint_kind")
            .eq("consumer_kind", "turn")
            .in("turn_id", turnIds);
    if (memoryReceiptsError) return { error: "INTERNAL_ERROR" };
    const eventsByTurn = new Map<string, ChatTurnEventHistory[]>();
    for (const event of events ?? []) {
      const list = eventsByTurn.get(event.turn_id) ?? [];
      list.push({
        eventId: event.event_id,
        sequence: event.sequence,
        type: event.event_type,
        state: event.state,
        createdAt: event.created_at,
      });
      eventsByTurn.set(event.turn_id, list);
    }
    const feedbackByTurn = new Map<string, ChatTurnFeedback[]>();
    for (const item of feedback ?? []) {
      const list = feedbackByTurn.get(item.turn_id) ?? [];
      list.push({
        id: item.id,
        kind: item.feedback_kind as TurnFeedbackKind,
        reason: item.reason_code as TurnFeedbackReason,
        createdAt: item.created_at,
      });
      feedbackByTurn.set(item.turn_id, list);
    }
    const memoryReceiptsByTurn = new Map<string, MemoryConsumerReceiptRead[]>();
    for (const receipt of memoryReceipts ?? []) {
      if (!receipt.turn_id) continue;
      const list = memoryReceiptsByTurn.get(receipt.turn_id) ?? [];
      list.push({
        memoryId: receipt.memory_id,
        sourceReceiptId: receipt.source_receipt_id,
        constraintKind:
          receipt.constraint_kind === "hard_constraint"
            ? "hard_constraint"
            : "preference",
      });
      memoryReceiptsByTurn.set(receipt.turn_id, list);
    }
    return {
      data: {
        thread: chatThreadSnapshot(thread),
        turns: (turns ?? []).map((turn) => ({
          id: turn.id,
          status: turn.status,
          createdAt: turn.created_at,
          updatedAt: turn.updated_at,
          events: eventsByTurn.get(turn.id) ?? [],
          feedback: feedbackByTurn.get(turn.id) ?? [],
          memoryReceipts: memoryReceiptsByTurn.get(turn.id) ?? [],
        })),
      },
    };
  };
  const startChatTurn = async (
    threadId: string,
    input: Readonly<{ turnId: string; idempotencyKey: string; digest: string }>,
  ): Promise<AdapterResult<Readonly<{ turnId: string; reused: boolean }>>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("start_chat_turn", {
      p_thread_id: threadId,
      p_turn_id: input.turnId,
      p_idempotency_key: input.idempotencyKey,
      p_digest: input.digest,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.turn_id
      ? { data: { turnId: result.turn_id, reused: result.reused === true } }
      : { error: "INTERNAL_ERROR" };
  };
  const cancelChatTurn = async (
    turnId: string,
  ): Promise<
    AdapterResult<Readonly<{ sequence: number; state: "cancelled" }>>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: turn, error: turnError } = await client
      .from("turns")
      .select("status")
      .eq("id", turnId)
      .maybeSingle();
    if (turnError || !turn) return { error: "FORBIDDEN" };
    if (turn.status === "cancelled") {
      const { data: prior, error: priorError } = await client
        .from("chat_turn_events")
        .select("sequence,state")
        .eq("turn_id", turnId)
        .eq("state", "cancelled")
        .maybeSingle();
      return priorError || !prior
        ? { error: "INTERNAL_ERROR" }
        : { data: { sequence: prior.sequence, state: "cancelled" } };
    }
    if (
      ["completed", "proposal_ready", "unavailable", "failed"].includes(
        turn.status,
      )
    )
      return { error: "CANCELLED" };
    const { data, error } = await client.rpc("cancel_chat_turn", {
      p_turn_id: turnId,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.state === "cancelled" && typeof result.sequence === "number"
      ? { data: { sequence: result.sequence, state: "cancelled" } }
      : { error: "INTERNAL_ERROR" };
  };
  const replayChatTurn = async (
    turnId: string,
    afterSequence: number,
  ): Promise<AdapterResult<readonly ChatTurnEventHistory[]>> => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: turn, error: turnError } = await client
      .from("turns")
      .select("id")
      .eq("id", turnId)
      .maybeSingle();
    if (turnError || !turn) return { error: "FORBIDDEN" };
    const { data, error } = await client
      .from("chat_turn_events")
      .select("event_id,sequence,event_type,state,created_at")
      .eq("turn_id", turnId)
      .gt("sequence", afterSequence)
      .order("sequence", { ascending: true });
    if (error) return { error: "INTERNAL_ERROR" };
    return {
      data: (data ?? []).map((event) => ({
        eventId: event.event_id,
        sequence: event.sequence,
        type: event.event_type,
        state: event.state,
        createdAt: event.created_at,
      })),
    };
  };
  const recordTurnFeedback = async (
    turnId: string,
    input: Readonly<{ kind: TurnFeedbackKind; reason: TurnFeedbackReason }>,
  ): Promise<
    AdapterResult<Readonly<{ feedbackId: string; reused: boolean }>>
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("record_turn_feedback", {
      p_turn_id: turnId,
      p_feedback_kind: input.kind,
      p_reason_code: input.reason,
    });
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    return result?.feedback_id
      ? {
          data: {
            feedbackId: result.feedback_id,
            reused: result.reused === true,
          },
        }
      : { error: "INTERNAL_ERROR" };
  };
  const confirm = async (
    tripId: string,
    input: ConfirmInput,
  ): Promise<
    AdapterResult<
      Readonly<{
        outcome: "applied" | "already_applied";
        resultingVersion: number;
      }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data: proposal, error: proposalError } = await client
      .from("trip_proposals")
      .select("trip_id")
      .eq("id", input.proposalId)
      .maybeSingle();
    if (proposalError || !proposal || proposal.trip_id !== tripId)
      return { error: "FORBIDDEN" };
    const { data, error } = await client.rpc(
      "confirm_and_apply_trip_proposal",
      {
        p_proposal_id: input.proposalId,
        p_idempotency_key: input.idempotencyKey,
        p_digest: input.digest,
      },
    );
    if (error) return { error: mapRpcFailure(error.message) };
    const result = data?.[0];
    if (!result) return { error: "INTERNAL_ERROR" };
    if (result.outcome === "version_conflict")
      return { error: "STALE_TRIP_VERSION" };
    if (result.outcome !== "applied" && result.outcome !== "already_applied")
      return { error: "PROPOSAL_NOT_CONFIRMABLE" };
    return {
      data: {
        outcome: result.outcome,
        resultingVersion: result.resulting_version,
      },
    };
  };
  const createRollbackProposal = async (
    tripId: string,
    targetVersion: number,
  ): Promise<
    AdapterResult<
      Readonly<{
        proposalId: string;
        baseTripVersion: number;
        targetVersion: number;
      }>
    >
  > => {
    const actor = await authenticated();
    if ("error" in actor) return { error: actor.error };
    const { data, error } = await client.rpc("create_trip_rollback_proposal", {
      p_trip_id: tripId,
      p_target_version: targetVersion,
    });
    if (error)
      return {
        error: error.message.includes("ROLLBACK_NOT_AVAILABLE")
          ? "PROPOSAL_NOT_CONFIRMABLE"
          : mapRpcFailure(error.message),
      };
    const result = data?.[0];
    return result?.proposal_id &&
      typeof result.base_trip_version === "number" &&
      typeof result.target_version === "number"
      ? {
          data: {
            proposalId: result.proposal_id,
            baseTripVersion: result.base_trip_version,
            targetVersion: result.target_version,
          },
        }
      : { error: "INTERNAL_ERROR" };
  };
  return {
    applyCookies,
    authenticated,
    getUserProfile,
    saveUserProfile,
    listPrivacyRequests,
    requestPrivacyAction,
    listMemoryProfiles,
    setMemoryConsent,
    createExplicitMemory,
    transitionMemory,
    listTrips,
    createTrip,
    getTrip,
    getTripPlaces,
    getTripActions,
    getPendingProposal,
    createPendingProposal,
    revisePendingProposalPatch,
    revisePendingProposal,
    rejectPendingProposal,
    listChatThreads,
    createChatThread,
    getChatThread,
    startChatTurn,
    cancelChatTurn,
    replayChatTurn,
    recordTurnFeedback,
    confirm,
    createRollbackProposal,
  };
}

function tripSnapshot(input: Readonly<{
  id: string;
  title: string;
  head_version: number;
  updated_at: string;
}>): TripSnapshot {
  return {
    id: input.id,
    title: input.title,
    headVersion: input.head_version,
    updatedAt: input.updated_at,
  };
}

function memoryState(value: unknown): MemoryProfileRead["state"] | null {
  return value === "explicit" ||
    value === "confirmed" ||
    value === "inferred" ||
    value === "rejected" ||
    value === "paused" ||
    value === "deleted"
    ? value
    : null;
}

function chatThreadSnapshot(
  input: Readonly<{
    id: string;
    trip_id: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>,
): ChatThreadSnapshot {
  return {
    id: input.id,
    tripId: input.trip_id,
    status: input.status === "archived" ? "archived" : "active",
    createdAt: input.created_at,
    updatedAt: input.updated_at,
  };
}

export function pendingProposalRead(
  input: Readonly<{
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
    content?: TripContentSnapshot;
  }>,
): PendingProposalRead | null {
  const patch = input.proposal.patch;
  if (
    input.proposal.status !== "pending" ||
    input.proposal.expires_at <= new Date().toISOString()
  )
    return null;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const legacyTitle = (patch as { title?: unknown }).title;
  let afterTitle = input.trip.title;
  let dayDiffs: readonly ProposalDayDiff[] | undefined;
  if (typeof legacyTitle === "string" && legacyTitle.trim()) afterTitle = legacyTitle;
  else {
    try { assertTripPatch(patch as TripPatch); const diff = describeProposalDiff(input.content ?? { version: input.trip.headVersion, title: input.trip.title, days: [] }, patch as TripPatch); afterTitle = diff.next.title; dayDiffs = diff.dayDiffs; } catch { return null; }
  }
  return {
    trip: input.trip,
    proposal: {
      id: input.proposal.id,
      revision: input.proposal.revision,
      baseTripVersion: input.proposal.base_trip_version,
      status: "pending",
      createdAt: input.proposal.created_at,
      expiresAt: input.proposal.expires_at,
      titleDiff: { before: input.trip.title, after: afterTitle },
      ...(dayDiffs ? { dayDiffs, patch: patch as TripPatch } : {}),
      evidence: "not_recorded",
      assumptions: "not_recorded",
    },
  };
}

function mapRpcFailure(message: string): FailureCode {
  if (
    message.includes("IDEMPOTENCY_KEY_REUSE") ||
    message.includes("PRIVACY_REQUEST_ID_REUSE")
  )
    return "IDEMPOTENCY_KEY_REUSE";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  if (message.includes("terminal turn cannot emit events")) return "CANCELLED";
  if (message.includes("INVALID_FEEDBACK")) return "INVALID_INPUT";
  if (message.includes("NO_RESULT_TO_FEEDBACK"))
    return "PROPOSAL_NOT_CONFIRMABLE";
  if (message.includes("STALE_TRIP_VERSION")) return "STALE_TRIP_VERSION";
  if (
    message.includes("PROPOSAL_NOT_CONFIRMABLE") ||
    message.includes("INVALID_PATCH")
  )
    return "PROPOSAL_NOT_CONFIRMABLE";
  if (
    message.includes("INVALID_MEMORY") ||
    message.includes("INVALID_PROFILE") ||
    message.includes("INVALID_PRIVACY_REQUEST") ||
    message.includes("CONSENT_REQUIRED") ||
    message.includes("TERMINAL_MEMORY")
  )
    return "INVALID_INPUT";
  return "INTERNAL_ERROR";
}
