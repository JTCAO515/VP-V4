import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,symlinkSync,writeFileSync,statSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {validateAuthBootstrap,admitAuthBootstrap} from '../../../../tests/integration/journey-entry/goal-return/auth-bootstrap.mjs';
import {project,network,nonce} from '../../../../tests/integration/journey-entry/goal-return/scope.mjs';
const keys=['API_EXTERNAL_URL','GOTRUE_LOG_LEVEL','GOTRUE_DB_DRIVER','GOTRUE_DB_DATABASE_URL','GOTRUE_SITE_URL','GOTRUE_JWT_SECRET'];
const env={API_EXTERNAL_URL:'http://127.0.0.1:63841/auth/v1',GOTRUE_LOG_LEVEL:'error',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:synthetic-password@supabase_db_'+project+':5432/postgres',GOTRUE_SITE_URL:'http://127.0.0.1:3000',GOTRUE_JWT_SECRET:'synthetic-private-value-not-recorded'.repeat(2)};
const argv=['run','--rm','--network',network,...keys.flatMap(k=>['-e',k]),'--label','com.supabase.cli.project='+project,'--label','com.docker.compose.project='+project,'public.ecr.aws/supabase/gotrue:v2.196.0','gotrue','migrate'];
test('only pinned official Auth migrate argv and local secret-bearing env qualify without exposing values',()=>{
 const result=validateAuthBootstrap(argv,env,'synthetic-password');assert.equal(result.imageClass,'pinned_auth');assert.equal(result.envKeyCount,6);
 for(const secret of Object.values(env))assert.ok(!JSON.stringify(result).includes(secret));
 const bad=[argv.map(v=>v===network?'foreign':v),argv.map(v=>v.startsWith('com.supabase.cli.project=')?'com.supabase.cli.project=foreign':v),argv.map(v=>v==='migrate'?'serve':v),
  argv.map(v=>v==='public.ecr.aws/supabase/gotrue:v2.196.0'?'public.ecr.aws/supabase/realtime:v2.130.0':v),argv.map(v=>v==='GOTRUE_SITE_URL'?'UNKNOWN_ENV':v),
  ['--context','foreign',...argv],['container',...argv],argv.filter(v=>v!=='--rm'),[...argv,'extra'],
  ...[['-p','63841:9999'],['-v','foreign:/data'],['--privileged'],['--entrypoint','sh'],['--env-file','foreign'],['--network','host']].map(extra=>['run',...extra,...argv.slice(1)])];
 for(const args of bad)assert.throws(()=>validateAuthBootstrap(args,env,'synthetic-password'),/^Error: E3_DOCKER_AUTH_BOOTSTRAP_DENIED/);
 for(const change of [{GOTRUE_LOG_LEVEL:'debug'},{GOTRUE_DB_DRIVER:'other'},{GOTRUE_DB_DATABASE_URL:env.GOTRUE_DB_DATABASE_URL.replace('supabase_db_'+project,'foreign')},
  {API_EXTERNAL_URL:'https://foreign.example/auth/v1'},{GOTRUE_SITE_URL:'https://foreign.example'},{GOTRUE_JWT_SECRET:''}])assert.throws(()=>validateAuthBootstrap(argv,{...env,...change},'synthetic-password'));
});
test('at most one job admission; fixed private file never follows symlink',()=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),nonce+'-auth-test-')));
 try{admitAuthBootstrap(directory);assert.equal(statSync(join(directory,'auth-bootstrap-admission.json')).mode&0o777,0o600);assert.throws(()=>admitAuthBootstrap(directory));}
 finally{rmSync(directory,{recursive:true});}
 const second=realpathSync(mkdtempSync(join(tmpdir(),nonce+'-auth-test-')));
 try{const target=join(second,'other');writeFileSync(target,'PRIVATE',{mode:0o600});symlinkSync(target,join(second,'auth-bootstrap-admission.json'));assert.throws(()=>admitAuthBootstrap(second));}
 finally{rmSync(second,{recursive:true});}
});
