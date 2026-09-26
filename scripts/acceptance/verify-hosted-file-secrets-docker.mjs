/** Synthetic Docker proof for file-mode hosted worker. Never calls a live DB or provider. */
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const image=process.argv[2];
if(process.argv.length!==3||typeof image!=='string'||!/^vp-hosted-text-worker:[A-Za-z0-9._-]+$/.test(image))throw Error('image unavailable');
const name='vp-hosted-file-proof-'+randomUUID().slice(0,8),dir=mkdtempSync(join(tmpdir(),'vp-hosted-file-proof-'));
const db='sb_secret_SYNTHETIC_FILE_DB_'+randomUUID(),qwen='SYNTHETIC_FILE_QWEN_'+randomUUID();
const mapper=join(dir,'mapper.mjs');
writeFileSync(mapper,`import {existsSync} from 'node:fs';
globalThis.fetch=async(url,options)=>{
 if(!options.headers.apikey.startsWith('sb_secret_')||Object.hasOwn(options.headers,'authorization'))
  throw Error('wrong auth');
 if(url==='https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/read_hosted_worker_status'){
  const enabled=existsSync('/run/vp-worker-secrets/force-enabled');
  console.log('SYNTHETIC_STATUS_READ_'+enabled);
  return Response.json({kind:'status',enabled});
 }
 if(url==='https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/hosted_worker_heartbeat'){
  const enabled=existsSync('/run/vp-worker-secrets/force-race');
  if(enabled)console.log('SYNTHETIC_HEARTBEAT_TRUE');
  return Response.json({kind:'ok',enabled});
 }
 console.log('SYNTHETIC_UNEXPECTED_FETCH');
 throw Error('unexpected network');
};`);
const profile={schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:1,
 modes:['current_input_v1'],qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:2000000,
 outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null},reservedMicros:2101248,maxOutputTokens:512,
 timeoutMs:1000,configurationId:randomUUID(),configurationVersion:1}};
