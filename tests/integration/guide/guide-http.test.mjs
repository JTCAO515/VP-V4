import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { createNativeTextEnvironment } from "../turn/native-text-environment.mjs";
import { identityLocalEnv } from "../identity/local-supabase.mjs";
import { createClient } from "@supabase/supabase-js";

test("Guide actual native owner HTTP reads, replays, scopes fresh grounded submission and revokes source", {
  skip: process.env.VP_GUIDE_HTTP_INTEGRATION !== "true", timeout: 180000,
}, async t => {
  const e = await createNativeTextEnvironment({ grounded: true }); t.after(() => e.cleanup());
  const local = identityLocalEnv(), key = local.PUBLISHABLE_KEY || local.ANON_KEY;
  const call = async (path, token, body) => {
    const r = await fetch(e.api + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json(), cache: r.headers.get("cache-control") };
  };
  const clients = [], tokens = [];
  for (const user of e.users) {
    const attemptId = uuid(), issued = await call("/api/auth/native/v2/credentials", null, { email: user.email, password: user.password, attemptId });
    assert.equal(issued.status, 200); const token = issued.body.accessToken;
    assert.equal((await call("/api/auth/native/v2/login", token, { attemptId })).status, 200);
    tokens.push(token); clients.push(createClient(local.API_URL, key, { global: { headers: { authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } }));
  }
  const rpc = async (actor, name, input) => {
    const r = await clients[actor].rpc(name, input); assert.equal(r.error, null, r.error?.message); return r.data;
  };
  // Observe shipped deny-by-default first. The following GRANT is only this
  // named disposable fixture's opt-in, never migration/target permission.
  assert.equal(e.sql("select has_function_privilege('authenticated','public.guide_place_v1(uuid,jsonb)','EXECUTE');"), "f");
  assert.equal(e.sql("select has_function_privilege('authenticated','public.submit_trip_support_entity_mapping_v1(jsonb)','EXECUTE');"), "f");
  e.sql("grant execute on function public.guide_place_v1(uuid,jsonb),public.submit_guide_use_v1(jsonb),public.review_guide_use_v1(uuid,bigint,text,text) to authenticated;");
  e.sql("grant execute on function public.submit_trip_support_entity_mapping_v1(jsonb),public.review_trip_support_entity_mapping_v1(uuid,bigint,text,text) to authenticated;");
  const ids = e.users.map(u => "'" + u.id + "'").join(",");
  e.sql(`update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) select id,true from auth.users where id in (${ids}) on conflict do nothing;update knowledge_review_private.members set active=true where actor_id in (${ids});`);
  assert.equal(e.sql(`select count(*) from knowledge_review_private.members where active and actor_id in (${ids});`), "4", "all four independent owned Ops actors are explicitly enrolled only in the fixture");
  const candidate = uuid(), trip = uuid(), ref = uuid(), poi = uuid();
  const statement = { schemaVersion: "knowledge-statement/2", assertion: { subjectId: "guide_http_fixture", predicate: "located_at", objectId: "place_address", conditions: [], exclusions: ["not_admission"] },
    scope: { cities: ["shanghai"], scene: "attraction", audience: "international_independent_traveler" }, place: { names: { en: "Synthetic Guide Gallery", zh: "合成讲解展馆" } },
    value: { lines: ["Synthetic address 1"], countryCode: "CN" }, expressions: { en: { text: "The synthetic gallery is at Synthetic address 1.", conditions: [], exclusions: ["This is not an admission guarantee."] }, zh: { text: "合成展馆地址为合成地址1。", conditions: [], exclusions: ["这不是入场保证。"] } },
    sources: [{ sourceKey: "guide-http-" + uuid(), revisionLabel: "owned-1", publisher: "Owned synthetic fixture", uri: "urn:vpj15:synthetic:guide-http", locator: "fixture only", snippet: "Owned source only", usageDeclaration: "Owned isolated test only" }] };
  await rpc(0, "ops_review_workspace", { p_input: { action: "submit_statement", operationId: uuid(), candidateId: candidate, title: "Owned Guide HTTP source", statement } });
  await rpc(1, "ops_review_workspace", { p_input: { action: "review", operationId: uuid(), candidateId: candidate, expectedVersion: 1, decision: "reviewed", note: "Independent synthetic reviewer" } });
  await rpc(1, "ops_review_workspace", { p_input: { action: "publish_statement", operationId: uuid(), candidateId: candidate, expectedVersion: 2, useBasis: "original_factual_summary", useNote: "Owned fixture only", expiresAt: new Date(Date.now() + 3600000).toISOString() } });
  const st = JSON.parse(e.sql(`select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) from knowledge_review_private.statements where candidate_id='${candidate}';`));
  e.sql(`insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi}','合成讲解展馆','Synthetic Guide Gallery');insert into public.trips(id,owner_id,title,head_version) values('${trip}','${e.users[0].id}','Owned Guide Trip',0);insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${ref}','${trip}','${e.users[0].id}','canonical','${poi}');`);
  const sourceRefs = JSON.parse(e.sql(`select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id='${candidate}';`));
  const sourceDigest = e.sql(`select trip_support_private.hash('${JSON.stringify(sourceRefs)}'::jsonb);`);
  const m = await rpc(2, "submit_trip_support_entity_mapping_v1", { p_input: { operationId: uuid(), canonicalPoiId: poi, statementId: st.id, expectedClaimRevision: st.revision, expectedPayloadHash: st.hash, expectedSourceDigest: sourceDigest, basisMetadata: { city: "shanghai", scene: "attraction", locale: "en", sourceRefs } } });
  const mapped = await rpc(1, "review_trip_support_entity_mapping_v1", { p_mapping: m.mappingId, p_expected_version: m.version, p_expected_digest: m.digest, p_decision: "approve" });
  assert.equal(mapped.kind, "mapping_reviewed");
  const proof = JSON.parse(e.sql(`select guide_private.proof_v1(guide_private.mapping_v1('${m.mappingId}'));`));
  const cap = await rpc(2, "submit_guide_use_v1", { p_input: { operationId: uuid(), mappingId: m.mappingId, expectedProof: proof, display: true, tts: true, cache: true, prompt: true, useBasis: "All four uses only in owned fixture", locator: "synthetic independent decision", expiresAt: new Date(Date.now() + 1800000).toISOString() } });
  assert.equal((await rpc(3, "review_guide_use_v1", { p_id: cap.id, p_revision: cap.revision, p_digest: cap.digest, p_decision: "approve" })).kind, "use_reviewed");
  const path = `/api/guide/native/v1/trips/${trip}`, base = { action: "read", expectedTripVersion: 0, placeReferenceId: ref, locale: "en", interest: "general" };
  assert.equal((await call(path, tokens[1], base)).status, 403);
  const first = await call(path, tokens[0], base); assert.equal(first.status, 200); assert.equal(first.cache, "private, no-store");
  const ready = first.body.data; assert.equal(ready.kind, "ready"); assert.equal(ready.canonicalPoiId, poi); assert.equal(ready.segments[0].exclusions[0], "This is not an admission guarantee.");
  const replay = await call(path, tokens[0], { ...base, action: "replay", expectedDigest: ready.digest }); assert.equal(replay.body.data.replayAskUnits, 0);
  assert.equal(e.sql(`select count(*) from public.model_budget_attempts where owner_id='${e.users[0].id}';`), "0");
  assert.equal((await call("/api/chat/native/v4/consent", tokens[0], { policyId: e.groundedPolicyId, noticeHash: e.groundedNoticeHash })).status, 200);
  // The real Native shape starts with a fresh missing standalone thread ID.
  const follow = { ...base, action: "follow_up", operationId: uuid(), expectedDigest: ready.digest, question: "HOLD What is the Synthetic Guide Gallery address?", threadId: uuid(), turnId: uuid(), policyId: e.groundedPolicyId,
    completedSegmentIds: [ready.segments[0].id],
    serviceTask: { id: uuid(), scopeVersion: 1, relationship: "new_goal", parentTurnId: null } };
  const accepted = await call(path, tokens[0], follow); assert.equal(accepted.status, 200); assert.equal(accepted.body.data.kind, "submitted"); assert.equal(accepted.body.data.generationCost, null);
  assert.equal((await call(path, tokens[0], follow)).body.data.reused, true);
  assert.equal((await call(path, tokens[0], { ...follow, completedSegmentIds: [] })).status, 409, "same operation freezes explicit played position");
  assert.equal(e.sql(`select trip_id is null from public.chat_threads where id='${follow.threadId}';`), "t");
  assert.equal(e.sql(`select count(*) from guide_private.bindings_v1 where turn_id='${follow.turnId}' and owner_id='${e.users[0].id}' and trip_id='${trip}' and reference_id='${ref}';`), "1");
  assert.equal(e.sql(`select input_text='${follow.question}' from turn_private.text_content where turn_id='${follow.turnId}';`), "t");
  const exported = await call(path, tokens[0], { ...base, action: "export" }); assert.equal(exported.status, 200); assert.equal(exported.body.data.scope, "guide_selection_metadata");
  assert.ok(exported.body.data.bindings.some(b => b.turnId === follow.turnId));
  await rpc(0, "ops_source_revision_withdraw_v1", { p_input: { operationId: uuid(), sourceRevisionId: sourceRefs[0].sourceRevisionId, reason: "Owned fixture withdraw" } });
  const withdrawn = await call(path, tokens[0], { ...base, action: "replay", expectedDigest: ready.digest }); assert.equal(withdrawn.body.data.kind, "unavailable");
  assert.equal((await call(path, tokens[0], { ...base, action: "forget", expectedTripVersion: 999, operationId: uuid() })).body.data.kind, "forgotten");
  assert.equal(e.sql(`select head_version from public.trips where id='${trip}';`), "0", "Guide never writes Trip");
});
