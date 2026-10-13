import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshOpsBootstrapSQL, stageFreshOpsFixtureBootstrap } from '../../integration/observability/ops-control-owned/fresh-bootstrap.mjs';

test('owned temporary fixture preserves all product bytes and appends a separate guarded initialization',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vp-w2-bootstrap-'));
  try {
    mkdirSync(join(dir,'supabase'));cpSync('supabase/migrations',join(dir,'supabase/migrations'),{recursive:true});
    const files=readdirSync('supabase/migrations').sort();
    assert.equal(stageFreshOpsFixtureBootstrap(dir),true);
    for(const file of files)assert.deepEqual(readFileSync(join(dir,'supabase/migrations',file)),readFileSync(join('supabase/migrations',file)));
    const own=join(dir,'supabase/migrations/20990101000000_disposable_w2_fixture_initialization.sql');
    assert.equal(readFileSync(own,'utf8'),freshOpsBootstrapSQL());
    assert.throws(()=>stageFreshOpsFixtureBootstrap(dir),/inventory differs/);
    assert.equal(readFileSync(own,'utf8'),freshOpsBootstrapSQL(),'repeat cannot rewrite an existing fixture initializer');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('fixture staging refuses source mutations and repository or symlink destinations',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vp-w2-bootstrap-'));
  try {
    mkdirSync(join(dir,'supabase'));cpSync('supabase/migrations',join(dir,'supabase/migrations'),{recursive:true});
    const source=join(dir,'supabase/migrations/20261012103151_vpj37_ops_control_w2.sql');
    writeFileSync(source,readFileSync(source,'utf8')+'\n-- unknown source\n');
    assert.throws(()=>stageFreshOpsFixtureBootstrap(dir),/source differs/);
    assert.equal(existsSync(join(dir,'supabase/migrations/20990101000000_disposable_w2_fixture_initialization.sql')),false);
    assert.throws(()=>stageFreshOpsFixtureBootstrap(process.cwd()),/outside temporary root/);
    const link=dir+'-link';symlinkSync(dir,link,'dir');
    try{assert.throws(()=>stageFreshOpsFixtureBootstrap(link),/owned absolute temporary directory/);}finally{rmSync(link);}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('historical pre-W2 fixture prefix receives no activation or additional migration',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vp-w2-bootstrap-'));
  try {
    mkdirSync(join(dir,'supabase/migrations'),{recursive:true});
    assert.equal(stageFreshOpsFixtureBootstrap(dir),false);
    assert.deepEqual(readdirSync(join(dir,'supabase/migrations')),[]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('byte-identical migration symlinks and linked migration directories refuse before initialization',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vp-w2-bootstrap-'));
  try{
    mkdirSync(join(dir,'supabase'));cpSync('supabase/migrations',join(dir,'supabase/migrations'),{recursive:true});
    const source=join(dir,'supabase/migrations/20261012103151_vpj37_ops_control_w2.sql');
    rmSync(source);symlinkSync(join(process.cwd(),'supabase/migrations/20261012103151_vpj37_ops_control_w2.sql'),source);
    assert.throws(()=>stageFreshOpsFixtureBootstrap(dir),/regular without symlinks/);
    assert.equal(existsSync(join(dir,'supabase/migrations/20990101000000_disposable_w2_fixture_initialization.sql')),false);
    rmSync(join(dir,'supabase/migrations'),{recursive:true});
    symlinkSync(join(process.cwd(),'supabase/migrations'),join(dir,'supabase/migrations'),'dir');
    assert.throws(()=>stageFreshOpsFixtureBootstrap(dir),/owned without symlinks/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
