import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {getLocalNativeTextConfig,nativeTextHTTP} from '../../../lib/server/turn/native-http.ts';
const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','VISEPANDA_NATIVE_LOCAL_TEXT','VISEPANDA_NATIVE_LOCAL_TEXT_POLICY'];
function configure(t,patch={}){
 const prior=new Map(names.map(n=>[n,process.env[n]]));t.after(()=>{for(const[n,v]of prior)v===undefined?delete process.env[n]:process.env[n]=v;});
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59641',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-unused',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:'11111111-1111-4111-8111-111111111111',...patch});
}
test('native text is closed by default and remote or credential-bearing targets cannot enable it',async t=>{
 configure(t,{VISEPANDA_NATIVE_LOCAL_TEXT:'false'});assert.equal(getLocalNativeTextConfig(),null);
 assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy'),'policy')).status,503);
 process.env.VISEPANDA_NATIVE_LOCAL_TEXT='true';
 for(const url of ['https://project.supabase.co','http://127.0.0.1.attacker.test','http://user:pass@127.0.0.1:59641']){process.env.NEXT_PUBLIC_SUPABASE_URL=url;assert.equal(getLocalNativeTextConfig(),null);}
});
test('native text rejects ambient cookies, Origin and unexpected query fields before credential access',async t=>{
 configure(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not call');});
 for(const headers of [{Cookie:''},{Origin:'http://127.0.0.1'},{Cookie:'unexpected',Authorization:'Bearer synthetic'}]){
  assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy',{headers}),'policy')).status,400);
 }
 assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy?owner=other'),'policy')).status,400);
 assert.equal(calls,0);
});
