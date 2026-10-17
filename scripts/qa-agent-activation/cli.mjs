#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {generate,preflight,validateTarget} from './toolkit.mjs';
const read=path=>{const raw=readFileSync(path,'utf8');if(Buffer.byteLength(raw)>65536)throw Error('INPUT_TOO_LARGE');return JSON.parse(raw);};
try {
  const [command,input,output,...args]=process.argv.slice(2);
  if (!input || !output || !['generate','preflight'].includes(command)) throw Error('USAGE');
  let result;
  if(command==='generate') {
    if(args.length!==1)throw Error('OPERATOR_TARGET_REQUIRED');
    const target=validateTarget(read(args[0]));result=generate(read(input),{approvedTarget:target});
  } else {
    if(args.length<2 || args.length>3)throw Error('OPERATOR_TARGET_REQUIRED');
    const [observation,targetFile,sourceRoot]=args,target=validateTarget(read(targetFile));
    result=preflight(read(input),read(observation),Date.now(),sourceRoot?pathToFileURL(resolve(sourceRoot,'supabase/migrations')+'/'):undefined,target);
  }
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  if(command==='preflight'&&!result.reviewReady)process.exitCode=2;
} catch {console.error('Offline current-target QA check failed. Verify target binding, schema, evidence and unused output path. Input values are never logged.');process.exitCode=1;}
