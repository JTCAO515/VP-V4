/** Offline, read-only-to-source audit. No credential, provider, database or settlement capability. */
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {auditHostedUsageJournal} from './hosted-usage-audit.ts';

const fail=()=>{throw Error('unavailable');};
let report;
try{
 const args=process.argv.slice(2);
 if(process.env.VERCEL_ENV || args.length!==4 || args[0]!=='--journal' || args[2]!=='--report'
  || resolve(args[1])===resolve(args[3]))fail();
 const file=await open(args[1],constants.O_RDONLY|constants.O_NOFOLLOW);
 let text;
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size<1||stat.size>32*1024*1024||(stat.mode&0o077)!==0||stat.uid!==process.getuid())fail();
  const bytes=await file.readFile();if(bytes.length>32*1024*1024)fail();
  text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{await file.close();}
 const lines=text.split('\n');
 const partialTail=lines.pop()!=='';
 const rows=lines.map(line=>JSON.parse(line));
 const audit=auditHostedUsageJournal(rows);
 // The report is private metadata for comparing with the authorized ledger later.
 // It does not claim any attempt is pending or settled and cannot change either state.
 report=await open(args[3],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 await report.writeFile(JSON.stringify({...audit,journalSha256:createHash('sha256').update(text).digest('hex'),
  partialTailIgnored:partialTail,observedAt:new Date().toISOString()})+'\n');
 await report.sync();
 console.log(JSON.stringify({schemaVersion:'vpj07-hosted-usage-audit-result/1',groups:audit.groups.length,
  receiptRows:audit.receiptRows,distinctAttempts:audit.distinctAttempts,partialTailIgnored:partialTail,
  processEndObserved:audit.processEndObserved,
  ledgerState:'not_checked',settlementAction:'none'}));
}catch{console.error('Hosted usage audit unavailable. Preserve journal and pending holds.');process.exitCode=1;}
finally{if(report){try{await report.close();}catch{process.exitCode=1;}}}
