import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Immutable Git objects only. Never imports a peer's live worktree/resource. */
export async function fixedSource(t,checkpoint){
 if(!/^[a-f0-9]{40}$/.test(checkpoint??''))throw Error('Explicit reviewed CANONICAL_SQL_CHECKPOINT SHA required; no working-tree fallback');
 execFileSync('git',['merge-base','--is-ancestor','ead1efc19f2f540d9056eb37ed90333388b0c8a9',checkpoint],{stdio:'pipe'});
 const pins={};
 const readSource=path=>{if(!/^(?:supabase\/migrations\/[a-z0-9_]+\.sql|tests\/integration\/(?:canonical-place-ask-sql\/(?:fixtures|db)\.mjs|turn\/fixtures\/durable-work-schema\.sql))$/.test(path))throw Error('Unregistered fixed source');const value=execFileSync('git',['show',checkpoint+':'+path],{encoding:'utf8',maxBuffer:16*1024*1024});pins[path]=createHash('sha256').update(value).digest('hex');return value;};
 const all=execFileSync('git',['ls-tree','-r','--name-only',checkpoint,'supabase/migrations'],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.sql')).sort();
 const append='supabase/migrations/20261015083120_agent005_canonical_place_ask.sql';
 if(!all.includes(append))throw Error('Fixed canonical append missing');
 const migrations=[...all.filter(p=>p!==append),append];
 const root=mkdtempSync(join(tmpdir(),'a005http-source-'));chmodSync(root,0o700);t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const name of ['fixtures','db'])writeFileSync(join(root,name+'.mjs'),readSource('tests/integration/canonical-place-ask-sql/'+name+'.mjs'),{mode:0o600});
 const {canonicalFixturePorts}=await import(pathToFileURL(join(root,'fixtures.mjs')).href);
 if(typeof canonicalFixturePorts!=='function')throw Error('Fixed SQL fixture lacks own-connection portable interface');
 return {checkpoint,pins,readSource,migrations,canonicalFixturePorts};
}
