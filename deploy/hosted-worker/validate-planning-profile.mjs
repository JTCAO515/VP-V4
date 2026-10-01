/** Offline deployment-package checks. No credential, RPC, Docker or network I/O.
 * A target record selects metadata; it never grants activation authority. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseHostedWorkerProfile} from '../../lib/server/jobs/hosted-text-worker.ts';
import {isQwenEndpoint} from '../../lib/server/model-gateway/adapters/provider-endpoints.ts';

const baseKeys=['schemaVersion','environment','databaseUrl','ownerId','planningPolicyId','scopeId','build','qwenEndpoint','startupState','restartPolicy'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
function prepare(profile,target){
 if(!exact(target,baseKeys)||target.schemaVersion!=='vpj80-planning-deployment-target/1'||target.environment!=='staging'
  ||target.databaseUrl!=='https://dzqdzetcctkhbrhlxxgn.supabase.co'||!['ownerId','planningPolicyId','scopeId'].every(k=>uuid(target[k]))
  ||typeof target.build!=='string'||!/^[a-f0-9]{12,40}$/.test(target.build)||!isQwenEndpoint(target.qwenEndpoint)
  ||target.startupState!=='disabled'||target.restartPolicy!=='no')throw Error('invalid target');
 const checked=parseHostedWorkerProfile(profile);
 if(checked.schemaVersion!=='vpj07-hosted-text-worker/2'||!checked.planning
  ||!['ownerId','planningPolicyId','scopeId'].every(k=>checked.planning[k]===target[k])
  ||/^(?:sb_|sk-|SYNTHETIC_)/i.test(checked.qwen.priceVersion))throw Error('invalid profile');
 const profileJson=JSON.stringify(checked)+'\n';
 return {profileJson,targetJson:JSON.stringify({...target,profileSha256:hash(profileJson)})+'\n'};
}
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--prepare'){
  const chunks=[];let length=0;for await(const chunk of process.stdin){length+=chunk.length;if(length>32768)throw Error('too large');chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!exact(input,['profile','target']))throw Error('invalid input');
  process.stdout.write(JSON.stringify(prepare(input.profile,input.target)));
 }else{
  if(args.length<2||args.length>4)throw Error('arguments');
  const [profilePath,targetPath,expectedBuild,emit]=args;
  if(emit!==undefined&&emit!=='--emit')throw Error('arguments');
  if(expectedBuild!==undefined&&!/^[a-f0-9]{12,40}$/.test(expectedBuild))throw Error('arguments');
  const [profileJson,targetJson]=await Promise.all([readFile(profilePath,'utf8'),readFile(targetPath,'utf8')]);
  if(Buffer.byteLength(profileJson)>16384||Buffer.byteLength(targetJson)>4096)throw Error('too large');
  const target=JSON.parse(targetJson);
  if(!exact(target,[...baseKeys,'profileSha256'])||target.profileSha256!==hash(profileJson))throw Error('hash');
  const {profileSha256,...selected}=target;
  const canonical=prepare(JSON.parse(profileJson),selected);
  // Packaging emits canonical bytes. This rejects duplicate keys, whitespace
  // rewrites and a changed target even when JSON.parse would accept them.
  if(profileJson!==canonical.profileJson||targetJson!==canonical.targetJson||expectedBuild!==undefined&&target.build!==expectedBuild)throw Error('package');
  if(emit==='--emit')process.stdout.write(profileJson.trim()+'\n'+target.qwenEndpoint);
 }
}catch{
 console.error('Planning deployment package unavailable.');process.exitCode=1;
}
