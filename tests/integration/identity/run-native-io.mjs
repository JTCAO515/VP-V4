/** Creates and removes only a new uniquely named disposable native identity stack. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { createClient } from '@supabase/supabase-js';
const repo=process.cwd();
const supabaseCLI=process.env.VP_SUPABASE_CLI || 'supabase';
const mode=process.argv.slice(2);
if(!mode.every(value=>['--same-trip','--simulator','--outline'].includes(value)) || new Set(mode).size!==mode.length || mode.length>1) throw Error('Use --same-trip, --simulator, --outline, or no arguments');
const sameTrip=mode.includes('--same-trip'), outline=mode.includes('--outline'), simulator=mode.includes('--simulator')||outline;
const base=58500;
if(!Number.isInteger(base)||base<1024||base>65000)throw new Error('Invalid disposable port base');
for(const offset of [20,21,22,23,24,27,29,31])await new Promise((ok,fail)=>{const socket=net.createServer();socket.once('error',()=>fail(new Error('Disposable test port unavailable')));socket.listen(base+offset,'127.0.0.1',()=>socket.close(ok));});
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw new Error('Explicit Docker overrides refused');
const {execFileSync}=await import('node:child_process');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
const inspected=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];
if(!inspected.Endpoints.docker.Host.startsWith('unix:///'))throw new Error('Local Docker context required');
process.env.DOCKER_CONTEXT=context;
const target=mkdtempSync(join(tmpdir(),'vpj04-native-io-'));
const project='vp-native-io-'+randomUUID().slice(0,8);
mkdirSync(join(target,'supabase'));
let config=readFileSync(join(repo,'supabase/config.toml'),'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`);
for(const offset of [20,21,22,23,24,27,29])config=config.replaceAll(String(54300+offset),String(base+offset));
config=config.replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
writeFileSync(join(target,'supabase/config.toml'),config);
cpSync(join(repo,'supabase/migrations'),join(target,'supabase/migrations'),{recursive:true});
function run(command,args,visible=false,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:repo,env,stdio:visible?'inherit':['ignore','pipe','pipe']});let output='';if(!visible){for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{output+=(part+'').slice(0,8192-output.length);});}child.once('error',()=>reject(new Error('Disposable process launch failed')));child.once('exit',code=>{if(code===0)return resolve(0);const category=/port is already allocated|address already in use/i.test(output)?'port-conflict':/docker daemon|cannot connect to docker/i.test(output)?'docker-unavailable':/pull|image/i.test(output)?'image-unavailable':'start-failed';const diagnostic=output.split(/\r?\n/).filter(line=>/error|failed|invalid|cannot|not found/i.test(line)).slice(-2).join(' ').replace(/https?:\/\/[^\s]+/g,'<redacted-url>').replace(/=[^\s]+/g,'=<redacted>').replace(/[A-Za-z0-9._-]{12,}/g,'<redacted>');reject(new Error(`Disposable process ${category}: ${diagnostic||'no safe diagnostic'} `));});});}
function native(command,args,log,env){return new Promise((resolve,reject)=>{const output=createWriteStream(log);const child=spawn(command,args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(output);child.stderr.pipe(output);child.once('error',()=>reject(new Error('Native simulator process launch failed')));child.once('exit',code=>{output.end();code===0?resolve():reject(new Error('Native simulator verification failed; inspect '+log));});});}
let exit=1,server,simulators=[], simulatorState, simulatorUsers=[], simulatorDerived;
try{
  await run(supabaseCLI,['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
  const testEnv={...process.env,VP_NATIVE_LOCAL_INTEGRATION:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VP_IDENTITY_SUPABASE_WORKDIR:target,VP_IDENTITY_SUPABASE_API_URL:`http://127.0.0.1:${base+21}`,VP_NATIVE_API_PORT:String(base+31)};
  if(sameTrip){
    const {identityLocalEnv}=await import('./local-supabase.mjs');
    const before={...process.env};Object.assign(process.env,testEnv);
    const state=identityLocalEnv();
    for(const key of Object.keys(testEnv))before[key]===undefined?delete process.env[key]:process.env[key]=before[key];
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(base+31)],{cwd:repo,env:{...testEnv,NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:state.PUBLISHABLE_KEY||state.ANON_KEY,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:state.SERVICE_ROLE_KEY},stdio:'ignore'});
    const {waitForNativeAPI}=await import('./native-api-readiness.mjs');
    await waitForNativeAPI(`http://127.0.0.1:${base+31}`,server);
    exit=await run(process.execPath,['--experimental-strip-types','--test','tests/integration/trip/native-same-trip.test.mjs'],true,{...testEnv,VP_LOCAL_SAME_TRIP:'true',VP_S1_BROWSER:'true'});
  }else if(simulator){
    const { identityLocalEnv } = await import('./local-supabase.mjs');
    const before={...process.env};Object.assign(process.env,testEnv);
    const state=identityLocalEnv(); simulatorState=state;
    for(const key of Object.keys(testEnv))before[key]===undefined?delete process.env[key]:process.env[key]=before[key];
    const publicKey=state.PUBLISHABLE_KEY||state.ANON_KEY, api=`http://127.0.0.1:${base+31}`, password='VPJ04-Local-Synthetic-Only-191!';
    const apiEnv={...testEnv,NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publicKey,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:state.SERVICE_ROLE_KEY};
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(base+31)],{cwd:repo,env:apiEnv,stdio:'ignore'});
    const {waitForNativeAPI}=await import('./native-api-readiness.mjs'); await waitForNativeAPI(api,server);
    for(const label of ['A','B']){
      const client=createClient(state.API_URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}), email=`vpj04-simulator-${randomUUID()}@example.test`;
      const signup=await client.auth.signUp({email,password});if(!signup.data.user||!signup.data.session||signup.error)throw new Error('Synthetic native account setup failed');
      simulatorUsers.push({id:signup.data.user.id,email});
      const profile=await client.rpc('save_user_profile',{p_display_name:`Local Phone Owner ${label}`,p_travel_pace:'balanced',p_locale:'en',p_currency:'USD',p_distance_unit:'mile',p_temperature_unit:'celsius',p_default_departure_time:'09:00'});
      if(profile.error)throw new Error('Synthetic native profile setup failed');
    }
    const runtime='com.apple.CoreSimulator.SimRuntime.iOS-26-5', device='com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro';
    for(const label of ['A','B']) { const id=execFileSync('xcrun',['simctl','create',`VPJ04-${label}-${randomUUID().slice(0,8)}`,device,runtime],{encoding:'utf8'}).trim(); simulators.push(id); }
    const derived=mkdtempSync(join(tmpdir(),'vpj04-native-build-')); simulatorDerived=derived;
    const buildEnv={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
    await native('xcodebuild',['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination',`platform=iOS Simulator,id=${simulators[0]}`,'-derivedDataPath',derived,'CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-'],join(derived,'build.log'),buildEnv);
    const products=join(derived,'Build','Products'), source=execFileSync('find',[products,'-maxdepth','1','-name','*.xctestrun','-print','-quit'],{encoding:'utf8'}).trim(), target=join(products,'NativeLocal.xctestrun');
    if(!source)throw new Error('Expected native xctestrun was not built');
    const probe=(await import('./native-redirect-probe.mjs')).createNativeRedirectProbe; const redirect=await probe();
    try {
      execFileSync('python3',['-c',`import plistlib,sys\np=plistlib.load(open(sys.argv[1],'rb'))\nfor k in ['VisePandaTests','VisePandaUITests']:\n p[k].setdefault('EnvironmentVariables',{}).update({'VP_NATIVE_LOCAL_UI':'1','VP_NATIVE_LOCAL_EMAIL':sys.argv[3],'VP_NATIVE_LOCAL_OTHER_EMAIL':sys.argv[4],'VP_NATIVE_REDIRECT_PROBE_URL':sys.argv[5],'VP_NATIVE_API_ORIGIN':sys.argv[6],'VP_NATIVE_TRIP_TEST':'1','VP_NATIVE_TRIP_EMAIL':sys.argv[3],'VP_NATIVE_TRIP_PASSWORD':sys.argv[7]})\nplistlib.dump(p,open(sys.argv[2],'wb'))`,source,target,simulatorUsers[0].email,simulatorUsers[1].email,redirect.url,api,password],{stdio:'ignore'});
      const test=async(id,selector,name)=>native('xcodebuild',['test-without-building','-xctestrun',target,'-destination',`platform=iOS Simulator,id=${id}`,'-parallel-testing-enabled','NO','-only-testing:'+selector,'-resultBundlePath',join(derived,`${name}.xcresult`)],join(derived,`${name}.log`),buildEnv);
      if(outline){
        await test(simulators[0],'VisePandaUITests/NativeTripUITests/testRelativeOutlineReviewConfirmAndRelaunch','outline');
        const bundle=join(derived,'outline.xcresult'), evidence=join(repo,'artifacts','VPJ-09','native-ui-20260918');
        mkdirSync(evidence,{recursive:true});
        writeFileSync(join(evidence,'summary.json'),execFileSync('xcrun',['xcresulttool','get','test-results','summary','--path',bundle],{encoding:'utf8'}));
        rmSync(join(evidence,'attachments'),{recursive:true,force:true});
        execFileSync('xcrun',['xcresulttool','export','attachments','--path',bundle,'--output-path',join(evidence,'attachments')],{stdio:'ignore'});
      }else{
        await test(simulators[0],'VisePandaTests/NativeSessionIntegrationTests','model');
        await test(simulators[0],'VisePandaUITests/NativeIdentityUITests/testLoginShowsRealOwnerProfile','phone-a-login');
        await test(simulators[1],'VisePandaUITests/NativeIdentityUITests/testLoginShowsRealOwnerProfile','phone-b-replace');
        await test(simulators[0],'VisePandaUITests/NativeIdentityUITests/testReplacedPhoneCannotRestoreOldSession','phone-a-rejected');
        await test(simulators[1],'VisePandaUITests/NativeIdentityUITests/testLogoutClearsAccount','phone-b-logout');
      }
    } finally { redirect.close(); }
    console.log(JSON.stringify({result:'PASS',scope:outline?'vpj09-outline':'native-identity',simulators:'owned-and-deleted-after-run'})); exit=0;
  }else{
    exit=await run(process.execPath,['--test','tests/integration/identity/native-local-session.test.mjs'],true,testEnv);
  }
}finally{
  if(server && server.exitCode===null){
    server.kill('SIGTERM');
    await new Promise(resolve=>server.once('exit',resolve));
  }
  for(const simulatorId of simulators){
    try { execFileSync('xcrun',['simctl','shutdown',simulatorId],{stdio:'ignore'}); } catch {}
    try { execFileSync('xcrun',['simctl','delete',simulatorId],{stdio:'ignore'}); } catch { exit=1; }
  }
  if(simulatorState && simulatorUsers.length){
    try {
      const exact=simulatorUsers.map(user=>`'${user.id}'`).join(',');
      const remaining=execFileSync('docker',['exec','-i',simulatorState.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:`delete from auth.users where id in (${exact}); select count(*) from auth.users where id in (${exact});`,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
      if(remaining!=='0') exit=1;
    } catch { exit=1; }
  }
  if(simulatorDerived) rmSync(simulatorDerived,{recursive:true,force:true});
  try { await run(supabaseCLI,['stop','--workdir',target,'--no-backup']); } catch { console.error('Disposable native identity cleanup failed for '+project);exit=1; }
  rmSync(target,{recursive:true,force:true});
}
process.exitCode=exit;
