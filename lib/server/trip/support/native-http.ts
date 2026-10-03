import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { assertGroundedClaim, type GroundedClaim } from "../../contracts/index.ts";
import { KNOWLEDGE_CITIES, KNOWLEDGE_SCENES } from "../../knowledge/publication/statement.ts";

export type NativeSupportAction = "prepare" | "revoke" | "read" | "renew" | "confirm" | "candidates" | "confirmation_receipt" | "context";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: string, status = 503) => json({ error: { code } }, status);
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const integer = (v: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const item = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const scopes = ["address_reference", "opening_window_reference"];
const prepareKeys = ["operationId","placeReferenceId","dayId","itemId","proposalId","expectedProposalRevision","expectedBaseVersion","expectedProposalDigest","expectedItemDigest","mappingId","expectedMappingVersion","expectedMappingDigest","city","scene","locale","scope","expectedClaimRevision","expectedPayloadHash","expectedSourceDigest"];
const renewKeys = ["operationId","supportId","expectedVersion","tripVersion","dayId","itemId","mappingId","expectedMappingVersion","expectedMappingDigest","expectedClaimRevision","expectedPayloadHash","expectedSourceDigest"];

export function nativeSupportInput(action: Exclude<NativeSupportAction,"read" | "candidates" | "context">, value: unknown): Record<string,unknown> | null {
  if (!record(value)) return null;
  const keys = action === "prepare" ? prepareKeys : action === "renew" ? renewKeys : action === "revoke" ? ["receiptId","expectedVersion"] : ["proposalId","idempotencyKey","digest","expectedProposalRevision","expectedBaseVersion","supportSelection"];
  if (!exact(value, keys)) return null;
  for (const key of keys) {
    if (["operationId","placeReferenceId","proposalId","mappingId","supportId","receiptId","idempotencyKey"].includes(key) && !uuid(value[key])) return null;
    if (["dayId","itemId"].includes(key) && !item(value[key])) return null;
    if (["expectedVersion","expectedMappingVersion"].includes(key) && !integer(value[key])) return null;
    if (["expectedProposalRevision","expectedClaimRevision"].includes(key) && !integer(value[key],1,2147483647)) return null;
    if (["tripVersion","expectedBaseVersion"].includes(key) && !integer(value[key],0,999999999)) return null;
    if (["digest","expectedProposalDigest","expectedItemDigest","expectedMappingDigest","expectedPayloadHash","expectedSourceDigest"].includes(key) && !hash(value[key])) return null;
  }
  if (action === "prepare" && (!(KNOWLEDGE_CITIES as readonly unknown[]).includes(value.city) || !(KNOWLEDGE_SCENES as readonly unknown[]).includes(value.scene) || typeof value.locale !== "string" || !["zh","en"].includes(value.locale) || typeof value.scope !== "string" || !scopes.includes(value.scope))) return null;
  if (action === "confirm" || action === "confirmation_receipt") {
    if (!Array.isArray(value.supportSelection) || value.supportSelection.length < 1 || value.supportSelection.length > 8) return null;
    const ids = new Set<string>();
    for (const s of value.supportSelection) {
      if (!record(s) || !exact(s,["receiptId","version","sourceDigest"]) || !uuid(s.receiptId) || !integer(s.version) || !hash(s.sourceDigest) || ids.has(s.receiptId)) return null;
      ids.add(s.receiptId);
    }
  }
  return structuredClone(value);
}

const statuses = ["reference_current","recheck_required","blocked","revoked"];
function typedClaim(value: unknown, scope: unknown): boolean {
  if (!record(value) || (scope === "address_reference" ? value.claimType !== "address" : value.claimType !== "time_window")) return false;
  try { assertGroundedClaim(value as GroundedClaim);return true; } catch { return false; }
}
function decodeResult(action: NativeSupportAction, value: unknown, tripId: string | undefined, input: Record<string,unknown>): unknown | null {
  if (!record(value)) return null;
  if (exact(value,["kind"]) && ["blocked","stale","conflict"].includes(String(value.kind))) return value;
  if (action === "context") {
    if (exact(value,["kind","reason"]) && value.kind==="unavailable" && value.reason==="capacity") return value;
    if (!exact(value,["kind","tripId","tripVersion","proposalId","proposalRevision","baseVersion","proposalDigest","itemDigest","dayId","itemId","canonicalPlaceReferences"])
      || value.kind!=="support_context" || value.tripId!==tripId || value.tripVersion!==input.expectedTripVersion || value.baseVersion!==input.expectedTripVersion
      || value.proposalId!==input.proposalId || value.proposalRevision!==input.expectedProposalRevision || value.dayId!==input.dayId || value.itemId!==input.itemId
      || !hash(value.proposalDigest) || !hash(value.itemDigest) || !Array.isArray(value.canonicalPlaceReferences) || value.canonicalPlaceReferences.length>100) return null;
    const ids=new Set<string>();
    for (const r of value.canonicalPlaceReferences) {
      if (!record(r) || !exact(r,["referenceId","canonicalPoiId","display"]) || !uuid(r.referenceId) || !uuid(r.canonicalPoiId) || ids.has(r.referenceId)
        || !record(r.display) || !exact(r.display,["en","zh"]) || ![r.display.en,r.display.zh].every(t=>t===null||typeof t==="string"&&t.length<=1000)) return null;
      ids.add(r.referenceId);
    }
  } else if (action === "candidates") {
    if (exact(value,["kind","reason"]) && value.kind==="unavailable" && ["canonical_reference_required","capacity"].includes(String(value.reason))) return value;
    if (!exact(value,["kind","tripId","tripVersion","placeReferenceId","contextDigest","entries","nextCursor"]) || value.kind!=="candidates"
      || value.tripId!==tripId || value.tripVersion!==input.expectedTripVersion || value.placeReferenceId!==input.placeReferenceId || !hash(value.contextDigest)
      || !Array.isArray(value.entries) || value.entries.length>Number(input.limit)) return null;
    let previous: string | null = null;
    for (const e of value.entries) {
      if (!record(e) || !exact(e,["mappingId","mappingVersion","mappingDigest","statementId","claimRevision","payloadHash","sourceDigest","scope","claim"])
        || !uuid(e.mappingId) || !uuid(e.statementId) || !integer(e.mappingVersion) || !integer(e.claimRevision) || !hash(e.mappingDigest) || !hash(e.payloadHash) || !hash(e.sourceDigest)
        || !scopes.includes(String(e.scope)) || !typedClaim(e.claim,e.scope) || previous!==null && e.mappingId<=previous) return null;
      previous=e.mappingId;
    }
    if (value.nextCursor!==null && (!record(value.nextCursor) || !exact(value.nextCursor,["contextDigest","afterMappingId"]) || value.nextCursor.contextDigest!==value.contextDigest || value.nextCursor.afterMappingId!==previous || previous===null)) return null;
  } else if (action === "confirmation_receipt") {
    if (!exact(value,["kind","receipt","historicalOnly","currentEligibilityRequiresRead"]) || value.kind!=="confirmation_receipt" || value.historicalOnly!==true || value.currentEligibilityRequiresRead!==true
      || decodeResult("confirm",value.receipt,tripId,input)===null) return null;
  } else if (action === "prepare") {
    if (!exact(value,["kind","receiptId","version","tripId","proposalId","proposalRevision","baseVersion","dayId","itemId","scope","applicability","claim","sourceDigest","expiresAt"])
      || value.kind !== "prepared" || !uuid(value.receiptId) || !integer(value.version) || value.tripId !== tripId || value.proposalId !== input.proposalId
      || value.proposalRevision !== input.expectedProposalRevision || value.baseVersion !== input.expectedBaseVersion || value.dayId !== input.dayId || value.itemId !== input.itemId || value.scope !== input.scope
      || !["unverified","matched"].includes(String(value.applicability)) || value.sourceDigest !== input.expectedSourceDigest || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) || !typedClaim(value.claim,value.scope)) return null;
  } else if (action === "revoke") {
    if (!exact(value,["kind","receiptId","version"]) || value.kind !== "revoked" || value.receiptId !== input.receiptId || !integer(value.version) || value.version !== Number(input.expectedVersion)+1) return null;
  } else if (action === "renew") {
    if (!exact(value,["kind","supportId","version","receiptId"]) || value.kind !== "renewed" || value.supportId !== input.supportId || !integer(value.version) || value.version !== Number(input.expectedVersion)+1 || !uuid(value.receiptId)) return null;
  } else if (action === "read") {
    if (!exact(value,["kind","tripId","tripVersion","dayId","itemId","entries"]) || value.kind !== "support" || value.tripId !== tripId || value.tripVersion !== input.expectedTripVersion
      || value.dayId !== input.dayId || value.itemId !== input.itemId || !Array.isArray(value.entries) || value.entries.length > 8) return null;
    const ids = new Set<string>();
    for (const e of value.entries) {
      if (!record(e) || !exact(e,["supportId","receiptId","placeReferenceId","version","scope","applicability","status","claimRevision","payloadHash","sourceDigest","claim"]) || !uuid(e.supportId) || !uuid(e.receiptId) || !uuid(e.placeReferenceId)
        || !integer(e.version) || !integer(e.claimRevision) || !hash(e.payloadHash) || !hash(e.sourceDigest) || !scopes.includes(String(e.scope)) || !statuses.includes(String(e.status))
        || !["unverified","matched"].includes(String(e.applicability)) || ids.has(e.supportId) || (e.status === "reference_current" ? !typedClaim(e.claim,e.scope) : e.claim !== null)) return null;
      ids.add(e.supportId);
    }
  } else {
    if (!exact(value,["kind","outcome","tripId","proposalId","resultingVersion","supports","selectionDigest"]) || value.kind !== "confirmed" || !hash(value.selectionDigest) || value.tripId !== tripId || value.proposalId !== input.proposalId
      || !["applied","already_applied","proposal_not_confirmable","proposal_expired","version_conflict"].includes(String(value.outcome)) || !Array.isArray(value.supports) || value.supports.length > 8) return null;
    const applied = value.outcome === "applied" || value.outcome === "already_applied";
    if (applied ? value.resultingVersion !== Number(input.expectedBaseVersion)+1 : value.resultingVersion !== null || value.supports.length !== 0) return null;
    const selections = input.supportSelection as Record<string,unknown>[];
    const ids = new Set<string>();
    for (const e of value.supports) {
      if (!record(e) || !exact(e,["supportId","receiptId","version","status"]) || !uuid(e.supportId) || !uuid(e.receiptId) || !integer(e.version) || !statuses.includes(String(e.status))
        || !selections.some(s=>s.receiptId===e.receiptId) || ids.has(e.supportId)) return null;
      ids.add(e.supportId);
    }
    if (applied && value.supports.length !== selections.length) return null;
  }
  return structuredClone(value);
}

