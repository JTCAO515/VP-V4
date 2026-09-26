/** Focused v5 native UI against disposable local Auth, HTTP and PostgreSQL. */
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync,createWriteStream} from 'node:fs';
import {isAbsolute,join} from 'node:path';

const output=process.env.VP_NATIVE_ASSISTANT_OUTPUT,device=process.env.VP_NATIVE_ASSISTANT_SIMULATOR;
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9A-Fa-f]{36}$/.test(device))throw Error('Fresh absolute output and explicit Simulator required');
mkdirSync(output,{recursive:true});
const env={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
async function run(args,name){
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const log=createWriteStream(join(output,name+'.log'));
 const child=spawn('xcodebuild',args,{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});log.end();
 if(code!==0)throw Error(name+' failed: '+code+' (see '+join(output,name+'.log')+')');
}
let e;
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',join(output,'build'),'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
 e=await createNativeTextEnvironment();
 const profile={VP_NATIVE_ASSISTANT_TEST:'1',VP_NATIVE_TEXT_API_URL:e.api,VP_NATIVE_TEXT_UI_EN_EMAIL:e.users[2].email};
 const tripMode=process.env.VP_NATIVE_ASSISTANT_ONLY_TRIP_LINK==='1';
 if(tripMode){
  const call=async(path,token,body)=>{const result=await fetch(e.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});if(!result.ok)throw Error('Synthetic Trip fixture request failed: '+result.status);return result.json();};
  const attemptId=randomUUID(),credentials=await call('/api/auth/native/v2/credentials',null,{email:e.users[2].email,password:e.users[2].password,attemptId});
  await call('/api/auth/native/v2/login',credentials.accessToken,{attemptId});
  const first=randomUUID(),second=randomUUID();
  await call('/api/trips/native/v2',credentials.accessToken,{tripId:first,title:'Synthetic Goal Trip A'});
  await call('/api/trips/native/v2',credentials.accessToken,{tripId:second,title:'Synthetic Goal Trip B'});
  Object.assign(profile,{VP_NATIVE_ASSISTANT_TRIP_TEST:'1',VP_NATIVE_ASSISTANT_TRIP_A:first,VP_NATIVE_ASSISTANT_TRIP_B:second});
 }
 const products=join(output,'build/Build/Products'),patched=join(products,'AssistantConversation.xctestrun');
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
root=pathlib.Path(sys.argv[1]); sources=list(root.glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());profile=json.loads(sys.stdin.read())
data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(profile)
path=root/'AssistantConversation.xctestrun';path.write_bytes(plistlib.dumps(data));path.chmod(0o600)
`,products],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-resultBundlePath',join(output,'tests.xcresult'),
  '-only-testing:VisePandaUITests/NativeAskUITests/'+(tripMode?'testEnglishAssistantGoalTripLinkReadback':'testEnglishAssistantConversationReadback')],'tests');
 writeFileSync(join(output,'summary.json'),JSON.stringify({scope:'actual local native/Auth/HTTP/SQL; synthetic model only',modelCalls:e.counts.http,messages:e.sql('select count(*) from turn_private.assistant_messages;'),goals:e.sql('select count(*) from turn_private.assistant_goals;'),taskAttempts:e.sql('select count(*) from public.model_budget_attempts;'),tripLinks:e.sql('select count(*) from turn_private.assistant_goal_trip_links;'),tripLinkReceipts:e.sql('select count(*) from turn_private.assistant_goal_trip_receipts;')},null,2)+'\n');
 console.log('VPJ78_NATIVE_UI_PASS '+join(output,'summary.json'));
}finally{if(e)await e.cleanup();}
