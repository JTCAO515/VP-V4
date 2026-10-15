import {execFileSync} from 'node:child_process';
import {rmSync,writeFileSync} from 'node:fs';
import {resource,root} from './db.mjs';
if(!/^\/(?:private\/)?tmp\/a005sql-[A-Za-z0-9]+$/.test(resource.nonce)||!resource.data.startsWith(resource.nonce+'/')||!resource.socket.startsWith(resource.nonce+'/'))throw Error('not self owned nonce');
execFileSync(resource.bin+'/pg_ctl',['-D',resource.data,'-m','fast','-w','stop'],{stdio:'pipe'});rmSync(resource.nonce,{recursive:true,force:true});
writeFileSync(root+'/cleanup.json',JSON.stringify({selfOwnedNonceOnly:true,stopped:true,removed:true,noTCP:true,noSharedResource:true})+'\n');
