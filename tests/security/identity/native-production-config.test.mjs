import test from 'node:test';
import assert from 'node:assert/strict';
import {getNativeRuntimeConfig,nativeTargetAllowed} from '../../../lib/server/identity/native-config.ts';
import {nativeIdentityHTTP} from '../../../lib/server/identity/native-http.ts';
import {nativeReadEnabled} from '../../../lib/server/knowledge/native-read-flag.ts';
import {translationHTTP} from '../../../lib/server/media-translation/text/http.ts';
import {NextRequest} from 'next/server.js';

const ref='abcdefghijklmnopqrst';
const origin='https://go2china.space';
const target={url:`${origin}/api/auth/native/v2/session`};
const settings={
 VERCEL_ENV:'production',VISEPANDA_NATIVE_PRODUCTION:'true',VISEPANDA_NATIVE_PRODUCTION_SESSION:'true',
 VISEPANDA_NATIVE_PRODUCTION_TRIP:'true',VISEPANDA_NATIVE_PRODUCTION_ORIGIN:origin,VISEPANDA_PUBLIC_ORIGIN:origin,
 VISEPANDA_NATIVE_PRODUCTION_PROJECT_REF:ref,VISEPANDA_TRIP_PROTOCOL_V2:'true',
 NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public',
 VISEPANDA_NATIVE_PRODUCTION_PROOF_KEY:'synthetic-proof',VISEPANDA_NATIVE_STAGING:'false',
 VISEPANDA_NATIVE_LOCAL_SESSION:'false',VISEPANDA_NATIVE_LOCAL_TRIP:'false',
 KNOWLEDGE_LOCAL_READ:'1',KNOWLEDGE_STAGING_READ:'1',KNOWLEDGE_PRODUCTION_READ:'0',
};
function configure(t,patch={}){
 const prior=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));
 t.after(()=>{for(const[key,value]of Object.entries(prior))value===undefined?delete process.env[key]:process.env[key]=value;});
 Object.assign(process.env,settings,patch);
}
test('Production session and Trip bind only the selected new project and exact origin',t=>{
 configure(t);
 const session=getNativeRuntimeConfig(target,'session','identity'),trip=getNativeRuntimeConfig(target,'trip','trip');
 assert.equal(session.environment,'production');
 assert.equal(session.serviceRoleKey,'synthetic-proof');
 assert.equal(trip.url,session.url);
 assert.equal(trip.publishableKey,session.publishableKey);
 assert.equal('serviceRoleKey' in trip,false);
});
test('Production flags fail closed independently, including stale config after rollback',t=>{
 configure(t);
 const captured=getNativeRuntimeConfig(target,'session','identity');
 process.env.VISEPANDA_NATIVE_PRODUCTION_SESSION='false';
 assert.equal(getNativeRuntimeConfig(target,'session','identity'),null);
 assert.equal(nativeTargetAllowed(captured,target),false);
 assert.ok(getNativeRuntimeConfig(target,'trip','trip'));
 process.env.VISEPANDA_NATIVE_PRODUCTION_TRIP='false';
 assert.equal(getNativeRuntimeConfig(target,'trip','trip'),null);
 process.env.VISEPANDA_NATIVE_PRODUCTION='false';
 assert.equal(nativeTargetAllowed(captured,target),false);
});
test('Preview, shared Staging, local and mismatched Production bindings are denied',t=>{
 configure(t);
 const changes=[
  {VERCEL_ENV:'preview'},{VERCEL_ENV:'development'},{VERCEL_ENV:''},
  {VISEPANDA_NATIVE_STAGING:'true'}, {VISEPANDA_TRIP_PROTOCOL_V2:'false'},
  {VISEPANDA_NATIVE_PRODUCTION_ORIGIN:'https://staging.go2china.space'},
  {VISEPANDA_NATIVE_PRODUCTION_ORIGIN:'https://attacker.test'},
  {VISEPANDA_PUBLIC_ORIGIN:'https://www.go2china.space'},
  {VISEPANDA_NATIVE_PRODUCTION_PROJECT_REF:'dzqdzetcctkhbrhlxxgn'},
  {VISEPANDA_NATIVE_PRODUCTION_PROJECT_REF:'not-a-ref'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://dzqdzetcctkhbrhlxxgn.supabase.co'},
  {NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co/path`},
  {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},
 ];
 for(const patch of changes){
  Object.assign(process.env,settings,patch);
  assert.equal(getNativeRuntimeConfig(target,'session','identity'),null,JSON.stringify(patch));
  assert.equal(getNativeRuntimeConfig(target,'trip','trip'),null,JSON.stringify(patch));
 }
});
test('Production rejects Preview aliases, lookalikes and credential-bearing origins',t=>{
 configure(t);
 for(const url of ['https://staging.go2china.space/api/auth/native/v2/session',
  'https://go2china.space.attacker.test/api/auth/native/v2/session',
  'https://user:secret@go2china.space/api/auth/native/v2/session',
  'http://go2china.space/api/auth/native/v2/session',
  'https://go2china.space:444/api/auth/native/v2/session',
  'https://vp-v4-synthetic-jtcao515s-projects.vercel.app/api/auth/native/v2/session']){
  assert.equal(getNativeRuntimeConfig({url},'session','identity'),null,url);
 }
});
test('Production handler rechecks disabled target before credential I/O',async t=>{
 configure(t);
 const config=getNativeRuntimeConfig(target,'session','identity');
 process.env.VISEPANDA_NATIVE_PRODUCTION='false';
 assert.equal((await nativeIdentityHTTP(new Request(target.url),'session',config)).status,503);
});
test('legacy native consumers stay closed in Production without an explicit surface',t=>{
 configure(t);
 assert.equal(getNativeRuntimeConfig(target,'session'),null);
 assert.equal(getNativeRuntimeConfig(target,'trip'),null);
 assert.equal(getNativeRuntimeConfig(target,'trip','identity'),null);
 assert.equal(getNativeRuntimeConfig(target,'session','trip'),null);
 assert.equal(getNativeRuntimeConfig(target,'session','text'),null);
 assert.equal(getNativeRuntimeConfig(target,'trip','text')?.environment,'production');
});
test('local and Staging knowledge flags cannot open Production native readiness',t=>{
 configure(t);
 assert.equal(nativeReadEnabled('production',process.env),false);
 process.env.KNOWLEDGE_PRODUCTION_READ='1';
 assert.equal(nativeReadEnabled('production',process.env),true);
 process.env.KNOWLEDGE_PRODUCTION_READ='0';
 assert.equal(nativeReadEnabled('staging',process.env),true);
});
test('Production translation stays closed even if the shared Ask lane opens',async t=>{
 configure(t);
 let calls=0;
 const request=new NextRequest(origin+'/api/translate/policy');
 const result=await translationHTTP(request,async()=>{calls++;throw Error('unexpected text call');});
 assert.equal(result.status,503);
 assert.equal(calls,0);
});
