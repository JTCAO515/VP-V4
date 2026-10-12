import {openSync,writeFileSync,closeSync,constants} from 'node:fs';
import {join} from 'node:path';
import {fixtureDirectoryGuard} from './reject-observation.mjs';
import {network,project,portBase,imageIds} from './scope.mjs';
const tag='public.ecr.aws/supabase/gotrue:v2.196.0';
const keys=['API_EXTERNAL_URL','GOTRUE_LOG_LEVEL','GOTRUE_DB_DRIVER','GOTRUE_DB_DATABASE_URL','GOTRUE_SITE_URL','GOTRUE_JWT_SECRET'];
const deny=()=>{throw Error('E3_DOCKER_AUTH_BOOTSTRAP_DENIED');};
/** Validates the exact official one-shot command. Never returns/logs env values. */
export function validateAuthBootstrap(args,env,expectedPassword){
 if(!Array.isArray(args)||args[0]!=='run'||!args.every(v=>typeof v==='string'))deny();
 let rm=0,net=[],labels=[],passed=[],image,index=1;
 while(index<args.length){
  const token=args[index];if(!token.startsWith('-')){image=token;break;}
  if(token==='--rm'){rm++;index++;continue;}
  if(!['--network','--label','-e','--env'].includes(token))deny();const value=args[index+1];if(!value)deny();
  if(token==='--network')net.push(value);else if(token==='--label')labels.push(value);else passed.push(value);index+=2;
 }
 if(rm!==1||net.length!==1||net[0]!==network||labels.length!==2||new Set(labels).size!==2
  ||!labels.includes('com.supabase.cli.project='+project)||!labels.includes('com.docker.compose.project='+project)
  ||passed.length!==6||new Set(passed).size!==6||!keys.every(k=>passed.includes(k))
  ||(image!==tag&&image!==imageIds[tag])||args.length!==index+3||args[index+1]!=='gotrue'||args[index+2]!=='migrate')deny();
 if(env.GOTRUE_LOG_LEVEL!=='error'||env.GOTRUE_DB_DRIVER!=='postgres'||typeof env.GOTRUE_JWT_SECRET!=='string'
  ||env.GOTRUE_JWT_SECRET.length<32||env.GOTRUE_JWT_SECRET.length>8192||typeof expectedPassword!=='string'||!expectedPassword)deny();
 let db,api,site;try{db=new URL(env.GOTRUE_DB_DATABASE_URL);api=new URL(env.API_EXTERNAL_URL);site=new URL(env.GOTRUE_SITE_URL);}catch{deny();}
 if(!['postgres:','postgresql:'].includes(db.protocol)||db.username!=='supabase_auth_admin'||decodeURIComponent(db.password)!==expectedPassword
  ||db.hostname!=='supabase_db_'+project||db.port!=='5432'||db.pathname!=='/postgres'||db.search||db.hash
  ||api.href!==`http://127.0.0.1:${portBase+21}/auth/v1`||site.href!=='http://127.0.0.1:3000/')deny();
 return {operationClass:'run',imageClass:'pinned_auth',ownNetwork:true,ownProjectLabels:true,envKeyCount:6};
}
export function admitAuthBootstrap(directory){
 fixtureDirectoryGuard(directory);let fd;
 try{fd=openSync(join(directory,'auth-bootstrap-admission.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  writeFileSync(fd,JSON.stringify({schemaVersion:'e3-auth-migrate-admission/1',count:1}));
 }catch{throw Error('E3_DOCKER_AUTH_BOOTSTRAP_DENIED');}finally{if(fd!==undefined)closeSync(fd);}
}
