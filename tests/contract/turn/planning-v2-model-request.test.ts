import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createPlanningV2ModelRequest as create } from "../../../lib/server/turn/planning-v2-model-request.ts";
import { PLANNING_COMPARISON_PROMPT } from "../../../lib/server/model-gateway/prompt/planning-comparison.ts";
import { PROTOCOL_MODELS } from "../../../lib/server/model-gateway/adapters/provider-protocol.ts";
const tuple = ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004","00000000-0000-0000-0000-000000000005","00000000-0000-0000-0000-000000000006","00000000-0000-0000-0000-000000000007","00000000-0000-0000-0000-000000000008","qwen","qwen3.7-plus-2026-05-26","synthetic-v1","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"];
const requestId = "00000000-0000-0000-0000-000000000009";
// Independently computed with Python hashlib/json compact UTF8, not the module under test.
const vectors = [{"text":"Shanghai rail comparison","body":"{\"model\":\"qwen3.7-plus-2026-05-26\",\"messages\":[{\"role\":\"system\",\"content\":\"You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.\\nReturn exactly one JSON object: {\\\"highlight\\\":\\\"jingan\\\"}, {\\\"highlight\\\":\\\"peoples_square\\\"}, or {\\\"highlight\\\":\\\"none\\\"}.\\nDo not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means \\\"none\\\". This selection is advisory; domain code will construct the factual comparison.\"},{\"role\":\"user\",\"content\":\"Shanghai rail comparison\"}],\"stream\":false,\"max_tokens\":128,\"enable_thinking\":false,\"response_format\":{\"type\":\"json_object\"}}","payloadDigest":"2e7dad093f1d5a2a222edf52d1734e3b3da5666021e3ac8eefd73efaef6695bd","requestDigest":"d06dc56b49c7f56546f26da4eda5f2c7d50d8741b7658ba7126da816871b3b80","byteLength":754},{"text":"上海 \"引号\"\\路径\n\t é é 😀  ","body":"{\"model\":\"qwen3.7-plus-2026-05-26\",\"messages\":[{\"role\":\"system\",\"content\":\"You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.\\nReturn exactly one JSON object: {\\\"highlight\\\":\\\"jingan\\\"}, {\\\"highlight\\\":\\\"peoples_square\\\"}, or {\\\"highlight\\\":\\\"none\\\"}.\\nDo not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means \\\"none\\\". This selection is advisory; domain code will construct the factual comparison.\"},{\"role\":\"user\",\"content\":\"上海 \\\"引号\\\"\\\\路径\\n\\t é é 😀  \"}],\"stream\":false,\"max_tokens\":128,\"enable_thinking\":false,\"response_format\":{\"type\":\"json_object\"}}","payloadDigest":"0c5b334c2867690451c8ad8accbf7a45b0692e98f1d74e41797ea70b0e21831c","requestDigest":"bc38245050e58039ce5eb580b6b9d18335be5963354058399cb858ffb0823a1c","byteLength":775},{"text":"controls:\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f","body":"{\"model\":\"qwen3.7-plus-2026-05-26\",\"messages\":[{\"role\":\"system\",\"content\":\"You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.\\nReturn exactly one JSON object: {\\\"highlight\\\":\\\"jingan\\\"}, {\\\"highlight\\\":\\\"peoples_square\\\"}, or {\\\"highlight\\\":\\\"none\\\"}.\\nDo not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means \\\"none\\\". This selection is advisory; domain code will construct the factual comparison.\"},{\"role\":\"user\",\"content\":\"controls:\\u0001\\u0002\\u0003\\u0004\\u0005\\u0006\\u0007\\b\\t\\n\\u000b\\f\\r\\u000e\\u000f\\u0010\\u0011\\u0012\\u0013\\u0014\\u0015\\u0016\\u0017\\u0018\\u0019\\u001a\\u001b\\u001c\\u001d\\u001e\\u001f\"}],\"stream\":false,\"max_tokens\":128,\"enable_thinking\":false,\"response_format\":{\"type\":\"json_object\"}}","payloadDigest":"0dfdc83842a7e6e78e646559e861e60aa7a2eddcff99f93f30bf06aa36121535","requestDigest":"ed5ed66b445c92522eb326fe493434525f0cd18cbfa49c50e982bd344710669d","byteLength":905}];
const byteLimitVector = {"payloadDigest":"ecc103446471c1f87352cb83a019728f19c432e0b5edc7bc7d44c51654d7b905","requestDigest":"ffec0feb20f360974be10be606520867d43cec9cbbd013e1398d86ca0822fb66"};
const sha = (v: string) => createHash("sha256").update(Buffer.from(v,"utf8")).digest("hex");
const payload = (text: string) => ({model:PROTOCOL_MODELS.qwen,messages:[{role:"system",content:PLANNING_COMPARISON_PROMPT},{role:"user",content:text}],stream:false,max_tokens:128,enable_thinking:false,response_format:{type:"json_object"}});

