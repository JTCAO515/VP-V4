// Explicit diagnostic probe only; isolated process, actual installed Next modules.
// Never save/print original inspected Error, manifest content, or absolute paths.
import {createRequire} from 'node:module';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {inspect} from 'node:util';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
require('next/dist/server/node-environment-baseline');
const {patchErrorInspectNodeJS}=require('next/dist/server/patch-error-inspect');const {loadManifest,loadManifestFromRelativePath}=require('next/dist/server/load-manifest.external');const {createSafeServerDiagnostic}=await import('./server-diagnostic.mjs');
const previousFlag=process.env.__NEXT_SHOW_IGNORE_LISTED;
const temp=mkdtempSync(join(tmpdir(),'vpj80-next-inspect-')),file=join(temp,'fixture-manifest.json');
try{
 patchErrorInspectNodeJS(Error);writeFileSync(file,'{"SYNTHETIC_SECRET":');let error;try{loadManifest(file,false);}catch(e){error=e;}assert.equal(error.name,'SyntaxError');
 const events=[];const diagnostic=createSafeServerDiagnostic(e=>events.push(e),()=>0);
 for(const flag of [false,true]){flag?process.env.__NEXT_SHOW_IGNORE_LISTED='true':delete process.env.__NEXT_SHOW_IGNORE_LISTED;const shown=inspect(error);diagnostic.write('stderr',shown+'\n');assert.equal(shown.includes('load-manifest.external'),flag);assert.equal(events.some(e=>e.frame?.includes('load-manifest.external')),flag);assert.ok(!JSON.stringify(events).includes('SYNTHETIC_SECRET'));assert.ok(!JSON.stringify(events).includes(temp));console.log(JSON.stringify({showIgnoreListed:flag,originalHasNextFrame:error.stack.includes('load-manifest.external'),inspectedHasNextFrame:shown.includes('load-manifest.external'),safeFrames:events.filter(e=>e.frame).map(e=>e.frame)}));events.length=0;}
 // Controlled truncate/read/restore demonstrates candidate failure mechanism only.
 writeFileSync(file,'');const bytes=readFileSync(file);let name;try{loadManifest(file,false);}catch(e){name=e.name;}assert.equal(name,'SyntaxError');console.log(JSON.stringify({controlledStage:'truncate_before_write',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),name}));writeFileSync(file,'{"routes":[]}');assert.deepEqual(loadManifest(file,false),{routes:[]});console.log(JSON.stringify({controlledStage:'complete_write',parse:'ok'}));
// Exact e802 useEval path: read an existing zero-byte JS manifest, then complete it.
 writeFileSync(file,'');let evalError;try{loadManifestFromRelativePath({projectDir:temp,distDir:'.',manifest:'fixture-manifest.json',useEval:true,handleMissing:true,shouldCache:false});}catch(e){evalError=e;}assert.equal(evalError.name,'Error');assert.equal(evalError.message,'Manifest file is empty');
 const evalEvents=[],evalDiagnostic=createSafeServerDiagnostic(e=>evalEvents.push(e),()=>0);evalDiagnostic.write('stderr',inspect(evalError)+'\n');assert.ok(evalEvents.some(e=>e.frame?.includes('load-manifest.external')));console.log(JSON.stringify({controlledStage:'empty_eval_manifest',bytes:0,name:evalError.name,safeFrames:evalEvents.filter(e=>e.frame).map(e=>e.frame)}));
 writeFileSync(file,'globalThis.__RSC_MANIFEST={fixture:{}};');const complete=loadManifestFromRelativePath({projectDir:temp,distDir:'.',manifest:'fixture-manifest.json',useEval:true,handleMissing:true,shouldCache:false});assert.ok(complete.__RSC_MANIFEST.fixture);console.log(JSON.stringify({controlledStage:'complete_eval_manifest',parse:'ok'}));
}finally{previousFlag===undefined?delete process.env.__NEXT_SHOW_IGNORE_LISTED:process.env.__NEXT_SHOW_IGNORE_LISTED=previousFlag;rmSync(temp,{recursive:true,force:true});}
