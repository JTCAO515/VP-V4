import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {basename,join} from 'node:path';
import {renameSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {createOwnedPg} from './owned-pg.mjs';
export async function resourceCases(){
 for(const phase of ['init','start','connect']){
  const owner=createOwnedPg({execute:(file,args,options)=>{
   if(phase==='init'&&basename(file)==='initdb')return execFileSync(file,['--ios004-invalid-option'],options);
   const result=execFileSync(file,args,options);
   if(phase==='start'&&basename(file)==='pg_ctl'&&args.includes('start'))throw Error('injected failure after actual start');
   return result;
  }});
  try{if(phase==='connect'){owner.start();await assert.rejects(()=>owner.connect({database:'ios004_missing_database'}));}else assert.throws(()=>owner.start());}
  finally{await owner.cleanup();}
  assert.equal(existsSync(owner.descriptor.root),false);
 }
 const endFailure=createOwnedPg();endFailure.start();
 const client=await endFailure.connect(),end=client.end.bind(client);
 client.end=async()=>{await end();throw Error('injected connection end failure');};
 await assert.rejects(()=>endFailure.cleanup(),/Owned fixture cleanup failed/);
 assert.equal(existsSync(endFailure.descriptor.root),false,'client end failure must still clean owned cluster');
 for(const part of ['data','root']){
  const owner=createOwnedPg();owner.start();const path=owner.descriptor[part],saved=path+'-preserved';
  renameSync(path,saved);mkdirSync(path,{mode:0o700});writeFileSync(join(path,'foreign-sentinel'),'preserve replacement');
  await assert.rejects(()=>owner.cleanup(),/resources preserved/);
  assert.equal(readFileSync(join(path,'foreign-sentinel'),'utf8'),'preserve replacement');
  // Test owns the replacement sentinel too; restore original inode before requesting cleanup.
  rmSync(path,{recursive:true});renameSync(saved,path);await owner.cleanup();
  assert.equal(existsSync(owner.descriptor.root),false);
 }
 console.log('PASS real init/start/connect/end failure cleanup and data/parent replacement refusal; foreign sentinels preserved');
}
