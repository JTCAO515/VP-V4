/** Offline package binding only. No credentials, network or activation authority. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseQaHostedProfile} from '../../lib/server/qa-agent/hosted-profile.ts';
import {readApprovedQaTarget} from '../../lib/server/qa-agent/target.ts';
import {isQwenEndpoint} from '../../lib/server/model-gateway/adapters/provider-endpoints.ts';

const keys=['schemaVersion','environment','projectRef','databaseUrl','ownerId','policyId','scopeId','noticeHash','build','qwenEndpoint','startupState','restartPolicy'];
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
function prepare(profile,target){
  const binding=readApprovedQaTarget(target?.projectRef);
  if(!exact(target,keys)||target.schemaVersion!=='qa-hosted-deployment-target/2'||target.environment!=='staging'
    ||!binding||target.databaseUrl!==binding.databaseUrl||!['ownerId','policyId','scopeId'].every(k=>uuid(target[k]))
    ||typeof target.noticeHash!=='string'||!/^[a-f0-9]{64}$/.test(target.noticeHash)
    ||typeof target.build!=='string'||!/^[a-f0-9]{12,40}$/.test(target.build)||!isQwenEndpoint(target.qwenEndpoint)
    ||target.startupState!=='disabled'||target.restartPolicy!=='no')throw Error('target');
  if(profile?.schemaVersion!=='vpj07-hosted-text-worker/4'||profile.projectRef!==target.projectRef)throw Error('profile target');
  const checked=parseQaHostedProfile(profile);
  if(/^(?:sb_secret_|sk-|token_|password_)/i.test(checked.qwen.priceVersion))throw Error('profile');
  const profileJson=JSON.stringify(checked)+'\n';
  return {profileJson,targetJson:JSON.stringify({...target,profileSha256:hash(profileJson)})+'\n'};
}
try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--prepare'){
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;if(size>32768)throw Error('size');chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!exact(input,['profile','target']))throw Error('input');
    process.stdout.write(JSON.stringify(prepare(input.profile,input.target)));
  }else{
    if(args.length<2||args.length>4)throw Error('arguments');
    const [profilePath,targetPath,build,emit]=args;
    if(emit!==undefined&&!['--emit','--emit-runtime'].includes(emit)||build!==undefined&&!/^[a-f0-9]{12,40}$/.test(build))throw Error('arguments');
    if(emit==='--emit-runtime'&&(!build||process.env.VISEPANDA_HOSTED_WORKER_BUILD!==build))throw Error('image build');
    const [profileJson,targetJson]=await Promise.all([readFile(profilePath,'utf8'),readFile(targetPath,'utf8')]);
    if(Buffer.byteLength(profileJson)>16384||Buffer.byteLength(targetJson)>4096)throw Error('size');
    const target=JSON.parse(targetJson);
    if(!exact(target,[...keys,'profileSha256'])||target.profileSha256!==hash(profileJson))throw Error('hash');
    const {profileSha256,...selected}=target;
    const canonical=prepare(JSON.parse(profileJson),selected);
    if(profileJson!==canonical.profileJson||targetJson!==canonical.targetJson||build!==undefined&&target.build!==build)throw Error('package');
    if(emit==='--emit'||emit==='--emit-runtime'){
      process.stdout.write(profileJson.trim()+'\n'+target.qwenEndpoint);
      if(emit==='--emit-runtime')process.stdout.write('\n'+JSON.stringify({schemaVersion:'qa-runtime-binding/1',
        projectRef:target.projectRef,ownerId:target.ownerId,policyId:target.policyId,scopeId:target.scopeId,noticeHash:target.noticeHash}));
    }
  }
}catch{
  console.error('QA deployment package unavailable.');process.exitCode=1;
}
