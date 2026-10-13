#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {generate,preflight} from './toolkit.mjs';
try {
  const [command,input,output,observation,...extra]=process.argv.slice(2);
  if (!['generate','preflight'].includes(command) || !input || !output || extra.length || (command==='preflight')!==Boolean(observation)) throw Error('USAGE');
  const raw=readFileSync(input,'utf8'); if(Buffer.byteLength(raw)>65536) throw Error('INPUT_TOO_LARGE');
  const result=command==='generate'?generate(JSON.parse(raw)):preflight(JSON.parse(raw),JSON.parse(readFileSync(observation,'utf8')));
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  if (command==='preflight' && !result.reviewReady) process.exitCode=2;
} catch { console.error('Offline activation check failed. Check schema, required evidence, dates, limits and unused output path. Input values are never logged.'); process.exitCode=1; }
