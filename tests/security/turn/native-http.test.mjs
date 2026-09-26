import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {getNativeTextConfig,nativeTextHTTP} from '../../../lib/server/turn/native-http.ts';
const request=new NextRequest('http://127.0.0.1/api/chat/native/v1/policy');
const names=['VERCEL_ENV','VERCEL_URL','VISEPANDA_NATIVE_STAGING','VISEPANDA_TRIP_PROTOCOL_V2','VISEPANDA_NATIVE_STAGING_TEXT','VISEPANDA_NATIVE_STAGING_TEXT_POLICY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','VISEPANDA_NATIVE_LOCAL_TEXT','VISEPANDA_NATIVE_LOCAL_TEXT_POLICY','VISEPANDA_NATIVE_PRODUCTION','VISEPANDA_NATIVE_PRODUCTION_TRIP','VISEPANDA_NATIVE_PRODUCTION_PROJECT_REF','VISEPANDA_NATIVE_PRODUCTION_ORIGIN','VISEPANDA_PUBLIC_ORIGIN','VISEPANDA_NATIVE_PRODUCTION_TEXT','VISEPANDA_NATIVE_PRODUCTION_TEXT_POLICY','VISEPANDA_NATIVE_PRODUCTION_TASK_POLICY','VISEPANDA_NATIVE_PRODUCTION_GROUNDED','VISEPANDA_NATIVE_PRODUCTION_GROUNDED_POLICY'];
function configure(t,patch={}){
 const prior=new Map(names.map(n=>[n,process.env[n]]));t.after(()=>{for(const[n,v]of prior)v===undefined?delete process.env[n]:process.env[n]=v;});
 for(const name of names)delete process.env[name];
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59641',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-unused',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:'11111111-1111-4111-8111-111111111111',...patch});
}
test('native text is closed by default and remote or credential-bearing targets cannot enable it',async t=>{
 configure(t,{VISEPANDA_NATIVE_LOCAL_TEXT:'false'});assert.equal(getNativeTextConfig(request),null);
 assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy'),'policy')).status,503);
 process.env.VISEPANDA_NATIVE_LOCAL_TEXT='true';
 for(const url of ['https://project.supabase.co','http://127.0.0.1.attacker.test','http://user:pass@127.0.0.1:59641','http://127.0.0.1/path','http://127.0.0.1?key=bad','http://127.0.0.1#bad']){process.env.NEXT_PUBLIC_SUPABASE_URL=url;assert.equal(getNativeTextConfig(request),null);}
});
test('native text rejects ambient cookies, Origin and unexpected query fields before credential access',async t=>{
 configure(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not call');});
 for(const headers of [{Cookie:''},{Origin:'http://127.0.0.1'},{Cookie:'unexpected',Authorization:'Bearer synthetic'}]){
  assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy',{headers}),'policy')).status,400);
 }
 assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy?owner=other'),'policy')).status,400);
 assert.equal(calls,0);
});

test('staging Ask requires exact Preview, database, explicit activation and policy before any I/O',async t=>{
 configure(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not call');});
 const host='vp-v4-abc123-jtcao515s-projects.vercel.app';
 const good={NEXT_PUBLIC_SUPABASE_URL:'https://dzqdzetcctkhbrhlxxgn.supabase.co',VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_NATIVE_STAGING_TEXT:'true',VISEPANDA_NATIVE_STAGING_TEXT_POLICY:'AAAAAAAA-1111-4111-8111-111111111111'};
 const remote=new NextRequest('https://'+host+'/api/chat/native/v1/policy');
 Object.assign(process.env,good);
 assert.equal(getNativeTextConfig(remote)?.policyId,'aaaaaaaa-1111-4111-8111-111111111111');
 assert.equal(getNativeTextConfig(remote)?.environment,'staging');
 assert.equal(Object.hasOwn(getNativeTextConfig(remote),'serviceRoleKey'),false);
 for(const patch of [{VERCEL_ENV:'production'},{VERCEL_ENV:''},{VERCEL_URL:'vp-v4.vercel.app'},{VISEPANDA_NATIVE_STAGING:'false'},{VISEPANDA_TRIP_PROTOCOL_V2:'false'},{VISEPANDA_NATIVE_STAGING_TEXT:'false'},{VISEPANDA_NATIVE_STAGING_TEXT_POLICY:''},{VISEPANDA_NATIVE_STAGING_TEXT_POLICY:'not-a-uuid'},{NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59641'},{NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''}]){
  Object.assign(process.env,good,patch);
  assert.equal(getNativeTextConfig(remote),null,JSON.stringify(patch));
  assert.equal((await nativeTextHTTP(remote,'policy')).status,503);
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic-unused';
 }
 Object.assign(process.env,good);
 for(const origin of ['https://vp-v4.vercel.app','https://attacker.test','http://'+host,'https://'+host+':444'])assert.equal((await nativeTextHTTP(new NextRequest(origin+'/api/chat/native/v1/policy'),'policy')).status,503);
 Object.assign(process.env,{VISEPANDA_NATIVE_STAGING:'false',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59641'});
 for(const value of ['preview','production','development']){process.env.VERCEL_ENV=value;assert.equal((await nativeTextHTTP(request,'policy')).status,503);}
 assert.equal(calls,0);
});

test('Production Ask stays off until exact Production target, policy and text flag are selected',async t=>{
 configure(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not call');});
 const ref='abcdefghijklmnopqrst',origin='https://go2china.space';
 const production={VERCEL_ENV:'production',VISEPANDA_NATIVE_PRODUCTION:'true',VISEPANDA_NATIVE_PRODUCTION_TRIP:'true',
  VISEPANDA_NATIVE_PRODUCTION_PROJECT_REF:ref,VISEPANDA_NATIVE_PRODUCTION_ORIGIN:origin,VISEPANDA_PUBLIC_ORIGIN:origin,
  VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public',VISEPANDA_NATIVE_PRODUCTION_TEXT:'false',
  VISEPANDA_NATIVE_PRODUCTION_TEXT_POLICY:'AAAAAAAA-1111-4111-8111-111111111111'};
 const remote=new NextRequest(origin+'/api/chat/native/v1/policy');
 Object.assign(process.env,production);
 assert.equal(getNativeTextConfig(remote),null);
 process.env.VISEPANDA_NATIVE_PRODUCTION_TEXT='true';
 assert.equal(getNativeTextConfig(remote)?.environment,'production');
 assert.equal(getNativeTextConfig(remote)?.policyId,'aaaaaaaa-1111-4111-8111-111111111111');
 assert.equal(Object.hasOwn(getNativeTextConfig(remote),'serviceRoleKey'),false);
 for(const patch of [{VERCEL_ENV:'preview'},{VISEPANDA_NATIVE_STAGING:'true'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://dzqdzetcctkhbrhlxxgn.supabase.co'},
  {VISEPANDA_NATIVE_PRODUCTION_TRIP:'false'},{VISEPANDA_NATIVE_PRODUCTION_TEXT:'false'},
  {VISEPANDA_NATIVE_PRODUCTION_TEXT_POLICY:'not-a-policy'},
  {VISEPANDA_NATIVE_PRODUCTION_ORIGIN:'https://staging.go2china.space'}]){
  Object.assign(process.env,production,{VISEPANDA_NATIVE_PRODUCTION_TEXT:'true'},patch);
  assert.equal(getNativeTextConfig(remote),null,JSON.stringify(patch));
  assert.equal((await nativeTextHTTP(remote,'policy')).status,503);
 }
 Object.assign(process.env,production,{VISEPANDA_NATIVE_PRODUCTION_TEXT:'true'});
 for(const url of ['https://staging.go2china.space/api/chat/native/v1/policy',
  'https://go2china.space.attacker.test/api/chat/native/v1/policy'])
  assert.equal(getNativeTextConfig(new NextRequest(url)),null,url);
 assert.equal(getNativeTextConfig(remote,true),null);
 assert.equal(getNativeTextConfig(remote,'grounded'),null);
 assert.equal(calls,0);
});
