/** Explicit D4 operator only. Never repurposes D1 poller or starts a scheduler. */
import {readFile,lstat} from 'node:fs/promises';import {isAbsolute} from 'node:path';
import {createMemoryDeletionWorker} from './server-worker.ts';
try{
 if(process.env.VP_PRIVACY_MEMORY_DELETE_ENABLED!=='true'){console.log(JSON.stringify({kind:'disabled'}));process.exitCode=0;}
 else{
  const requestId=process.argv[2],environment=process.env.VP_PRIVACY_MEMORY_DELETE_ENVIRONMENT,url=process.env.VP_PRIVACY_MEMORY_DELETE_DATABASE_URL;
  if(process.env.VERCEL_ENV||process.argv.length!==3||!requestId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId)||!['local','staging'].includes(environment??'')||!url)throw Error('Unavailable');
  const credential=async()=>{
   if(environment==='local'){if(process.env.VP_PRIVACY_LOCAL_DISPOSABLE!=='true')throw Error('Unavailable');return process.env.VP_PRIVACY_LOCAL_SERVICE_KEY??null;}
   const file=process.env.VP_PRIVACY_STAGING_DB_KEY_FILE;if(!file||!isAbsolute(file))throw Error('Unavailable');const info=await lstat(file);if(!info.isFile()||(info.mode&0o077)!==0||info.size>4096)throw Error('Unavailable');return (await readFile(file,'utf8')).trim();
  };
  const run=createMemoryDeletionWorker({enabled:true,environment,databaseUrl:url},{credential});
  const result=await run(requestId,AbortSignal.timeout(30000));console.log(JSON.stringify({requestId,outcome:result}));if(result!=='completed')process.exitCode=1;
 }
}catch{console.error('Memory deletion result unavailable; read the exact request receipt.');process.exitCode=1;}
