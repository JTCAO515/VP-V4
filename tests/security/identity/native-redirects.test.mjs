import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, webcrypto } from 'node:crypto';
import { nativeIdentityHTTP } from '../../../lib/server/identity/native-http.ts';
import { verifyNativeCredentials } from '../../../lib/server/identity/native-credentials.ts';
import { nativeFetch } from '../../../lib/server/identity/native-fetch.ts';

async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return 'http://127.0.0.1:'+server.address().port;
}
async function fixture(t,code) {
  let secondHops=0;
  const sink=createServer((req,res)=>{secondHops++;req.resume();res.end('{}');});
  const sinkURL=await listen(sink);
  let mode='normal';
  let redirected=0;
  let firstHopCredential=false;
  let publicOrigin;
  let token;
  const subject=randomUUID(),sessionId=randomUUID();
  const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk={...await webcrypto.subtle.exportKey('jwk',keys.publicKey),kid:randomUUID(),alg:'ES256',use:'sig'};
  const source=createServer(async(req,res)=>{
    const url=new URL(req.url,publicOrigin);
    const body=await Array.fromAsync(req).then(parts=>Buffer.concat(parts).toString());
    const shouldRedirect=(mode==='credentials' && url.pathname==='/auth/v1/token') ||
      (mode==='refresh' && url.pathname==='/auth/v1/token') ||
      (mode==='prepare' && url.pathname==='/rest/v1/rpc/native_prepare_v2') ||
      (mode==='jwks' && url.pathname.endsWith('/jwks.json')) ||
      (mode==='user' && url.pathname==='/auth/v1/user') ||
      (mode==='from' && url.pathname==='/rest/v1/user_profiles') ||
      (mode==='rpc' && url.pathname==='/rest/v1/rpc/native_session_v2');
    if(shouldRedirect){
      redirected++;
      firstHopCredential=Boolean(req.headers.apikey || req.headers.authorization || body);
      res.writeHead(code,{Location:sinkURL+'/must-not-receive'});res.end();return;
    }
    res.setHeader('Content-Type','application/json');
    if(url.pathname.endsWith('/jwks.json')){res.end(JSON.stringify({keys:mode==='user'?[]:[jwk]}));return;}
    if(url.pathname==='/auth/v1/token'){
      res.end(JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:subject,aud:'authenticated',role:'authenticated'}}));return;
    }
    if(url.pathname==='/headers'){res.end(JSON.stringify({marker:req.headers['x-native-probe']}));return;}
    if(url.pathname==='/hold'){return;}
    res.end('[]');
  });
  publicOrigin=await listen(source);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload=encode({alg:'ES256',typ:'JWT',kid:jwk.kid})+'.'+encode({sub:subject,session_id:sessionId,role:'authenticated',is_anonymous:false,aud:'authenticated',iss:publicOrigin+'/auth/v1',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
  token=payload+'.'+Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(payload))).toString('base64url');
  t.after(()=>{source.closeAllConnections();source.close();sink.closeAllConnections();sink.close();});
  return {config:{url:publicOrigin,publishableKey:'synthetic-public',serviceRoleKey:'synthetic-service'},token,setMode:value=>{mode=value;redirected=0;firstHopCredential=false;},check:()=>{assert.ok(redirected>0,'real first-hop redirect observed');assert.ok(firstHopCredential,'credential-bearing first hop exercised');assert.equal(secondHops,0,'no second-hop request or credential forwarding');}};
}
for(const code of [307,308]) {
  test('native SDK clients reject '+code+' before forwarding any credential', {timeout:60000}, async t=>{
    const f=await fixture(t,code);
    for(const action of ['credentials','refresh']) {
      f.setMode(action);
      const body=action==='credentials'?{email:'synthetic@example.test',password:'synthetic-password',attemptId:randomUUID()}:{refreshToken:'synthetic-refresh'};
      const result=await nativeIdentityHTTP(new Request('http://127.0.0.1/native',{method:'POST',body:JSON.stringify(body)}),action,f.config);
      assert.equal(result.status,401);
      assert.deepEqual(await result.json(),{error:{code:'UNAUTHENTICATED'}});
      f.check();
    }
    f.setMode('prepare');
    const result=await nativeIdentityHTTP(new Request('http://127.0.0.1/native',{method:'POST',body:JSON.stringify({email:'synthetic@example.test',password:'synthetic-password',attemptId:randomUUID()})}),'credentials',f.config);
    assert.equal(result.status,503);f.check();
    for(const mode of ['jwks','user']) {
      // A fresh origin/SDK instance avoids cached JWKS masking this network path.
      const v=await fixture(t,code);v.setMode(mode);
      assert.equal(await verifyNativeCredentials({headers:new Headers({Authorization:'Bearer '+v.token})},v.config),null);v.check();
    }
    f.setMode('normal');
    const actor=await verifyNativeCredentials({headers:new Headers({Authorization:'Bearer '+f.token})},f.config);
    assert.ok(actor,'normal signed credential verification remains available');
    f.setMode('from');assert.ok((await actor.client.from('user_profiles').select('owner_id')).error);f.check();
    f.setMode('rpc');assert.ok((await actor.client.rpc('native_session_v2',{p_action:'session'})).error);f.check();
  });
}
test('native fetch preserves Request headers and cancellation',async t=>{
  const f=await fixture(t,307);
  const response=await nativeFetch(new Request(f.config.url+'/headers',{headers:{'x-native-probe':'preserved'}}));
  assert.deepEqual(await response.json(),{marker:'preserved'});
  const abort=new AbortController();
  const pending=nativeFetch(f.config.url+'/hold',{signal:abort.signal});
  abort.abort();
  await assert.rejects(pending,{name:'AbortError'});
});
