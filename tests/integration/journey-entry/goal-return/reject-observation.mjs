import {constants,lstatSync,realpathSync,openSync,writeFileSync,readSync,closeSync,fstatSync} from 'node:fs';
import {join,basename,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {project,network,imageIds,nonce} from './scope.mjs';
const reasons=new Set(['INVALID_ARGV','OPERATION_DENIED','AMBIGUOUS_CREATE','BOOLEAN_FORMAT','UNKNOWN_FLAG','MISSING_VALUE','DUPLICATE_NAME','DUPLICATE_NETWORK',
 'INCOMPLETE_CREATE','FOREIGN_CONTAINER','FOREIGN_NETWORK','FOREIGN_IMAGE','PUBLISH_FORMAT','FOREIGN_PORT','DUPLICATE_PUBLISH','MISSING_PUBLISH','CONFIG','LAUNCH_FAILED','ADAPTER_UNAVAILABLE']);
const operations=new Set(['create','run','compose','image_pull','other']);
const images=new Set(['pinned_db','pinned_auth','pinned_rest','pinned_kong','realtime_unleased','storage_unleased','unclassified']);
const keys=['schemaVersion','reason','operationClass','imageClass','ownProjectLabels','ownNetwork','ownContainerName'];
const valueFlags=new Set(['--name','--network','--hostname','--env','-e','--volume','-v','--tmpfs','--label','--entrypoint','--health-cmd','--health-interval',
 '--health-timeout','--health-start-period','--health-retries','--restart','--stop-timeout','--shm-size','--user','--workdir','--security-opt','--cap-add','--ulimit',
 '--add-host','--network-alias','--expose','--publish','-p']);
const boolFlags=new Set(['--rm','--init','--read-only','--interactive','-i','--tty','-t','--no-healthcheck']);
export function classifyReject(args,error){
 const reason=reasons.has(String(error?.message??'').replace(/^E3_DOCKER_/,''))?String(error.message).replace(/^E3_DOCKER_/,''):'ADAPTER_UNAVAILABLE';
 const operationClass=args?.[0]==='pull'||args?.[0]==='image'&&args?.[1]==='pull'?'image_pull':operations.has(args?.[0])?args[0]:'other';
 let image,ns=[],nets=[],labels=[];
 if(Array.isArray(args)&&args.every(v=>typeof v==='string')){
  if(operationClass==='image_pull')image=args[args[0]==='image'?2:1];
  else if(operationClass==='run'||operationClass==='create')for(let i=1;i<args.length;){
   const token=args[i];if(!token.startsWith('-')){image=token;break;}
   const eq=token.indexOf('='),flag=eq>0?token.slice(0,eq):token;
   if(boolFlags.has(flag)){i++;continue;}if(!valueFlags.has(flag))break;
   const value=eq>0?token.slice(eq+1):args[i+1];if(typeof value!=='string')break;
   if(flag==='--name')ns.push(value);if(flag==='--network')nets.push(value);if(flag==='--label')labels.push(value);i+=eq>0?1:2;
  }
 }
 const roles=['db','auth','rest','kong'],tags=Object.keys(imageIds);let imageClass='unclassified';
 for(let i=0;i<tags.length;i++)if(image===tags[i]||image===imageIds[tags[i]])imageClass='pinned_'+roles[i];
 if(typeof image==='string'&&/^(?:public\.ecr\.aws\/)?supabase\/realtime(?::|@)/.test(image))imageClass='realtime_unleased';
 if(typeof image==='string'&&/^(?:public\.ecr\.aws\/)?supabase\/storage-api(?::|@)/.test(image))imageClass='storage_unleased';
 const ownProjectLabels=['com.supabase.cli.project','com.docker.compose.project'].every(key=>labels.filter(v=>v.startsWith(key+'=')).length===1&&labels.includes(key+'='+project));
 return {schemaVersion:'e3-docker-reject/1',reason,operationClass,imageClass,ownProjectLabels,ownNetwork:nets.length===1&&nets[0]===network,
  ownContainerName:ns.length===1&&roles.some(role=>ns[0]==='supabase_'+role+'_'+project)};
}
export function validReject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
 &&v.schemaVersion==='e3-docker-reject/1'&&reasons.has(v.reason)&&operations.has(v.operationClass)&&images.has(v.imageClass)
 &&['ownProjectLabels','ownNetwork','ownContainerName'].every(k=>typeof v[k]==='boolean');}
function directoryGuard(directory){const s=lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(directory)!==directory||(s.mode&0o777)!==0o700||s.uid!==process.getuid()
 ||dirname(directory)!==realpathSync(tmpdir())||!basename(directory).startsWith(nonce+'-'))throw Error('E3_OBSERVATION_DIRECTORY');}
export function writeReject(directory,record){
 directoryGuard(directory);if(!validReject(record))throw Error('E3_OBSERVATION_SCHEMA');
 const bytes=Buffer.from(JSON.stringify(record));if(bytes.length>4096)throw Error('E3_OBSERVATION_SIZE');
 let fd;try{fd=openSync(join(directory,'reject-observation.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,bytes);return true;}
 catch(error){if(error.code==='EEXIST')return false;throw error;}finally{if(fd!==undefined)closeSync(fd);}
}
export function readReject(directory){
 directoryGuard(directory);let fd;
 try{fd=openSync(join(directory,'reject-observation.json'),constants.O_RDONLY|constants.O_NOFOLLOW);const s=fstatSync(fd);
  if(!s.isFile()||(s.mode&0o777)!==0o600||s.uid!==process.getuid()||s.size>4096)throw Error('E3_OBSERVATION_FILE');
  const bytes=Buffer.alloc(4097),count=readSync(fd,bytes,0,bytes.length,null);if(count>4096)throw Error('E3_OBSERVATION_SIZE');
  const value=JSON.parse(bytes.subarray(0,count).toString('utf8'));if(!validReject(value))throw Error('E3_OBSERVATION_SCHEMA');return value;
 }catch(error){if(error.code==='ENOENT')return null;throw error;}finally{if(fd!==undefined)closeSync(fd);}
}
