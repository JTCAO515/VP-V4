import {project,network,portBase,imageIds} from './scope.mjs';

const roles={
 db:{tag:'public.ecr.aws/supabase/postgres:17.6.1.167',publish:new Map([[portBase+22,5432]])},
 auth:{tag:'public.ecr.aws/supabase/gotrue:v2.196.0',publish:new Map()},
 rest:{tag:'public.ecr.aws/supabase/postgrest:v16.2',publish:new Map()},
 kong:{tag:'public.ecr.aws/supabase/kong:2.8.1',publish:new Map([[portBase+21,8000]])},
};
const values=new Set(['--name','--network','--hostname','--env','-e','--volume','-v','--tmpfs','--label','--entrypoint','--health-cmd',
 '--health-interval','--health-timeout','--health-start-period','--health-retries','--restart','--stop-timeout','--shm-size','--user','--workdir',
 '--security-opt','--cap-add','--ulimit','--add-host','--network-alias','--expose','--publish','-p']);
const booleans=new Set(['--rm','--init','--read-only','--interactive','-i','--tty','-t','--no-healthcheck']);
const deny=code=>{throw new Error('E3_DOCKER_'+code);};

/** Pure, argv-only guard. No environment/secret/file/daemon access. */
export function loopbackDockerArgv(args){
 if(!Array.isArray(args)||!args.every(v=>typeof v==='string'))deny('INVALID_ARGV');
 if(args[0]?.startsWith('-')&&!['--version','--help','-v','-h'].includes(args[0]))deny('OPERATION_DENIED');
 if(args[0]==='container'&&['create','run'].includes(args[1]))deny('OPERATION_DENIED');
 if(args[0]==='run'||args[0]==='compose'||args[0]==='pull'||args[0]==='image'&&args[1]==='pull')deny('OPERATION_DENIED');
 if(args[0]!=='create')return {args:[...args],record:null};
 const output=[...args],publications=[];let name,net,image,index=1;
 while(index<args.length){
  const token=args[index];if(token==='--'||token==='-P'||token==='--publish-all'||token.startsWith('--publish-all='))deny('AMBIGUOUS_CREATE');
  if(!token.startsWith('-')){image=token;break;}
  const equals=token.indexOf('='),flag=equals>0?token.slice(0,equals):token;
  if(booleans.has(flag)){if(equals>0)deny('BOOLEAN_FORMAT');index++;continue;}
  if(!values.has(flag))deny('UNKNOWN_FLAG');
  const value=equals>0?token.slice(equals+1):args[index+1];if(value===undefined||value==='')deny('MISSING_VALUE');
  if(flag==='--name'){if(name!==undefined)deny('DUPLICATE_NAME');name=value;}
  if(flag==='--network'){if(net!==undefined)deny('DUPLICATE_NETWORK');net=value;}
  if(flag==='-p'||flag==='--publish')publications.push({index,value,equals,flag});
  index+=equals>0?1:2;
 }
 if(!image||!name||!net)deny('INCOMPLETE_CREATE');
 const role=Object.keys(roles).find(r=>name==='supabase_'+r+'_'+project);
 if(!role)deny('FOREIGN_CONTAINER');if(net!==network)deny('FOREIGN_NETWORK');
 if(image!==roles[role].tag&&image!==imageIds[roles[role].tag])deny('FOREIGN_IMAGE');
 const seen=new Set(),record=[];
 for(const p of publications){
  const match=/^(?:(127\.0\.0\.1|0\.0\.0\.0):)?([1-9][0-9]{3,4}):([1-9][0-9]{0,4})(\/tcp)?$/.exec(p.value);
  if(!match)deny('PUBLISH_FORMAT');
  const host=Number(match[2]),container=Number(match[3]);
  if(roles[role].publish.get(host)!==container)deny('FOREIGN_PORT');if(seen.has(host))deny('DUPLICATE_PUBLISH');seen.add(host);
  const tightened='127.0.0.1:'+match[2]+':'+match[3]+(match[4]??'');
  if(p.equals>0)output[p.index]=p.flag+'='+tightened;else output[p.index+1]=tightened;
  record.push({role,hostPort:host,containerPort:container,originalBinding:match[1]??'implicit',binding:'127.0.0.1'});
 }
 if(seen.size!==roles[role].publish.size)deny('MISSING_PUBLISH');
 return {args:output,record};
}
