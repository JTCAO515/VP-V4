/** Owned disposable Auth → Library UI; no existing fixture or producer is modified. */
import { createNativeTextEnvironment } from '../turn/native-text-environment.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID as uuid } from 'node:crypto';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
import {nativeHTTPPorts,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../turn/native-http-ports.mjs';

const output=process.env.VP_LIBRARY_OUTPUT,device=process.env.VP_LIBRARY_SIMULATOR;
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9a-f]{36}$/i.test(device))throw Error('Fresh absolute output and Simulator required');
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Docker overrides refused');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
if(!JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0].Endpoints.docker.Host.startsWith('unix:///'))throw Error('Local Docker required');
const ports=nativeHTTPPorts(process.env.VP_NATIVE_HTTP_PORT_BASE||63020),proxyPort=ports.base+32;
await assertNativeHTTPPortsFree(ports);
for(const port of [proxyPort])await new Promise((ok,fail)=>{const s=createServer();s.once('error',()=>fail(Error('Disposable port busy')));s.listen(port,'127.0.0.1',()=>s.close(ok));});
mkdirSync(output,{recursive:true});
const target=mkdtempSync(join(tmpdir(),'vp-library-ui-')),project='vp-native-ask-'+uuid().slice(0,8);
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports));
cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context,...nativeHTTPChildEnv(ports,target),VISEPANDA_TRIP_PROTOCOL_V2:'true'};
Object.assign(process.env,env);
async function run(command,args,name){
 const log=name?createWriteStream(join(output,name+'.log'),{mode:0o600}):null;
 const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});
 if(log){child.stdout.pipe(log);child.stderr.pipe(log);}else{child.stdout.resume();child.stderr.resume();}
 const deadline=setTimeout(()=>child.kill('SIGTERM'),name==='tests'?180000:600000);
 const code=await new Promise((ok,fail)=>{child.once('exit',ok);child.once('error',fail);});clearTimeout(deadline);log?.end();
 if(code!==0)throw Error((name||command)+' failed; inspect private test log');
}
let e,proxy; const routes=[];
try{
 await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 e=await createNativeTextEnvironment();
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,'synthetic request status '+r.status);return r.json();};
 const actor=e.users[2],attemptId=uuid(),credential=await call('/api/auth/native/v2/credentials',null,'POST',{email:actor.email,password:actor.password,attemptId});
 await call('/api/auth/native/v2/login',credential.accessToken,'POST',{attemptId});
 await call('/api/translate/consent',credential.accessToken,'POST',{policyId:e.policyId,noticeHash:e.noticeHash});
 // Freeze only this disposable actor's model budget; admission/read rights remain separate.
 e.sql(`update public.model_budget_scopes set frozen=true where owner_id='${actor.id}';`);
 const seed=async(original,translation,ordinary=false)=>{
  const turnId=uuid(),threadId=uuid(),idempotencyKey=uuid();
  await call(ordinary?'/api/chat/native/v1/turns':'/api/translate',credential.accessToken,'POST',ordinary?{turnId,threadId,idempotencyKey,policyId:e.policyId,locale:'en',text:original}:{turnId,threadId,idempotencyKey,policyId:e.policyId,sourceLocale:'en',targetLocale:'zh',text:original});
  const body=JSON.stringify({translation,backTranslation:original}).replaceAll("'","''");
  e.sql(`update public.turns set status='completed' where id='${turnId}';update turn_private.text_content set output_kind='answered',output_text='${body}' where turn_id='${turnId}';`);
  return turnId;
 };
 const old=await seed('Library old CNY 50','旧译50元');
 for(let i=0;i<21;i++)await seed('PRIVATE ordinary '+i,'ordinary',true);
 let newest;for(let i=0;i<25;i++)newest=await seed('Library new '+i+' CNY 50','新'+i+'译50元');
 assert.ok(!(await call('/api/translate',credential.accessToken)).phrases.some(p=>p.turnId===old));
 assert.equal((await call('/api/translate/history/v2/turns/'+old,credential.accessToken)).phrase.turnId,old);
 let bearer,expectedEpoch;
 proxy=createServer(async(req,res)=>{
  try{
   if(req.url==='/__library/session-proof'&&req.method==='GET'){
    if(!bearer)throw Error('Owned UI login not observed');
    const session=await call('/api/auth/native/v2/session',bearer);
    const sameEpoch=expectedEpoch===undefined||expectedEpoch===session.mobileEpoch;
    expectedEpoch??=session.mobileEpoch;
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({authenticated:session.subject===actor.id&&Number.isInteger(session.mobileEpoch)&&sameEpoch}));return;
   }
   if(req.url==='/__library/revoke'&&req.method==='POST'){
    if(!bearer)throw Error('Owned UI bearer not observed');
    await call('/api/translate/consent',bearer,'DELETE',{policyId:e.policyId});
    res.writeHead(200);res.end('{}');return;
   }
   const parts=[];for await(const p of req)parts.push(p);const bytes=Buffer.concat(parts);
   const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
   if(req.url.startsWith('/api/translate/history/v2')&&headers.authorization?.startsWith('Bearer '))bearer=headers.authorization.slice(7);
   const r=await fetch(e.api+req.url,{method:req.method,headers,...(bytes.length?{body:bytes}:{}),redirect:'error'});
   routes.push({method:req.method,path:new URL(req.url,'http://127.0.0.1').pathname,status:r.status});
   if(['/api/auth/native/v2/login','/api/auth/native/v2/profile'].includes(req.url)&&r.ok&&headers.authorization?.startsWith('Bearer '))bearer=headers.authorization.slice(7);
   res.writeHead(r.status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(Buffer.from(await r.arrayBuffer()));
  }catch{res.writeHead(503);res.end('{"error":{"code":"SYNTHETIC_CONTROL_UNAVAILABLE"}}');}
 });await new Promise(ok=>proxy.listen(proxyPort,'127.0.0.1',ok));
 await run('xcodebuild',['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',join(output,'build'),'CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-'],'build');
 const products=join(output,'build/Build/Products'),profile={VP_LIBRARY_UI_TEST:'1',VP_LIBRARY_API:'http://127.0.0.1:'+proxyPort,VP_LIBRARY_EMAIL:actor.email,VP_LIBRARY_OLD_TURN:old,VP_LIBRARY_NEWEST_TURN:newest,VP_LIBRARY_CONTROL:'http://127.0.0.1:'+proxyPort+'/__library/revoke',VP_LIBRARY_SESSION_PROOF:'http://127.0.0.1:'+proxyPort+'/__library/session-proof'};
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
p=pathlib.Path(sys.argv[1]);files=list(p.glob('*.xctestrun'));assert len(files)==1
d=plistlib.loads(files[0].read_bytes());d['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
q=p/'Library.xctestrun';q.write_bytes(plistlib.dumps(d));q.chmod(0o600)`,products],{input:JSON.stringify(profile)});
 await run('xcodebuild',['test-without-building','-xctestrun',join(products,'Library.xctestrun'),'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-collect-test-diagnostics','never','-only-testing:VisePandaUITests/AppShellUITests/testLibraryV2AuthenticatedOlderExactAndReturn','-resultBundlePath',join(output,'tests.xcresult')],'tests');
 const uiResult=JSON.parse(execFileSync('xcrun',['xcresulttool','get','test-results','summary','--path',join(output,'tests.xcresult')],{encoding:'utf8'}));
 assert.equal(uiResult.passedTests,1,'a restarted runner with zero executed tests is not a UI pass');
 assert.equal(uiResult.failedTests,0);
 assert.equal(e.counts.http,0,'no model/provider calls in preparation or reader UI');
 writeFileSync(join(output,'summary.json'),JSON.stringify({scope:'owned disposable Auth/HTTP/SQL and native UI; synthetic terminal output',translationRows:26,ordinaryRows:21,olderAbsentFromLegacy20:true,modelCalls:e.counts.http,ui:'PASS',consentWithdrawal:true},null,2)+'\n');
 console.log('LIBRARY_AUTH_UI_PASS '+join(output,'summary.json'));
}finally{
 writeFileSync(join(output,'routes-status.json'),JSON.stringify(routes,null,2)+'\n');
 if(proxy){proxy.closeAllConnections();await new Promise(ok=>proxy.close(ok));}
 try { await e?.cleanup(); } finally {
  await run('supabase',['stop','--workdir',target,'--no-backup']);
  rmSync(target,{recursive:true,force:true});
 }
}
