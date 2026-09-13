import {schemaInventorySQL} from './schema-inventory.mjs';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,createWriteStream,appendFileSync} from 'node:fs';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {tableSnapshotSQL,validateSnapshot} from './table-snapshot.mjs';
import {env,dockerArgs,inventory,image,query,dockerContext} from './transport.mjs';
let stage='roles';
try{
const restoreRoleNames=JSON.parse(query("set role postgres; begin read only; select json_agg(rolname order by rolname) from pg_roles; rollback;"));
stage='inventory';const before=inventory();if(before.authCount!==6||before.tripCount!==3||before.migrationCount!==46)throw Error('Baseline changed');
stage='schema';const schemaBefore=JSON.parse(query(schemaInventorySQL));
stage='tables';const tablesBefore=validateSnapshot(JSON.parse(query(tableSnapshotSQL())));
stage='history';const migrationRows=JSON.parse(query("set role postgres; begin read only; select json_agg(json_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations; rollback;"));
stage='directory';const dir=mkdtempSync('/Users/jtcao/Library/Application Support/VP-V4/Staging-Backups/vpj02-');chmodSync(dir,0o700);
const file=dir+'/database.vpb',key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const output=createWriteStream(file,{flags:'wx',mode:0o600});output.write(Buffer.concat([Buffer.from('VPB1'),iv]));
const dumpName='vpj02-dump-'+randomUUID().slice(0,8);let dumpTimedOut=false;
stage='dump';const child=spawn('docker',dockerArgs('pg_dump',['--lock-wait-timeout=15s','--role=postgres','--format=custom','--schema=public','--schema=private','--schema=auth','--schema=supabase_migrations','--schema=identity_private','--schema=turn_private','--schema=knowledge_review_private']).toSpliced(3,0,'--name',dumpName),{env,stdio:['ignore','pipe','pipe']});let stderrBytes=0;child.stderr.on('data',b=>stderrBytes+=b.length);const exited=new Promise((r,j)=>{child.on('error',j);child.on('close',r);});const deadline=setTimeout(()=>{dumpTimedOut=true;const own=spawnSync('docker',['--context',dockerContext,'inspect','--format','{{index .Config.Labels \"vpj02.owner\"}}',dumpName],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});if(own.status===0&&own.stdout.trim()==='place-grounding-staging-20260914')spawnSync('docker',['--context',dockerContext,'rm','-f',dumpName],{timeout:10000,stdio:['ignore','pipe','pipe']});child.kill('SIGTERM');},180000);
try{await pipeline(child.stdout,cipher,output);if(await exited!==0||dumpTimedOut)throw Error('Dump failed');}finally{clearTimeout(deadline);}
appendFileSync(file,cipher.getAuthTag());
stage='keychain';const service='vp-v4-staging-backup-'+randomUUID();const stored=spawnSync('/usr/bin/security',['-i'],{input:`add-generic-password -a VP-V4 -s ${service} -T /usr/bin/security -w ${key.toString('base64')}\n`,encoding:'utf8',timeout:30000});if(stored.status!==0)throw Error('Key storage failed');
const recovered=Buffer.from(execFileSync('/usr/bin/security',['find-generic-password','-a','VP-V4','-s',service,'-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'base64');if(!recovered.equals(key))throw Error('Key mismatch');const blob=readFileSync(file),dec=createDecipheriv('aes-256-gcm',recovered,blob.subarray(4,16));dec.setAuthTag(blob.subarray(-16));const plain=Buffer.concat([dec.update(blob.subarray(16,-16)),dec.final()]);
stage='archive';const toc=spawnSync('docker',['--context',dockerContext,'run','--network','none','--label','vpj02.owner=place-grounding-staging-20260914','--pull=never','--rm','-i','--entrypoint','pg_restore',image,'--list'],{input:plain,encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000});if(toc.status!==0)throw Error('Archive invalid');const after=inventory();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Concurrent change');
const tablesAfter=validateSnapshot(JSON.parse(query(tableSnapshotSQL(tablesBefore))));if(JSON.stringify(tablesBefore)!==JSON.stringify(tablesAfter))throw Error('Concurrent table change');
const schemaAfter=JSON.parse(query(schemaInventorySQL));if(JSON.stringify(schemaBefore)!==JSON.stringify(schemaAfter))throw Error('Schema changed');
const meta={schemaBefore,schemaAfter,tablesBefore,tablesAfter,format:'VPB1-AES-256-GCM',createdAt:new Date().toISOString(),targetName:'VP - V4',region:'ap-southeast-1',keychainService:service,file,bytes:blob.length,ciphertextSha256:createHash('sha256').update(blob).digest('hex'),sourceBefore:before,sourceAfter:after,migrationRows,scopes:['public','private','auth','supabase_migrations','identity_private','turn_private','knowledge_review_private'],restoreRoleNames,restoreRehearsal:'PENDING',stderrBytes};writeFileSync(dir+'/manifest.json',JSON.stringify(meta,null,2)+'\n',{mode:0o600,flag:'wx'});writeFileSync('/Users/jtcao/Library/Caches/visepanda/place-grounding-staging-20260914/current-backup-path',dir,{mode:0o600});key.fill(0);recovered.fill(0);plain.fill(0);console.log(JSON.stringify({backup:'PASS',encrypted:true,keychainReadback:true,sourceStable:true,authCount:before.authCount,tripCount:before.tripCount,migrationCount:before.migrationCount,restore:'PENDING'}));
}catch(e){console.error(JSON.stringify({backup:'FAIL',stage,errorType:e.name,location:e.stack?.split('\n')[1]?.replace(/at .+?\(/,'at (')}));process.exitCode=1;}
