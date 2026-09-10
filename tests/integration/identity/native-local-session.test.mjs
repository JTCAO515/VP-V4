import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { identityLocalEnv } from './local-supabase.mjs';
import { waitForNativeAPI } from './native-api-readiness.mjs';

const enabled = process.env.VP_NATIVE_LOCAL_INTEGRATION === 'true';
test('real disposable Auth → HTTP → persistent mobile epoch → RLS and revocation', { skip: !enabled, timeout: 180000 }, async (t) => {
  const state = identityLocalEnv();
  assert.ok(state,'explicit disposable target required');
  assert.ok(state.DB_CONTAINER);
  const key = state.PUBLISHABLE_KEY || state.ANON_KEY;
  assert.ok(key);
  const port=process.env.VP_NATIVE_API_PORT ?? '59731';
  assert.match(port,/^[1-9][0-9]{3,4}$/);
  const api = 'http://127.0.0.1:'+port;
  const server = process.env.VP_NATIVE_REUSE_LOCAL_API === 'true' ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',port], { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:state.SERVICE_ROLE_KEY },stdio:['ignore','pipe','pipe'] });
  if(server) {
    const serverLog=createWriteStream('/tmp/vpj04-native-api-'+port+'.log');
    server.stdout.pipe(serverLog);server.stderr.pipe(serverLog);
    t.after(() => server.kill('SIGTERM'));
  }
  await waitForNativeAPI(api,server);
  const client = () => createClient(state.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const password = 'local-only-'+randomUUID();
  const email = 'vpj04-'+randomUUID()+'@example.test';
  const syntheticIds=[];
  t.after(() => {
    if(!syntheticIds.length)return;
    const exact=syntheticIds.map(id=>"'"+id+"'").join(',');
    const sql=`delete from auth.users where id in (${exact}); select count(*) from auth.users where id in (${exact});`;
    const remaining=execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
    assert.equal(remaining,'0','every created synthetic account was removed');
  });
  const user = await client().auth.signUp({email,password});
  if(user.data.user)syntheticIds.push(user.data.user.id);
  assert.ok(user.data.user && !user.error,'synthetic signup');
  const otherEmail='vpj04-'+randomUUID()+'@example.test';
  const other=await client().auth.signUp({email:otherEmail,password});
  if(other.data.user)syntheticIds.push(other.data.user.id);
  assert.ok(other.data.user && !other.error,'other owner signup');
  const call=async(action,body,token,headers={})=>{
    const r=await fetch(api+'/api/auth/native/v2/'+action,{method:['session','profile'].includes(action)?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},...(['session','profile'].includes(action)?{}:{body:JSON.stringify(body)})});
    assert.ok(r.headers.get('content-type')?.includes('application/json'),'native '+action+' returned non-JSON HTTP '+r.status);
    return {status:r.status,body:await r.json()};
  };
  const web=await client().auth.signInWithPassword({email,password});
  assert.ok(web.data.session,'web session');
  const jwtClientEarly=token=>createClient(state.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
  assert.ok((await jwtClientEarly(web.data.session.access_token).rpc('native_prepare_v2',{p_owner:user.data.user.id,p_session:randomUUID(),p_attempt:randomUUID()})).error,'fresh Web bearer cannot manufacture native proof');
  const attempt=randomUUID();
  const a=await call('credentials',{email,password,attemptId:attempt});
  assert.equal(a.status,200,'credentials');
  assert.ok((await jwtClientEarly(a.body.accessToken).rpc('native_prepare_v2',{p_owner:user.data.user.id,p_session:randomUUID(),p_attempt:randomUUID()})).error,'ordinary actor cannot create proofs');
  const pendingRead=await jwtClientEarly(a.body.accessToken).from('user_profiles').select('owner_id');
  assert.deepEqual(pendingRead.data,[],'pending credential cannot read owner data');
  const logins=await Promise.all([call('login',{attemptId:attempt},a.body.accessToken),call('login',{attemptId:attempt},a.body.accessToken)]);
  assert.equal(logins[0].status,200,'login A');
  assert.deepEqual(logins[0].body,logins[1].body,'concurrent attempt idempotency');
  assert.equal(logins[0].body.mobileEpoch,1);
  const jwtClient=token=>createClient(state.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
  const aClient=jwtClient(a.body.accessToken);
  const save= c=>c.rpc('save_user_profile',{p_display_name:'local synthetic',p_travel_pace:'balanced',p_locale:'en',p_currency:'USD',p_distance_unit:'mile',p_temperature_unit:'celsius',p_default_departure_time:'09:00'});
  assert.equal((await save(aClient)).error,null,'active owner write');
  const own=await aClient.from('user_profiles').select('owner_id');
  assert.equal(own.error,null,'owner read error');
  assert.equal((await call('profile',{},a.body.accessToken)).body.displayName,'local synthetic','native API reads owner profile through RLS');
  assert.deepEqual(own.data,[{owner_id:user.data.user.id}],'owner RLS read');
  assert.deepEqual((await jwtClient(other.data.session.access_token).from('user_profiles').select('owner_id')).data,[],'other owner cannot read');
  assert.equal((await call('session',{},a.body.accessToken,{Cookie:'x=y'})).status,400,'cookie mixture rejected');
  assert.equal((await call('session',{},a.body.accessToken,{Origin:api})).status,400,'native Origin rejected');
  const refreshed=await call('refresh',{refreshToken:a.body.refreshToken});
  assert.equal(refreshed.status,200,'refresh');
  assert.equal(refreshed.body.mobileEpoch,1,'refresh preserves epoch');
  const consent=await aClient.rpc('create_memory_retrieval_consent');
  assert.equal(consent.error,null,'create synthetic consent receipt');
  const consentId=consent.data[0].consent_id;
  assert.equal((await aClient.rpc('grant_memory_retrieval_consent',{p_consent_id:consentId})).data[0].reused,true,'exercise no-write consent replay');
  const trip=await aClient.from('trips').insert({owner_id:user.data.user.id,title:'Local auth revocation probe'}).select('id').single();
  assert.equal(trip.error,null,'synthetic Trip');
  const proposal=await aClient.from('trip_proposals').insert({owner_id:user.data.user.id,trip_id:trip.data.id,revision:1,base_trip_version:0,status:'pending',patch:{title:'Local confirmed auth probe'},expires_at:'2099-01-01T00:00:00Z'}).select('id').single();
  assert.equal(proposal.error,null,'synthetic pending Proposal');
  const confirmation={p_proposal_id:proposal.data.id,p_idempotency_key:randomUUID(),p_digest:'local-auth-revocation-probe'};
  const confirmed=await aClient.rpc('confirm_and_apply_trip_proposal',confirmation);
  assert.equal(confirmed.error,null,'synthetic explicit confirmation');
  assert.equal((await aClient.rpc('confirm_and_apply_trip_proposal',confirmation)).data[0].outcome,'already_applied','exercise no-write confirmation replay');
  const thread=await aClient.from('chat_threads').insert({owner_id:user.data.user.id}).select('id').single();
  assert.equal(thread.error,null,'synthetic thread state only; no C2/model call');
  const turn={p_thread_id:thread.data.id,p_turn_id:randomUUID(),p_idempotency_key:randomUUID(),p_digest:'chat-state-control-v1'};
  assert.equal((await aClient.rpc('start_chat_turn',turn)).error,null);
  assert.equal((await aClient.rpc('start_chat_turn',turn)).data[0].reused,true,'exercise no-write turn replay');
  const attemptB=randomUUID();
  const b=await call('credentials',{email,password,attemptId:attemptB});
  assert.equal(b.status,200);
  // A disposable test barrier holds the REAL owner write transaction open; it does not
  // replace the production guard, Auth, RLS or save_user_profile implementation.
  const sql=statement=>execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  sql("create function public.vpj04_test_write_barrier() returns boolean language plpgsql security invoker set search_path='' as $$ begin perform public.save_user_profile('Local ordered write','balanced','en','USD','mile','celsius','09:00'); perform pg_sleep(2); return true; end $$; revoke all on function public.vpj04_test_write_barrier() from public,anon; grant execute on function public.vpj04_test_write_barrier() to authenticated;");
  t.after(()=>sql('drop function public.vpj04_test_write_barrier();'));
  const inFlightWrite=Promise.resolve(aClient.rpc('vpj04_test_write_barrier'));
  let sleeping=false;
  for(let i=0;i<40;i++){
    sleeping=sql("select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%vpj04_test_write_barrier%';")!=='0';
    if(sleeping)break;
    await new Promise(r=>setTimeout(r,25));
  }
  assert.ok(sleeping,'actual owner RPC holds the account lock while sleeping');
  const replacing=call('login',{attemptId:attemptB},b.body.accessToken);
  let waiting=false;
  for(let i=0;i<30;i++){
    waiting=sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%native_session_v2%';")!=='0';
    if(waiting)break;
    await new Promise(r=>setTimeout(r,25));
  }
  assert.ok(waiting,'replacement waits on the same account lock as an in-flight business RPC');
  assert.equal((await inFlightWrite).error,null,'write admitted before replacement commits first');
  assert.equal((await replacing).body.mobileEpoch,2,'second phone replaces first after the write');
  assert.equal((await call('session',{},refreshed.body.accessToken)).status,401,'old phone rejected');
  assert.equal((await call('login',{attemptId:attempt},a.body.accessToken)).status,401,'old attempt cannot reclaim');
  assert.ok((await aClient.rpc('native_session_v2',{p_action:'prepare',p_attempt:randomUUID()})).error,'old sid cannot obtain fresh proof');
  assert.equal((await call('refresh',{refreshToken:refreshed.body.refreshToken})).status,401,'old refresh rejected');
  const direct=await client().auth.refreshSession({refresh_token:refreshed.body.refreshToken});
  assert.ok(direct.error,'direct Auth refresh revoked');
  assert.ok((await save(aClient)).error,'direct definer write revoked');
  for(const [rpc,args] of [['confirm_and_apply_trip_proposal',confirmation],['start_chat_turn',turn],['grant_memory_retrieval_consent',{p_consent_id:consentId}]]){
    const replay=await aClient.rpc(rpc,args);
    assert.ok(replay.error?.message.includes('SESSION_REPLACED'),'revoked definer replay denied: '+rpc);
    assert.equal(replay.data,null,'no old receipt disclosed');
  }
  assert.deepEqual((await aClient.from('user_profiles').select('owner_id')).data,[],'revoked read hidden');
  assert.equal((await call('logout',{},a.body.accessToken)).status,401,'old logout cannot clear newer session');
  assert.equal((await call('session',{},b.body.accessToken)).status,200,'new phone survives old logout');
  const jar=new Map();
  const webSSR=createServerClient(state.API_URL,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
  assert.equal((await webSSR.auth.setSession({access_token:web.data.session.access_token,refresh_token:web.data.session.refresh_token})).error,null,'real Web SDK cookie session retained');
  assert.ok(jar.size,'SSR SDK emitted session cookies');
  const cookie=[...jar].map(([name,value])=>name+'='+value).join('; ');
  const webInput={displayName:'Web retained',travelPace:'balanced',locale:'en',currency:'USD',distanceUnit:'mile',temperatureUnit:'celsius',defaultDepartureTime:'09:00'};
  const webMutation=headers=>fetch(api+'/api/profile',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(webInput)});
  assert.equal((await webMutation({})).status,403,'real Web Cookie missing Origin denied');
  assert.equal((await webMutation({Origin:'https://hostile.invalid'})).status,403,'real Web Cookie hostile Origin denied');
  assert.equal((await webMutation({Origin:api})).status,200,'real Web Cookie same-origin mutation survives phone replacement');
  assert.equal((await webMutation({Origin:api,Authorization:'Bearer '+b.body.accessToken})).status,401,'mixed Web credentials do not fall back to Cookie');
  const webRead=await fetch(api+'/api/profile',{headers:{Cookie:cookie}});
  assert.equal(webRead.status,200,'real Web Cookie owner read');
  assert.equal((await webRead.json()).displayName,'Web retained');
  assert.equal((await save(jwtClient(web.data.session.access_token))).error,null,'Web still writes');
  assert.ok((await client().auth.refreshSession({refresh_token:web.data.session.refresh_token})).data.session,'Web refresh survives');
  let logoutToken=b.body.accessToken;
  if(process.env.VP_NATIVE_REAL_EXPIRY==='true') {
    const wait=Math.max(0,b.body.expiresAt*1000-Date.now()+1200);
    assert.ok(wait<75000,'requires explicitly configured short-lived local Auth tokens');
    await new Promise(resolve=>setTimeout(resolve,wait));
    assert.equal((await call('session',{},b.body.accessToken)).status,401,'naturally expired signed token rejected');
    const afterExpiry=await call('refresh',{refreshToken:b.body.refreshToken});
    assert.equal(afterExpiry.status,200,'real expired session refresh');
    assert.equal(afterExpiry.body.mobileEpoch,2,'expiry refresh preserves mobile epoch');
    logoutToken=afterExpiry.body.accessToken;
    t.diagnostic('Naturally expired Auth-signed token rejected; refresh retained the same mobile epoch.');
  }
  assert.equal((await call('logout',{},logoutToken)).status,200,'logout');
  assert.equal((await call('session',{},b.body.accessToken)).status,401,'logout revokes access');
  assert.ok((await save(jwtClient(b.body.accessToken))).error,'logout direct writes blocked');
});
