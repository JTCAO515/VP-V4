/** Actual Swift byte transport/store and bilingual UI against disposable Auth/DB. */
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,createWriteStream} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {createNativeReadGate} from './native-read-gate.mjs';
const output=process.env.VP_NATIVE_EVENTS_OUTPUT,device=process.env.VP_NATIVE_EVENTS_SIMULATOR;
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9A-Fa-f]{36}$/.test(device))throw Error('Fresh absolute output and explicit Simulator required');
mkdirSync(output,{recursive:true});
const env={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
async function run(args,name){
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const log=createWriteStream(join(output,name+'.log'));
 const p=spawn('xcodebuild',args,{env,stdio:['ignore','pipe','pipe']});p.stdout.pipe(log);p.stderr.pipe(log);
 const code=await new Promise((resolve,reject)=>{p.once('exit',resolve);p.once('error',reject);});log.end();
 if(code!==0)throw Error(name+' failed: '+code);
}
let e,readGate;
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',join(output,'build'),'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
 e=await createNativeTextEnvironment({grounded:true});
 readGate=await createNativeReadGate(e.api);
 const profile={VP_NATIVE_GROUNDED_TEST:'1',VP_NATIVE_TEXT_TEST:'1',VP_NATIVE_TEXT_API_URL:readGate.api,VP_NATIVE_GROUNDED_READ_CONTROL_URL:readGate.controlURL,VP_NATIVE_TEXT_CONTROL_URL:e.controlURL,VP_NATIVE_TEXT_EMAIL:e.users[0].email,VP_NATIVE_TEXT_UI_EN_EMAIL:e.users[2].email,VP_NATIVE_TEXT_UI_ZH_EMAIL:e.users[3].email,VP_NATIVE_TEXT_UI_RECONNECT_EMAIL:e.users[1].email};
 const patched=join(output,'build/Build/Products/GroundedEvents.xctestrun');
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
root=pathlib.Path(sys.argv[1]); sources=list(root.glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());profile=json.loads(sys.stdin.read())
for target in ('VisePandaTests','VisePandaUITests'): data[target].setdefault('EnvironmentVariables',{}).update(profile)
path=root/'GroundedEvents.xctestrun';path.write_bytes(plistlib.dumps(data));path.chmod(0o600)
`,join(output,'build/Build/Products')],{input:JSON.stringify(profile)});
 const selection=process.env.VP_NATIVE_EVENTS_ONLY_TRANSPORT==='1'
  ? ['-only-testing:VisePandaTests/NativeAskStateTests']
  : ['-only-testing:VisePandaUITests/NativeAskUITests/testEnglishGroundedAnswerAndRelaunch','-only-testing:VisePandaUITests/NativeAskUITests/testChineseGroundedAnswerAndRelaunch','-only-testing:VisePandaUITests/NativeAskUITests/testEnglishGroundedBackgroundNetworkReconnect'];
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-resultBundlePath',join(output,'tests.xcresult'),'-only-testing:VisePandaTests/NativeAskIntegrationTests/testGroundedEventDisconnectResumesSameTaskAndCancelRemainsAvailable',...selection],'tests');
}finally{
 if(readGate)await readGate.close();
 if(e){
  try {
   const tasks=JSON.parse(e.sql("select coalesce(json_agg(json_build_object('turnId',g.turn_id,'taskId',g.task_id,'status',t.status,'events',(select count(*) from public.chat_turn_events ev where ev.turn_id=g.turn_id),'attempts',(select count(*) from public.model_budget_attempts a where a.task_id=g.task_id))),'[]') from turn_private.grounded_turns g join public.turns t on t.id=g.turn_id;"));
   writeFileSync(join(output,'counts.json'),JSON.stringify({scope:'actual local native/Auth/HTTP/SQL; synthetic model only',counts:e.counts,tasks,eventRequests:readGate?.eventRequests,inputs:e.requests.map(r=>r.messages.at(-1).content),onlyCurrentInput:e.requests.every(r=>r.messages.length===2)},null,2)+'\n');
  } finally { await e.cleanup(); }
 }
}
