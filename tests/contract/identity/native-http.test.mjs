import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeIdentityHTTP } from '../../../lib/server/identity/native-http.ts';
const config={url:'http://127.0.0.1:59721',publishableKey:'synthetic-unused'};
const req=(body='{}',headers={})=>new Request('http://127.0.0.1/api/auth/native/v2/login',{method:'POST',headers,body});
test('native API is unavailable without explicit local configuration',async()=>{
 assert.equal((await nativeIdentityHTTP(req(),'login',null)).status,503);
 assert.equal((await nativeIdentityHTTP(req(),'login',{...config,url:'https://project.supabase.co'})).status,503);
});
test('native cookie and Origin ambiguity fails before credentials are accessed',async()=>{
 for(const headers of [{Cookie:''},{Origin:'http://127.0.0.1'},{Cookie:'custom-session=x',Authorization:'Bearer bad'}]){
 assert.equal((await nativeIdentityHTTP(req('{}',headers),'login',config)).status,400);
 }
});
test('native requests reject unknown fields and malformed attempts',async()=>{
 for(const body of ['{broken','{}','[]','null','{"attemptId":"wrong"}','{"attemptId":"00000000-0000-4000-8000-000000000001","subject":"forged"}']){
 assert.equal((await nativeIdentityHTTP(req(body),'login',config)).status,400);
 }
 assert.equal((await nativeIdentityHTTP(req('{"refreshToken":"","subject":"forged"}'),'refresh',config)).status,400);
});