function run(args,input){
 const result=spawnSync('docker',args,{encoding:'utf8',input,timeout:30000,maxBuffer:1024*1024});
 if(result.status!==0)throw Error('synthetic Docker operation failed: '+args[0]);
 return result.stdout.trim();
}
function logs(){
 const result=spawnSync('docker',['logs',name],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 if(result.status!==0)throw Error('synthetic Docker logs unavailable');
 return result.stdout+result.stderr;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 run(['run','-d','--name',name,'--network','none','--read-only','--cap-drop','ALL','--user','1000:1000',
  '--tmpfs','/run/vp-worker-secrets:rw,uid=1000,gid=1000,mode=0700',
  '--mount',`type=bind,src=${resolve(mapper)},dst=/test/mapper.mjs,readonly`,
  '--env','NODE_OPTIONS=--import=/test/mapper.mjs',
  '--env','VISEPANDA_HOSTED_TEXT_WORKER=true','--env','VISEPANDA_HOSTED_WORKER_SECRET_MODE=files',
  '--env','VISEPANDA_HOSTED_WORKER_PROFILE='+JSON.stringify(profile),
  '--entrypoint','sh',image,'-c',
  'while [ ! -f /run/vp-worker-secrets/ready ]; do sleep 0.05; done; exec node --experimental-strip-types --disable-warning=ExperimentalWarning lib/server/jobs/run-hosted-text-worker.mjs']);
 run(['exec','-i','--user','1000:1000',name,'sh','-c',
  'umask 077; IFS= read -r db; IFS= read -r qwen; printf %s "$db" > /run/vp-worker-secrets/db.key; printf %s "$qwen" > /run/vp-worker-secrets/qwen.key; chmod 0400 /run/vp-worker-secrets/*.key; touch /run/vp-worker-secrets/ready'],db+'\n'+qwen+'\n');
 let started=false;
 for(let i=0;i<80;i++){
  if(logs().includes('"phase":"started"')){started=true;break;}
  await wait(100);
 }
 if(!started)throw Error('file-mode worker did not start');
 const inspect=run(['inspect','--format','{{json .Config.Env}}',name]);
 if(inspect.includes(db)||inspect.includes(qwen)||inspect.includes('VISEPANDA_HOSTED_WORKER_DB_KEY')
  ||inspect.includes('VISEPANDA_HOSTED_WORKER_QWEN_KEY'))throw Error('secret in Docker Config.Env');
 run(['cp',`${name}:/var/lib/vp-worker/journal`,join(dir,'journal')]);
 const files=readdirSync(join(dir,'journal'));
 if(files.length!==1)throw Error('journal missing');
 const journal=readFileSync(join(dir,'journal',files[0]),'utf8');
 if(journal.includes(db)||journal.includes(qwen)||!journal.includes('vpj07-hosted-run/1'))throw Error('journal contains a secret or is missing');
 run(['stop','--time','5',name]);
 if(run(['inspect','--format','{{.State.ExitCode}}',name])!=='0')throw Error('worker did not drain');
 if(logs().includes(db)||logs().includes(qwen))throw Error('secret in logs');
 run(['start',name]);
 run(['exec',name,'test','!','-e','/run/vp-worker-secrets/db.key']);
 if((logs().match(/"phase":"started"/g)??[]).length!==1)throw Error('restart without /run key started worker');
 run(['exec','-i','--user','1000:1000',name,'sh','-c',
  'umask 077; IFS= read -r db; IFS= read -r qwen; printf %s "$db" > /run/vp-worker-secrets/db.key; printf %s "$qwen" > /run/vp-worker-secrets/qwen.key; chmod 0644 /run/vp-worker-secrets/db.key; chmod 0400 /run/vp-worker-secrets/qwen.key; touch /run/vp-worker-secrets/ready'],db+'\n'+qwen+'\n');
 let rejected=false;
 for(let i=0;i<80;i++){
  const state=run(['inspect','--format','{{.State.Status}}:{{.State.ExitCode}}',name]);
  if(state==='exited:1'){rejected=true;break;}
  await wait(100);
 }
 const failureLog=logs();
 if(!rejected)throw Error('bad file permissions did not exit 1');
 if(!failureLog.includes('Hosted text worker unavailable.'))throw Error('bad file permissions did not log generic failure');
 if(failureLog.includes(db)||failureLog.includes(qwen))throw Error('bad file permissions leaked a secret');
 run(['start',name]);
 run(['exec','-i','--user','1000:1000',name,'sh','-c',
  'umask 077; IFS= read -r qwen; printf %s "$qwen" > /run/vp-worker-secrets/qwen.key; chmod 0400 /run/vp-worker-secrets/qwen.key; ln -s qwen.key /run/vp-worker-secrets/db.key; touch /run/vp-worker-secrets/ready'],qwen+'\n');
 let symlinkRejected=false;
 for(let i=0;i<80;i++){
  if(run(['inspect','--format','{{.State.Status}}:{{.State.ExitCode}}',name])==='exited:1'){symlinkRejected=true;break;}
  await wait(100);
 }
 if(!symlinkRejected||logs().includes(db)||logs().includes(qwen))throw Error('symlink secret did not fail closed');
 run(['start',name]);
 run(['exec','-i','--user','1000:1000',name,'sh','-c',
  'umask 077; IFS= read -r db; IFS= read -r qwen; printf %s "$db" > /run/vp-worker-secrets/db.key; printf %s "$qwen" > /run/vp-worker-secrets/qwen.key; chmod 0400 /run/vp-worker-secrets/*.key; touch /run/vp-worker-secrets/force-enabled /run/vp-worker-secrets/ready'],db+'\n'+qwen+'\n');
 let enabledRejected=false;
 for(let i=0;i<80;i++){
  if(run(['inspect','--format','{{.State.Status}}:{{.State.ExitCode}}',name])==='exited:1'){enabledRejected=true;break;}
  await wait(100);
 }
 const finalLogs=logs();
 if(!enabledRejected||!finalLogs.includes('SYNTHETIC_STATUS_READ_true')
  ||finalLogs.includes('SYNTHETIC_UNEXPECTED_FETCH')
  ||(finalLogs.match(/"phase":"started"/g)??[]).length!==1
  ||finalLogs.includes(db)||finalLogs.includes(qwen))throw Error('enabled SQL switch was not rejected before discovery');
 run(['cp',`${name}:/var/lib/vp-worker/journal`,join(dir,'final-journal')]);
 if(readdirSync(join(dir,'final-journal')).length!==1)throw Error('enabled startup wrote a journal');
 run(['start',name]);
 run(['exec','-i','--user','1000:1000',name,'sh','-c',
  'umask 077; IFS= read -r db; IFS= read -r qwen; printf %s "$db" > /run/vp-worker-secrets/db.key; printf %s "$qwen" > /run/vp-worker-secrets/qwen.key; chmod 0400 /run/vp-worker-secrets/*.key; touch /run/vp-worker-secrets/force-race /run/vp-worker-secrets/ready'],db+'\n'+qwen+'\n');
 let raceRejected=false;
 for(let i=0;i<80;i++){
  if(run(['inspect','--format','{{.State.Status}}:{{.State.ExitCode}}',name])==='exited:1'){raceRejected=true;break;}
  await wait(100);
 }
 const raceLogs=logs();
 if(!raceRejected||!raceLogs.includes('SYNTHETIC_HEARTBEAT_TRUE')
  ||raceLogs.includes('SYNTHETIC_UNEXPECTED_FETCH')||raceLogs.includes(db)||raceLogs.includes(qwen))
  throw Error('enabled first heartbeat reached discovery');
 run(['cp',`${name}:/var/lib/vp-worker/journal`,join(dir,'race-journal')]);
 const raceFiles=readdirSync(join(dir,'race-journal'));
 if(raceFiles.length!==2)throw Error('race startup journal count invalid');
 const raceFile=raceFiles.find(file=>file!==files[0]);
 if(!raceFile)throw Error('race journal missing');
 const raceJournal=readFileSync(join(dir,'race-journal',raceFile),'utf8');
 if(raceJournal.includes('vpj07-hosted-job/1')||raceJournal.includes('provider-destination/1')
  ||raceJournal.includes('vpj07-usage-journal/1'))throw Error('race startup claimed or invoked provider');
 console.log(JSON.stringify({schemaVersion:'vpj07-hosted-file-secret-proof/1',fileModeStarted:true,
  dockerEnvClean:true,journalClean:true,logsClean:true,restartWithoutFilesBlocked:true,
  badPermissionsFailClosed:true,symlinkFailClosed:true,enabledSwitchFailClosed:true,
  firstHeartbeatRaceFailClosed:true,network:'none'}));
}finally{
 spawnSync('docker',['rm','-fv',name],{encoding:'utf8',timeout:30000,stdio:'ignore'});
 rmSync(dir,{recursive:true,force:true});
}