export async function nativeTripSupportHTTP(request: NextRequest, action: NativeSupportAction, tripId?: string): Promise<Response> {
  if (request.headers.has("cookie") || request.headers.has("origin") || request.method !== (["read","candidates","context"].includes(action) ? "GET":"POST")
    || (action !== "revoke" && !uuid(tripId)) || (action === "revoke" && tripId !== undefined)) return failure("INVALID_INPUT",400);
  const params = request.nextUrl.searchParams;
  let input: Record<string,unknown>;
  if (action === "context") {
    const version=params.get("expectedTripVersion"),proposal=params.get("proposalId"),revision=params.get("expectedProposalRevision"),day=params.get("dayId"),id=params.get("itemId");
    const keys=["expectedTripVersion","proposalId","expectedProposalRevision","dayId","itemId"];
    if ([...params].length!==5 || [...params].some(([k])=>!keys.includes(k)||params.getAll(k).length!==1) || version===null || !/^(0|[1-9][0-9]{0,8})$/.test(version)
      || !uuid(proposal) || revision===null || !/^[1-9][0-9]{0,9}$/.test(revision) || Number(revision)>2147483647 || !item(day) || !item(id)) return failure("INVALID_INPUT",400);
    input={expectedTripVersion:Number(version),proposalId:proposal,expectedProposalRevision:Number(revision),dayId:day,itemId:id};
  } else if (action === "candidates") {
    const expected=params.get("expectedTripVersion"),reference=params.get("placeReferenceId"),city=params.get("city"),scene=params.get("scene"),locale=params.get("locale"),limit=params.get("limit")??"50";
    const context=params.get("contextDigest"),after=params.get("afterMappingId");
    const allowed=["expectedTripVersion","placeReferenceId","city","scene","locale","limit","contextDigest","afterMappingId"];
    if ([...params].some(([k])=>!allowed.includes(k)||params.getAll(k).length!==1) || expected===null || !/^(0|[1-9][0-9]{0,8})$/.test(expected)
      || !uuid(reference) || !(KNOWLEDGE_CITIES as readonly unknown[]).includes(city) || !(KNOWLEDGE_SCENES as readonly unknown[]).includes(scene) || !["zh","en"].includes(locale??"")
      || !/^[1-9][0-9]?$/.test(limit) || Number(limit)>50 || (context===null)!==(after===null) || context!==null && (!hash(context)||!uuid(after))) return failure("INVALID_INPUT",400);
    input={expectedTripVersion:Number(expected),placeReferenceId:reference,city,scene,locale,limit:Number(limit),cursor:context===null?null:{contextDigest:context,afterMappingId:after}};
  } else if (action === "read") {
    const version=params.get("expectedTripVersion"),day=params.get("dayId"),id=params.get("itemId");
    if ([...params].length !== 3 || [...params].some(([k])=>!["expectedTripVersion","dayId","itemId"].includes(k))
      || params.getAll("expectedTripVersion").length !== 1 || params.getAll("dayId").length !== 1 || params.getAll("itemId").length !== 1
      || version === null || !/^(0|[1-9][0-9]{0,8})$/.test(version) || !item(day) || !item(id)) return failure("INVALID_INPUT",400);
    input={expectedTripVersion:Number(version),dayId:day,itemId:id};
  } else input={};
  const config=getNativeRuntimeConfig(request,"trip","trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope=nativeRequestScope(request.signal);
  try {
    return await scope.run(async()=>{
      if (action !== "read" && action !== "candidates" && action !== "context") {
        const raw=await scope.body(request,24000);let value: unknown;
        try {value=JSON.parse(raw??"null");} catch {return failure("INVALID_INPUT",400);}
        const parsed=nativeSupportInput(action,value);if (!parsed || [...params].length) return failure("INVALID_INPUT",400);input=parsed;
      }
      const credentials=await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable);scope.check();
      if (!credentials) return failure("UNAUTHENTICATED",401);
      const active=async()=>{
        const s=await credentials.client.rpc("native_session_v2",{p_action:"session"}).abortSignal(scope.signal);scope.check();
        if (s.error) {if (/\b(UNAUTHENTICATED|SESSION_REPLACED)\b/.test(s.error.message)) return "UNAUTHENTICATED";return "PROVIDER_UNAVAILABLE";}
        return s.data?.subject===credentials.subject && s.data?.sessionId===credentials.sessionId ? null:"UNAUTHENTICATED";
      };
      const initial=await active();if (initial) return failure(initial,initial==="UNAUTHENTICATED"?401:503);
      const rpc=async(name: string,p: Record<string,unknown>)=>credentials.client.rpc(name,p).abortSignal(scope.signal);
      if (action === "confirm" || action === "confirmation_receipt") {
        // Existing ordinary owner SELECT preserves path binding for exact already-applied replay too.
        const p=await credentials.client.from("trip_proposals").select("trip_id,revision,base_trip_version").eq("id",String(input.proposalId)).eq("owner_id",credentials.subject).maybeSingle();
        scope.check();if (p.error) return failure("PROVIDER_UNAVAILABLE");
        if (!p.data || p.data.trip_id!==tripId || p.data.revision!==input.expectedProposalRevision || p.data.base_trip_version!==input.expectedBaseVersion) return json({kind:"blocked"});
      }
      if (action === "renew") {
        const current=await rpc("read_trip_item_support_v1",{p_trip:tripId,p_expected_trip_version:input.tripVersion,p_day:input.dayId,p_item:input.itemId});
        if (current.error) return failure("PROVIDER_UNAVAILABLE");
        const read=decodeResult("read",current.data,tripId,{expectedTripVersion:input.tripVersion,dayId:input.dayId,itemId:input.itemId});
        if (!record(read) || !Array.isArray(read.entries) || !read.entries.some(e=>e.supportId===input.supportId && e.version===input.expectedVersion)) return json({kind:"blocked"});
      }
      const names={context:"read_trip_item_support_context_v1",candidates:"read_trip_item_support_candidates_v1",confirmation_receipt:"read_supported_trip_confirmation_receipt_v1",prepare:"prepare_trip_item_support_v1",revoke:"revoke_trip_item_support_preparation_v1",read:"read_trip_item_support_v1",renew:"renew_trip_item_support_v1",confirm:"confirm_and_apply_supported_trip_proposal_v1"};
      const p=action==="context"?{p_trip:tripId,p_expected_trip_version:input.expectedTripVersion,p_proposal:input.proposalId,p_expected_proposal_revision:input.expectedProposalRevision,p_day:input.dayId,p_item:input.itemId}:action==="candidates"?{p_trip:tripId,p_expected_trip_version:input.expectedTripVersion,p_place_reference:input.placeReferenceId,p_city:input.city,p_scene:input.scene,p_locale:input.locale,p_cursor:input.cursor,p_limit:input.limit}:action==="confirmation_receipt"?{p_idempotency_key:input.idempotencyKey,p_proposal_id:input.proposalId,p_proposal_digest:input.digest,p_support_selection:input.supportSelection}:action==="prepare"?{p_input:{...input,tripId}}:action==="renew"?{p_input:input}:action==="revoke"?{p_receipt:input.receiptId,p_expected_version:input.expectedVersion}:action==="read"?{p_trip:tripId,p_expected_trip_version:input.expectedTripVersion,p_day:input.dayId,p_item:input.itemId}:{p_proposal_id:input.proposalId,p_idempotency_key:input.idempotencyKey,p_digest:input.digest,p_support_selection:input.supportSelection};
      const result=await rpc(names[action],p);scope.check();
      const final=await active();if (final) return failure(final,final==="UNAUTHENTICATED"?401:503);
      if (result.error) {
        if (/\b(UNAUTHENTICATED|SESSION_REPLACED)\b/.test(result.error.message)) return failure("UNAUTHENTICATED",401);
        if (/\bFORBIDDEN\b/.test(result.error.message)) return failure("FORBIDDEN",403);
        return failure("PROVIDER_UNAVAILABLE");
      }
      const decoded=decodeResult(action,result.data,tripId,input);
      return decoded === null ? failure("PROVIDER_UNAVAILABLE"):json(decoded);
    });
  } catch {return failure("PROVIDER_UNAVAILABLE");} finally {scope.dispose();}
}
