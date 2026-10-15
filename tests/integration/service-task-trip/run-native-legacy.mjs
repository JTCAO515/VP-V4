import {spawnSync,spawn} from 'node:child_process';
import {mkdtempSync,chmodSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const files=process.argv.slice(2);if(!files.length||files.some(f=>!/^tests\/integration\/(turn|scoped-edit|trip|cost|identity)\/[a-z0-9/-]+\.test\.mjs$/.test(f)))throw Error('Explicit related suite paths required');
const state=mkdtempSync('/tmp/agent008-native-state-');chmodSync(state,0o700);
const env={...process.env,VP_TRIP_NATIVE_STATE:state,VP_TURN_DB_TEST:'1',PATH:resolve('tests/integration/service-task-trip/native-legacy-bin')+':'+process.env.PATH};
console.log('C0 native PostgreSQL adapter: original SQL suites unchanged; no Docker/target17.6/GoTrue claim.');
try{const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--test',...files],{env,stdio:'inherit'});p.on('error',reject);p.on('exit',resolve);});process.exitCode=code??1;}
finally{for(const file of readdirSync(state)){const {root,data}=JSON.parse(readFileSync(join(state,file),'utf8'));if(root.startsWith('/tmp/agent008-native-pg-')&&data===join(root,'data')){spawnSync(join(process.env.VP_TRIP_PG_BIN,'pg_ctl'),['-D',data,'stop','-m','fast','-w']);rmSync(root,{recursive:true,force:true});}}rmSync(state,{recursive:true,force:true});}
