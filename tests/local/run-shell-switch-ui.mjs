// Scoped local UI runner; reuses existing disposable Auth/server helper unchanged.
import {createNativeTextEnvironment} from '../integration/turn/native-text-environment.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,createWriteStream,unlinkSync,mkdtempSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {createServer as httpServer} from 'node:http';
const output=process.env.VP_SHELL_SWITCH_OUTPUT,device=process.env.VP_SHELL_SWITCH_SIMULATOR;
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9A-Fa-f]{36}$/.test(device))throw Error('Fresh absolute output and explicit simulator required');
mkdirSync(output,{recursive:true});
async function run(args,name){
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const log=createWriteStream(join(output,name+'.log'));
 const child=spawn('xcodebuild',args,{env:{...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'},stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((r,j)=>{child.once('exit',r);child.once('error',j);});log.end();
 if(code!==0)throw Error(name+' failed: '+code+'; see local log');
}
let e,patched,stack,proxy;
let fault = false, receiptLost = false, intakePosts = 0;
const intakeBodies = [];
async function quiet(command,args){
 const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();
 return new Promise((r,j)=>{child.once('exit',code=>code===0?r():j(Error('Owned local stack command failed; credential output suppressed')));child.once('error',j);});
}
async function startStack(){
 if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Docker overrides refused');
 const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
 const inspected=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];
 if(!inspected.Endpoints.docker.Host.startsWith('unix:///'))throw Error('Local Docker required');
 for(const offset of [20,21,22,23,24,27,29,31])await new Promise((r,j)=>{const socket=createServer();socket.once('error',()=>j(Error('Required local port unavailable')));socket.listen(59620+offset,'127.0.0.1',()=>socket.close(r));});
 stack=mkdtempSync(join(tmpdir(),'vp-shell-switch-'));
 mkdirSync(join(stack,'supabase'));const project='vp-native-ask-'+randomUUID().slice(0,8);
 let config=readFileSync('supabase/config.toml','utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`);
 for(const offset of [20,21,22,23,24,27,29])config=config.replaceAll(String(54300+offset),String(59620+offset));
 config=config.replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
 writeFileSync(join(stack,'supabase/config.toml'),config);cpSync('supabase/migrations',join(stack,'supabase/migrations'),{recursive:true});
 await quiet('supabase',['start','--workdir',stack,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 Object.assign(process.env,{VP_IDENTITY_SUPABASE_WORKDIR:stack,VP_IDENTITY_SUPABASE_API_URL:'http://127.0.0.1:59641',VP_NATIVE_API_PORT:'59651'});
}
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',join(output,'build'),'CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-'],'build');
 await startStack();
 e=await createNativeTextEnvironment();
 e.sql(`insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${e.users[2].id}','${e.policyId}','${randomUUID()}');`);
 proxy=httpServer(async(req,res)=>{
  try{
   const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
   if(bytes.length>32768){res.writeHead(400);res.end();return;}
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   if(path==='/__shell/control'){
    const action=JSON.parse(bytes.toString());fault=action.arm===true;res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
   }
   if(fault&&receiptLost&&req.method==='GET'&&path==='/api/chat/native/v5/conversation'){
    res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"PROVIDER_UNAVAILABLE"}}');return;
   }
   const upstream=await fetch(e.api+req.url,{method:req.method,headers:req.headers,body:bytes.length?bytes:undefined});const data=Buffer.from(await upstream.arrayBuffer());
   if(req.method==='POST'&&path==='/api/chat/native/v5/conversation'){
    intakePosts++; intakeBodies.push(JSON.parse(bytes.toString()));
    if(fault&&!receiptLost){if(upstream.status!==201)throw Error('Synthetic intake did not admit');receiptLost=true;res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"PROVIDER_UNAVAILABLE"}}');return;}
   }
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(data);
  }catch{res.writeHead(500);res.end();}
 });
 await new Promise((r,j)=>{proxy.once('error',j);proxy.listen(0,'127.0.0.1',r);});
 const api='http://127.0.0.1:'+proxy.address().port;
 const profile={VP_SHELL_SWITCH_TEST:'1',VP_NATIVE_TEXT_API_URL:api,VP_SHELL_SWITCH_CONTROL:api+'/__shell/control',VP_NATIVE_TEXT_UI_EN_EMAIL:e.users[2].email};
 const products=join(output,'build/Build/Products');patched=join(products,'ShellSwitch.xctestrun');
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
root=pathlib.Path(sys.argv[1]);sources=list(root.glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
p=root/'ShellSwitch.xctestrun';p.write_bytes(plistlib.dumps(data));p.chmod(0o600)`,products],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-collect-test-diagnostics','never','-resultBundlePath',join(output,'tests.xcresult'),'-only-testing:VisePandaUITests/NativeJourneysUITests/testAuthenticatedShellSwitchPreservesSessionAndModeLocalPaths'],'tests');
 if(!receiptLost||intakePosts!==2)throw Error('Pending/retry proof did not preserve the expected single intake and retry');
 assert.deepEqual(intakeBodies[1],intakeBodies[0],'Explicit retry must preserve immutable intake and idempotency identity');
 writeFileSync(join(output,'pending-summary.json'),JSON.stringify({scope:'disposable local synthetic',receiptLost,intakePosts,sameImmutableRequest:true,automaticResend:false})+'\n');
}finally{if(patched&&existsSync(patched))unlinkSync(patched);if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}await e?.cleanup();if(stack){await quiet('supabase',['stop','--workdir',stack,'--no-backup']);rmSync(stack,{recursive:true});}}