test("independent canonical request byte/hash vectors retain Chinese, escapes and Unicode without normalization",()=>{
 for(const v of vectors){
  const body=JSON.stringify(payload(v.text));assert.equal(body,v.body);assert.equal(Buffer.byteLength(body,"utf8"),v.byteLength);
  assert.equal(sha(body),v.payloadDigest);assert.equal(sha(JSON.stringify(["planning-v2-model-request/1",tuple,requestId,v.payloadDigest])),v.requestDigest);
  assert.notEqual(sha(body+"\n"),v.payloadDigest);assert.notEqual(sha("\uFEFF"+body),v.payloadDigest);
 }
 assert.notEqual(sha(JSON.stringify(payload("é"))),sha(JSON.stringify(payload("e\u0301"))));
});

const tupleKeys=["owner","task","turn","lease","textPolicy","planningPolicy","scope","attempt","provider","model","priceVersion","intakeDigest","planningDigest"];
const expected=Object.fromEntries(tupleKeys.map((k,i)=>[k,tuple[i]]));
const raw=(text:string)=>({schemaVersion:"planning-v2-model-request/1",binding:{...expected},requestId,payload:payload(text)});
const reverse=(v:unknown):unknown=>Array.isArray(v)?v.map(reverse):v!==null&&typeof v==="object"?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
test("serializer equals independent vectors and captures canonical bytes despite caller key order",()=>{
 for(const v of vectors){const input=raw(v.text),r=create(input,expected);assert.ok(r);assert.equal(r.body,v.body);assert.equal(r.payloadDigest,v.payloadDigest);assert.equal(r.requestDigest,v.requestDigest);assert.equal(r.executionAvailable,false);assert.deepEqual(create(reverse(input),reverse(expected)),r);
 input.binding.lease=tuple[0];input.payload.messages[1].content="mutated";assert.equal(r.binding.lease,tuple[3]);assert.equal(r.body,v.body);assert.ok(Object.isFrozen(r.binding));}
});
test("strict expected13tuple, request UUID, closed payload model/prompts/limits and no configuration fields",()=>{
 const input=raw("synthetic rail");
 for(const [i,k]of tupleKeys.entries())assert.equal(create(input,{...expected,[k]:i<8?requestId:k.endsWith("Digest")?"c".repeat(64):"different"}),null,k);
 for(const requestId of [null,1,["id"],"not-a-uuid"])assert.equal(create({...input,requestId},expected),null);
 for(const field of ["endpoint","headers","token","credentials","timeoutMs","provider_config_id","payloadDigest","requestDigest"])assert.equal(create({...input,[field]:"unexpected"},expected),null,field);
 for(const patch of [{model:"unregistered"},{model:[PROTOCOL_MODELS.qwen]},{stream:true},{enable_thinking:true},{max_tokens:0},{max_tokens:8193},{max_tokens:1.1},{max_tokens:"128"},{response_format:{type:"json_object",extra:true}},{response_format:{type:["json_object"]}},{extra:true}])assert.equal(create({...input,payload:{...input.payload,...patch}},expected),null);
 for(const messages of [[{role:"system",content:"caller system"},input.payload.messages[1]],[input.payload.messages[0],{role:["user"],content:"x"}],[...input.payload.messages,{role:"assistant",content:"extra"}],[input.payload.messages[0],{role:"user",content:"x",header:true}]])assert.equal(create({...input,payload:{...input.payload,messages}},expected),null);
 assert.equal(create({...input,binding:{...expected,provider:["qwen"]}},expected),null);assert.equal(create(input,{...expected,extra:true}),null);
});
test("actual UTF8 outbound byte ceiling is inclusive; legal controls preserved, NUL and unpaired UTF16 denied",()=>{
 const overhead=Buffer.byteLength(JSON.stringify(payload("")),"utf8"),remaining=65536-overhead;
 const text="\u0001".repeat(Math.floor(remaining/6))+"x".repeat(remaining%6);
 assert.ok(text.length<32768);const at=create(raw(text),expected);assert.ok(at);assert.equal(Buffer.byteLength(at.body,"utf8"),65536);assert.equal(at.payloadDigest,byteLimitVector.payloadDigest);assert.equal(at.requestDigest,byteLimitVector.requestDigest);
 assert.equal(create(raw(text+"x"),expected),null);
 for(const text of ["\0","a\0b","\ud800","\udc00","a\ud800b"," ","x".repeat(32769)])assert.equal(create(raw(text),expected),null);
 assert.ok(create(raw("😀\b\f\n\r\t"),expected));
 const changed=create({...raw(vectors[0].text),requestId:tuple[0]},expected);assert.ok(changed);assert.equal(changed.payloadDigest,vectors[0].payloadDigest);assert.notEqual(changed.requestDigest,vectors[0].requestDigest);
});

test("request correlation requires canonical lowercase UUIDs before expected comparison and hashing",()=>{
 const lower="abcdef00-0000-0000-0000-000000000001",upper=lower.toUpperCase();
 for(const k of tupleKeys.slice(0,8)){
  const b={...expected,[k]:lower},input={...raw("synthetic"),binding:b};assert.ok(create(input,b));
  assert.equal(create({...input,binding:{...b,[k]:upper}},{...b,[k]:upper}),null,k);
  assert.equal(create(input,{...b,[k]:upper}),null,k);
 }
 assert.ok(create({...raw("synthetic"),requestId:lower},expected));assert.equal(create({...raw("synthetic"),requestId:upper},expected),null);
});
