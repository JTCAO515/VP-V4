// Runs the complete signed native suite with actual local Auth/HTTP/SQL text fixtures.
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const output=process.argv[2];if(!output)throw Error('Fresh absolute evidence output is required');
const temporary=mkdtempSync(join(tmpdir(),'vpj07-native-text-profile-'));
let environment;
try{
 environment=await createNativeTextEnvironment();
 const profile=join(temporary,'profile.json');
 writeFileSync(profile,JSON.stringify({VP_NATIVE_TEXT_TEST:'1',VP_NATIVE_TEXT_API_URL:environment.api,VP_NATIVE_TEXT_CONTROL_URL:environment.controlURL,VP_NATIVE_TEXT_EMAIL:environment.users[0].email,VP_NATIVE_TEXT_OTHER_EMAIL:environment.users[1].email,VP_NATIVE_TEXT_UI_EN_EMAIL:environment.users[2].email,VP_NATIVE_TEXT_UI_ZH_EMAIL:environment.users[3].email}),{mode:0o600});
 const log=createWriteStream('/tmp/vpj07-native-text-full.log',{mode:0o600});
 const child=spawn('python3',['scripts/ios/ci.py','--output',resolve(output),'--local-text-environment',profile],{env:{...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log);child.stderr.pipe(log);child.stdout.on('data',data=>process.stdout.write(data));
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});log.end();
 writeFileSync(resolve(output,'text-fixture-counts.json'),JSON.stringify({scope:'local synthetic controlled HTTP only',...environment.counts},null,2)+'\n');
 process.exitCode=code ?? 1;
}finally{await environment?.cleanup();rmSync(temporary,{recursive:true,force:true});}
