import {execFileSync} from 'node:child_process';
import {rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resource,root} from './db.mjs';
if(!/^\/(?:private\/)?tmp\/a005sql-[A-Za-z0-9]+$/.test(resource.nonce)||!resource.data.startsWith(resource.nonce+'/')||!resource.socket.startsWith(resource.nonce+'/'))throw Error('not self owned nonce');
if(existsSync(resource.nonce+'/log')){const log=readFileSync(resource.nonce+'/log','utf8');const at=log.indexOf('deadlock detected');if(at>=0)writeFileSync(root+'/native-deadlock.log',log.slice(Math.max(0,at-400),at+7000));}
execFileSync(resource.bin+'/pg_ctl',['-D',resource.data,'-m','fast','-w','stop'],{stdio:'pipe'});rmSync(resource.nonce,{recursive:true,force:true});
writeFileSync(root+'/cleanup.json',JSON.stringify({selfOwnedNonceOnly:true,stopped:true,removed:true,noTCP:true,noSharedResource:true})+'\n');
