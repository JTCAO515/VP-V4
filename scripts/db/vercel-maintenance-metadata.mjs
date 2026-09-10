import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// One fixed project, GET/read commands only. Never env pull/run or decrypt non-public variables.
assert.deepEqual(process.argv.slice(2),['--read-only']);
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const projectId='prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2',teamId='team_vLT8SL2mQJJSnXbD9GzVLP4K';
const env={...process.env,CI:'1',VERCEL_TELEMETRY_DISABLED:'1'};
function cli(args){
  const r=spawnSync('pnpm',['dlx','vercel@59.15.1',...args],{cwd:root,env,encoding:'utf8',timeout:45000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0)throw new Error('Vercel read failed; raw output suppressed');
  const start=r.stdout.indexOf('{');
  assert.ok(start>=0,'Unknown Vercel response envelope');
  return {data:JSON.parse(r.stdout.slice(start)),etag:(/(?:^|\n)etag:\s*([^\r\n]+)/i.exec(r.stdout.slice(0,start))||[])[1]??null};
}
const get=path=>cli(['api',path+(path.includes('?')?'&':'?')+'teamId='+teamId,'--method','GET','--include','--raw']);
try{
  const project=get('/v9/projects/'+projectId).data;assert.equal(project.id,projectId);assert.equal(project.accountId,teamId);assert.equal(project.name,'vp-v4');
  const variables=get('/v10/projects/'+projectId+'/env?decrypt=false').data.envs;
  const keys=variables.map(v=>({key:v.key,target:v.target,gitBranch:v.gitBranch??null,customEnvironmentIds:v.customEnvironmentIds??null,type:v.type}));
  const publicUrls=[];
  for(const v of variables.filter(v=>v.key==='NEXT_PUBLIC_SUPABASE_URL')){
    const one=get('/v1/projects/'+projectId+'/env/'+v.id).data;assert.equal(one.key,'NEXT_PUBLIC_SUPABASE_URL');
    const url=new URL(one.value);assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password);
    publicUrls.push({target:one.target,gitBranch:one.gitBranch??null,origin:url.origin});
  }
  const firewall=get('/v1/security/firewall/config?projectId='+projectId);
  const fingerprint=createHash('sha256').update(JSON.stringify(firewall.data)).digest('hex');
  const fw=v=>v?{id:v.id,version:v.version,updatedAt:v.updatedAt,firewallEnabled:v.firewallEnabled,ruleCount:v.rules?.length??0,ipCount:v.ips?.length??0}:null;
  const firewallStatus=cli(['firewall','status','--json','--project',projectId,'--scope','jtcao515s-projects']).data;
  const team=get('/v2/teams/'+teamId).data;
  const domains=get('/v9/projects/'+projectId+'/domains').data.domains.map(d=>({name:d.name,gitBranch:d.gitBranch??null,verified:d.verified}));
  const deployments=[];
  for(const target of ['production','preview']){
    const selected=project.targets?.[target];if(!selected)continue;
    const d=get('/v13/deployments/'+selected.id).data;
    const names=Array.isArray(d.env)?d.env:Object.keys(d.env??{});
    deployments.push({environment:target,id:d.id,url:d.url,aliases:d.alias??[],readyState:d.readyState,regions:d.regions,
      commit:d.meta?.githubCommitSha??null,branch:d.meta?.githubCommitRef??null,
      configuredKeyNames:names.filter(k=>k.startsWith('NEXT_PUBLIC_')||k.startsWith('VISEPANDA_')),
      tripV2VariablePresent:names.includes('VISEPANDA_TRIP_PROTOCOL_V2'),valuesRetrieved:false});
  }
  const output={observedAt:new Date().toISOString(),project:{id:projectId,teamId,name:'vp-v4',teamSlug:'jtcao515s-projects',nodeVersion:project.nodeVersion,productionBranch:project.link?.productionBranch,
    ssoProtection:project.ssoProtection??null,passwordProtectionEnabled:!!project.passwordProtection,trustedIpsConfigured:!!project.trustedIps},
    team:{plan:team.billing?.plan,status:team.billing?.status},environmentVariables:keys,publicSupabaseUrls:publicUrls,
    firewall:{active:fw(firewall.data.active),draft:fw(firewall.data.draft),versionCount:firewall.data.versions?.length??0,etag:firewall.etag,fingerprint,
      firewallEnabled:firewallStatus.firewallEnabled,ruleCounts:firewallStatus.rules,draftChanges:firewallStatus.draftChanges,bypassCount:firewallStatus.bypass?.length??null},
    domains,deployments,inventoryScope:'current project variables and current production/preview targets; not an exhaustive historical deployment binding inventory',
    mutations:0,privateEnvironmentValuesRetrieved:false};
  writeFileSync(root+'/artifacts/VPJ-02/vercel-maintenance/metadata.json',JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({result:'READ_ONLY_SNAPSHOT',variables:keys.length,publicSupabaseUrls:publicUrls,firewall:output.firewall,mutations:0}));
}catch{console.error('Vercel metadata not verified; raw response and all private environment values suppressed');process.exitCode=1;}
