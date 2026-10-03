/** Actual native Memory owner APIs against current checkout migrations; no provider or Trip writes. */
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,createWriteStream} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.VP_NATIVE_MEMORY_OUTPUT,device='5DB8E4CE-76AA-48A7-8F9C-861AF1A25E6E',dd='/tmp/vpj81-native-task-activity-20261002';
assert(output&&isAbsolute(output)&&!existsSync(output));assert.equal(process.env.VP_NATIVE_HTTP_PORT_BASE,'63220');mkdirSync(output,{recursive:true});
async function run(args,name){const log=createWriteStream(join(output,name+'.log'));writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');const child=spawn('xcodebuild',args,{stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});log.end();assert.equal(code,0,name+' failed');}
let e;
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',dd,'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
 e=await createNativeTextEnvironment();const user=e.users[2];
 const profile={VP_NATIVE_MEMORY_FIXTURE:'1',VP_NATIVE_MEMORY_API:e.api,VP_NATIVE_MEMORY_EMAIL:user.email};
 const patched=join(output,'MemoryPreferences.xctestrun');execFileSync('python3',['-c',`import sys,pathlib,plistlib,json
p=list(pathlib.Path(sys.argv[1]).glob('*.xctestrun'));assert len(p)==1
data=plistlib.loads(p[0].read_bytes());data['VisePandaTests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
def fix(v):
 if isinstance(v,str):return v.replace('__TESTROOT__',sys.argv[1])
 if isinstance(v,dict):return {k:fix(x) for k,x in v.items()}
 if isinstance(v,list):return [fix(x) for x in v]
 return v
out=pathlib.Path(sys.argv[2]);out.write_bytes(plistlib.dumps(fix(data)));out.chmod(0o600)
`,join(dd,'Build/Products'),patched],{input:JSON.stringify(profile)});
 const paths=['ios/VisePanda/VisePanda/Features/Profile/NativeMemoryPreferences.swift','ios/VisePanda/VisePanda/App/NativeSession.swift','ios/VisePanda/VisePandaTests/NativeMemoryPreferencesTests.swift'];
 writeFileSync(join(output,'source.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),kind:'ACTUAL_NATIVE_AUTH_MEMORY_API_STATE_NOT_DEVICE_GESTURES',device,dd,base:63220,files:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-only-testing:VisePandaTests/NativeMemoryPreferencesIntegrationTests','-resultBundlePath',join(output,'tests.xcresult')],'tests');
 assert.equal(e.sql("select count(*) from public.memory_profiles where owner_id='"+user.id+"';"),'1');
 assert.equal(e.sql("select revision from public.memory_profiles where owner_id='"+user.id+"';"),'5');
 assert.equal(e.counts.http,0);assert.equal(e.sql("select count(*) from turn_private.service_tasks where owner_id='"+user.id+"';"),'0');
 writeFileSync(join(output,'summary.json'),JSON.stringify({result:'PASS',scope:'actual NativeSession owner Auth -> consentCreate/create -> same-profile update -> updateUndo -> pause/resume -> revoke/masked currentread -> logout',sameProfile:true,revisionSequence:[1,2,3,4,5,5],profiles:1,providerCalls:0,taskAdmissions:0,unrun:['device gestures','VoiceOver/human','provider/target']},null,2)+'\n');
}finally{if(e)await e.cleanup();}
