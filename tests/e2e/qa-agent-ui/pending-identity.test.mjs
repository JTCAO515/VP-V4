import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('components/qa-agent/pending-identity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(source,{exports});
const {PENDING_IDENTITY_KEY:key,readPendingIdentities:read,rememberPendingIdentity:remember,confirmPendingIdentity:confirm,clearPendingIdentities:clear}=exports;
const actor='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const identity={sessionId:'33333333-3333-4333-8333-333333333333',requestId:'44444444-4444-4444-8444-444444444444'};
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
test('content-free identity survives reload and cannot be replaced by another UUID',()=>{
 const s=storage();remember(actor,{...identity,text:'private question',token:'never persist'},s);
 const raw=s.getItem(key),saved=JSON.parse(raw);assert.deepEqual(saved,{version:1,actorId:actor,requests:[identity]});
 assert.equal(raw.includes('private question'),false);assert.equal(raw.includes('token'),false);assert.equal(read(actor,s)[0].requestId,identity.requestId);
 assert.throws(()=>remember(actor,{...identity,requestId:other},s));assert.equal(s.getItem(key),raw);
});
test('different actor and logout clear recovery metadata without exposing old requests',()=>{
 const s=storage();remember(actor,identity,s);assert.equal(read(other,s).length,0);assert.equal(s.getItem(key),null);
 remember(other,identity,s);clear(s);assert.equal(s.getItem(key),null);
});
test('only matching confirmed receipt clears unresolved identity',()=>{
 const s=storage();remember(actor,identity,s);confirm(actor,{...identity,requestId:other},s);assert.equal(read(actor,s).length,1);
 confirm(actor,identity,s);assert.equal(s.getItem(key),null);
});
test('unavailable, malformed, silent write and cleanup failure all fail closed',()=>{
 const blocked={getItem:()=>{throw Error('blocked')},setItem:()=>{},removeItem:()=>{}};assert.throws(()=>read(actor,blocked));
 const s=storage();s.setItem(key,JSON.stringify({version:1,actorId:actor,requests:[{...identity,text:'forbidden persisted content'}]}));assert.throws(()=>read(actor,s));
 const silent=storage();silent.setItem=()=>{};assert.throws(()=>remember(actor,identity,silent));
 const stuck=storage();remember(actor,identity,stuck);stuck.removeItem=()=>{};assert.throws(()=>confirm(actor,identity,stuck));assert.equal(read(actor,stuck).length,1);
});
test('stale actor mutation cannot delete or overwrite a new actor recovery identity',()=>{
 const s=storage();remember(other,identity,s);const raw=s.getItem(key);
 assert.throws(()=>confirm(actor,identity,s));assert.equal(s.getItem(key),raw);
 assert.throws(()=>remember(actor,{...identity,requestId:other},s));assert.equal(s.getItem(key),raw);
});
