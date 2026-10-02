/** Native interaction evidence with injected fixed responses; no Auth/backend capability claim. */
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,createWriteStream,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.env.VP_NATIVE_INTAKE_OUTPUT;
assert(output&&isAbsolute(output)&&!existsSync(output),'Fresh absolute output directory required');mkdirSync(output,{recursive:true});
const selectedLocale=process.env.VP_NATIVE_INTAKE_INJECTED_LOCALE;assert(!selectedLocale||['en','zh'].includes(selectedLocale));const locales=selectedLocale?[selectedLocale]:['en','zh'];
const device='5DB8E4CE-76AA-48A7-8F9C-861AF1A25E6E',dd='/tmp/vpj81-native-task-activity-20261002';
const files=['ios/VisePanda/VisePanda/App/NativeSession.swift','ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeView.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeStore.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeModels.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeInjectedHarness.swift','ios/VisePanda/VisePandaUITests/NativeTravelIntakeUITests.swift'];
writeFileSync(join(output,'source.json'),JSON.stringify({kind:'LOCAL_INJECTED_RESPONSES_NOT_AUTH',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),device,dd,files:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),backend:'UNRUN',locales},null,2)+'\n');
async function run(args,name){
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const log=createWriteStream(join(output,name+'.log'));const child=spawn('xcodebuild',args,{stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});log.end();assert.equal(code,0,name+' failed; see '+output);
}
await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',dd,'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
const patched=join(output,'Injected.xctestrun');
execFileSync('python3',['-c',`import sys,pathlib,plistlib
sources=list(pathlib.Path(sys.argv[1]).glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());data['VisePandaUITests'].setdefault('EnvironmentVariables',{})['VP_NATIVE_INTAKE_INJECTED']='1'
def absolutize(v):
 if isinstance(v,str):return v.replace('__TESTROOT__',sys.argv[1])
 if isinstance(v,dict):return {k:absolutize(x) for k,x in v.items()}
 if isinstance(v,list):return [absolutize(x) for x in v]
 return v
data=absolutize(data)
p=pathlib.Path(sys.argv[2]);p.write_bytes(plistlib.dumps(data));p.chmod(0o600)
`,join(dd,'Build/Products'),patched]);
await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-resultBundlePath',join(output,'tests.xcresult'),...locales.map(l=>'-only-testing:VisePandaUITests/NativeTravelIntakeUITests/testInjected'+(l==='en'?'English':'Chinese')+'EditingAndConflict')],'tests');
const container=execFileSync('xcrun',['simctl','get_app_container',device,'space.go2china.VisePanda','data'],{encoding:'utf8'}).trim();
for(const locale of locales){
 const path=join(container,'tmp','intake-injected-audit-'+locale+'.json');copyFileSync(path,join(output,'injected-audit-'+locale+'.json'));
 const audit=JSON.parse(readFileSync(path));const posts=audit.filter(x=>x.kind==='injected_post');
 assert.equal(posts.length,2);assert.equal(posts[0].lodgingBudget.perNightMinorUnits,45000);
 assert.equal(posts[1].city,null);assert.equal(posts[1].lodgingBudget,null);
 assert(posts.every(x=>x.interestsPreserved&&x.mobilityPreserved&&x.datesPreserved));
 assert.equal(audit.filter(x=>x.kind==='injected_post_409').length,1);assert.equal(audit.filter(x=>x.kind==='injected_write_basis').length,1);
}
const summary=JSON.parse(execFileSync('xcrun',['xcresulttool','get','test-results','summary','--path',join(output,'tests.xcresult'),'--format','json'],{encoding:'utf8'}));
assert.equal(summary.passedTests,locales.length);assert.equal(summary.failedTests,0);assert.equal(summary.skippedTests,0);
writeFileSync(join(output,'summary.json'),JSON.stringify({result:'PASS',passed:locales.length,failed:0,skipped:0,kind:'LOCAL_INJECTED_RESPONSES_NOT_AUTH',backend:'UNRUN',source:join(output,'source.json')},null,2)+'\n');
