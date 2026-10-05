import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {nativeHTTPEnvironmentPorts} from '../turn/native-http-ports.mjs';
const lit=s=>"'"+String(s).replaceAll("'","''")+"'";
test('real local GoTrue JWT PostgREST RPC owner qualification revocation and erasure', {skip:process.env.VP_COMMUNITY_JWT_TEST!=='1',timeout:240000},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();assert.equal(local.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];
 t.after(()=>{if(users.length)sql('delete from auth.users where id in('+users.map(x=>lit(x.id)).join(',')+');');});
 async function signup(){
  const email='vpj48-'+uuid()+'@example.test',password='Disposable-'+uuid()+'!';
  const response=await fetch(local.API_URL+'/auth/v1/signup',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'owned synthetic signup');const data=await response.json();assert.ok(data.access_token&&data.user?.id);const u={id:data.user.id,token:data.access_token};users.push(u);return u;
 }
 const rpc=async(u,v,bytes=['submit','review','withdraw','delete'].includes(v.action)?JSON.stringify(v):null)=>{
  const response=await fetch(local.API_URL+'/rest/v1/rpc/community_workspace',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:JSON.stringify({p_input:{protocol:'community-j1/1',command:v,mutationBytes:bytes}}),signal:AbortSignal.timeout(30000)});
  const value=await response.json();return {ok:response.ok,value};
 };
 const a=await signup(),r=await signup(),other=await signup();
 assert.equal((await rpc(a,{action:'mine',cursor:null})).value.message,'COMMUNITY_DISABLED');
 assert.equal((await rpc(a,{action:'session'})).value.kind,'session');
 // Fixture-only setup AFTER default-off/direct ACL observation, no production seed.
 assert.equal(sql("select count(*) from community_private.reviewers;"),'0');
 assert.equal(sql("select has_function_privilege('anon','public.community_workspace(jsonb)','EXECUTE');"),'f');
 sql(`update community_private.settings set enabled=true;insert into community_private.reviewers values('${r.id}',true);`);
 const s={action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'help',title:'Synthetic help',content:'Owned disposable private body',benefitDisclosure:'',place:null,consent:'internal-review-v1'};
 assert.equal((await rpc(a,s)).value.submission.authorDisclosure,'unknown');
 assert.equal((await rpc(other,{action:'read',submissionId:s.submissionId})).value.message,'COMMUNITY_NOT_FOUND');
 const rev={action:'review',operationId:uuid(),submissionId:s.submissionId,expectedVersion:1,decision:'approve',note:'Author visible'};
 assert.equal((await rpc(a,rev)).value.message,'COMMUNITY_FORBIDDEN');assert.equal((await rpc(r,rev)).value.submission.status,'published');
 assert.equal((await rpc(a,{action:'read',submissionId:s.submissionId})).value.submission.reviewNote,rev.note);
 const w={action:'withdraw',operationId:uuid(),submissionId:s.submissionId,expectedVersion:2};assert.equal((await rpc(a,w)).value.submission.content,'');assert.equal((await rpc(a,s)).value.submission.content,'');
 sql(`update community_private.reviewers set active=false where actor_id='${r.id}';update community_private.settings set enabled=false;`);
 assert.equal((await rpc(r,{action:'operation',operationId:rev.operationId,mutationBytes:JSON.stringify(rev)})).value.message,'COMMUNITY_FORBIDDEN');
 const del={action:'delete',operationId:uuid(),confirmed:true};assert.equal((await rpc(a,del)).value.kind,'deleted');assert.equal((await rpc(a,{action:'export'})).value.submissions[0].status,'deleted');
 // Token remains cryptographically valid, but deleting its actual current Auth session denies every data exit.
 const session=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url').toString()).session_id;sql(`delete from auth.sessions where id=${lit(session)} and user_id=${lit(a.id)};`);
 const stale=await rpc(a,{action:'export'});assert.equal(stale.ok,false);assert.equal(stale.value.message,'SESSION_REPLACED');
});
