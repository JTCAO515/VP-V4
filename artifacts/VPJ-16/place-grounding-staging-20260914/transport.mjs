import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
function safeExec(...args){try{return execFileSync(...args);}catch{throw new Error('Staging transport initialization failed; private command output suppressed');}}
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Docker overrides refused');
export const dockerContext='desktop-linux';
const dockerEndpoint=safeExec('docker',['context','inspect',dockerContext,'--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(dockerEndpoint!=='unix:///Users/jtcao/.docker/run/docker.sock')throw Error('Unexpected Docker endpoint');
export const cwd='/Users/jtcao/Documents/VP-V4-Staging-Audit';
export const image='public.ecr.aws/supabase/postgres:17.6.1.159';
export const ca='/Users/jtcao/Library/Caches/visepanda/place-grounding-staging-20260914/supabase-ca.crt';
export const ref=readFileSync(cwd+'/supabase/.temp/project-ref','utf8').trim();
if(ref!=='dzqdzetcctkhbrhlxxgn')throw Error('Unauthorized project ref');
const pool=new URL(readFileSync(cwd+'/supabase/.temp/pooler-url','utf8').trim());
if(pool.protocol!=='postgresql:'||pool.hostname!=='aws-0-ap-southeast-1.pooler.supabase.com'||pool.port!=='5432'||pool.username!=='postgres.'+ref||pool.pathname!=='/postgres'||pool.password||pool.search)throw Error('Pool target mismatch');
export const verifiedPoolUrl=pool.toString();
const listed=JSON.parse(safeExec('supabase',['projects','list','--output-format','json'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const target=(listed.projects??listed).find(p=>p.id===ref);
if(target?.name!=='VP - V4'||target.region!=='ap-southeast-1'||target.status!=='ACTIVE_HEALTHY')throw Error('Target identity mismatch');
const dry=safeExec('supabase',['db','dump','--linked','--dry-run','--schema','public,private,auth,supabase_migrations,identity_private,turn_private'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const pg={};
for(const line of dry.split('\n')){const m=line.match(/^export (PG[A-Z_]+)=(.*)$/);if(!m)continue;let v=m[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(/[\n\r`$"'\\]/.test(v))throw Error('Unsupported credential quoting');pg[m[1]]=v;}
if(pg.PGUSER!=='cli_login_postgres'||!pg.PGPASSWORD||pg.PGDATABASE!=='postgres')throw Error('Unexpected login role');
export const env={...process.env,...pg,PGHOST:pool.hostname,PGPORT:pool.port||'5432',PGUSER:pg.PGUSER+'.'+ref,PGSSLMODE:'verify-full',PGSSLROOTCERT:'/tmp/supabase-ca.crt',PGCONNECT_TIMEOUT:'15'};
export const dockerArgs=(binary,args)=>['--context',dockerContext,'run','--label','vpj02.owner=place-grounding-staging-20260914','--pull=never','--rm','-i','--entrypoint',binary,'-v',ca+':/tmp/supabase-ca.crt:ro',...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGSSLROOTCERT','PGCONNECT_TIMEOUT'].flatMap(k=>['-e',k]),image,...args];
export function query(sql){const p=spawnSync('docker',dockerArgs('psql',['-X','-q','-At','-v','ON_ERROR_STOP=1']),{input:sql,env,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});if(p.status!==0){const kinds=[['authentication',/password authentication failed|authentication/],['timeout',/timeout|timed out/],['connection_closed',/server closed|connection.*closed|SSL SYSCALL/],['tls',/SSL|certificate/],['sql_error',/ERROR:/]].filter(([,re])=>re.test(p.stderr??'')).map(([kind])=>kind);console.error(JSON.stringify({transport:'FAIL',exitCode:p.status,signal:p.signal,errorCode:p.error?.code,categories:kinds}));throw Error('Verified SQL failed');}return p.stdout.trim();}
export const inventorySql=`set role postgres; begin read only; select json_build_object('authCount',(select count(*) from auth.users),'tripCount',(select count(*) from public.trips),'migrationCount',(select count(*) from supabase_migrations.schema_migrations),'authDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(u) order by id),'[]')::text,'UTF8')),'hex') from auth.users u),'tripDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')::text,'UTF8')),'hex') from public.trips t)); rollback;`;
export const inventory=()=>JSON.parse(query(inventorySql));
