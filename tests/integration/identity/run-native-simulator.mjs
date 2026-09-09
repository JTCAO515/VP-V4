// Explicit disposable local integration runner. Never reads a repository .env or existing Keychain.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from './local-supabase.mjs';
import { waitForNativeAPI } from './native-api-readiness.mjs';
const state=identityLocalEnv();
assert.ok(state,'Explicit disposable Supabase target required');
assert.equal(state.API_URL,'http://127.0.0.1:59721');
assert.equal(state.DB_CONTAINER,'supabase_db_vp-native-session-20260910');
const runId=Date.now().toString();
const devices=['B8B7B17F-A447-487E-B52C-31A303CF713A','152CB87B-089B-4FD4-BC7D-64ED4A621874'];
const publicKey=state.PUBLISHABLE_KEY || state.ANON_KEY;
const password='VPJ04-Local-Synthetic-Only-191!';
const ids=[];
const emails=[];
const xcodeEnv={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
const run=(command,args,log,env=xcodeEnv)=>new Promise((resolve,reject)=>{
 const output=createWriteStream(log);
 const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(output);child.stderr.pipe(output);
 child.once('error',()=>reject(Error('Native local verification process failed')));
 child.once('exit',code=>{output.end();code===0?resolve():reject(Error('Native local verification failed; inspect '+log));});
});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','59731'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publicKey,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:state.SERVICE_ROLE_KEY},stdio:'ignore'});
try {
 await waitForNativeAPI('http://127.0.0.1:59731',server);
 for(const label of ['A','B']){
  const email='native-ios-'+randomUUID()+'@example.test';
  const client=createClient(state.API_URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const signup=await client.auth.signUp({email,password});
  if(signup.data.user)ids.push(signup.data.user.id);
  assert.ok(signup.data.user && signup.data.session && !signup.error,'local synthetic signup');
  emails.push(email);
  const result=await client.rpc('save_user_profile',{p_display_name:'Local Phone Owner '+label,p_travel_pace:'balanced',p_locale:'en',p_currency:'USD',p_distance_unit:'mile',p_temperature_unit:'celsius',p_default_departure_time:'09:00'});
  assert.equal(result.error,null,'local owner profile setup');
 }
 const source='/tmp/vpj04-native-build/Build/Products/VisePanda_iphonesimulator26.5-arm64.xctestrun';
 const target='/tmp/vpj04-native-build/Build/Products/NativeLocal.xctestrun';
 execFileSync('python3',['-c',`import plistlib,sys\np=plistlib.load(open(sys.argv[1],'rb'))\nfor k in ['VisePandaTests','VisePandaUITests']:\n p[k].setdefault('EnvironmentVariables',{}).update({'VP_NATIVE_LOCAL_UI':'1','VP_NATIVE_LOCAL_EMAIL':sys.argv[3],'VP_NATIVE_LOCAL_OTHER_EMAIL':sys.argv[4]})\nplistlib.dump(p,open(sys.argv[2],'wb'))`,source,target,...emails],{stdio:'ignore'});
 const execute=async(device,selector,name)=>{
  await run('xcodebuild',['test-without-building','-xctestrun',target,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-only-testing:'+selector,'-resultBundlePath','/tmp/vpj04-'+name+'-'+runId+'.xcresult'],'/tmp/vpj04-'+name+'.log');
  console.log('PASS '+name+' on assigned disposable Simulator');
 };
 await execute(devices[0],'VisePandaTests/NativeSessionIntegrationTests','native-model');
 await execute(devices[0],'VisePandaUITests/NativeIdentityUITests/testLoginShowsRealOwnerProfile','phone-a-login');
 await execute(devices[1],'VisePandaUITests/NativeIdentityUITests/testLoginShowsRealOwnerProfile','phone-b-replace');
 await execute(devices[0],'VisePandaUITests/NativeIdentityUITests/testReplacedPhoneCannotRestoreOldSession','phone-a-rejected');
 await execute(devices[1],'VisePandaUITests/NativeIdentityUITests/testLogoutClearsAccount','phone-b-logout');
} finally {
 server.kill('SIGTERM');
 if(ids.length){
  const exact=ids.map(id=>"'"+id+"'").join(',');
  const sql=`delete from auth.users where id in (${exact}); select count(*) from auth.users where id in (${exact});`;
  const remaining=execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  assert.equal(remaining,'0','all synthetic native UI accounts removed');
 }
}
