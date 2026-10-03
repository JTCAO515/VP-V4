import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { classify as integrationClassification } from './ci-suites/db-integration.mjs';
import { PLANNING_RECEIPT_PATH } from './lib/planning-receipt.mjs';

// Only known navigation and planning documents qualify. Runtime data, contracts,
// ADRs, code, tests, workflow changes and unknown files retain the complete gate.
const documents = new Set([
  'README.md', 'AGENTS.md', 'CONTEXT.md', 'HANDOFF.md',
  'docs/INDEX.md', 'docs/handoff.json', 'docs/manifest.json',
  'docs/program/2026-09-05/issue-plan.json',
  'docs/VISEPANDA-MASTER-PLAN-2026-09-05.md',
  'docs/program/2026-09-05/BRAND-ALIGNMENT-EXECUTION.md',
  'docs/program/2026-09-05/PRODUCT-EXPERIENCE-2026-09-17.md',
  // Historical, planning-only receipt; docs:check validates its closed shape.
  // This is NOT a pattern allowing arbitrary artifact JSON or runtime inputs.
  PLANNING_RECEIPT_PATH,
]);
const documentPatterns = [
  /^docs\/agents\/(?:[^/]+\/)*[^/]+\.md$/,
  /^docs\/maintenance\/[^/]+\.md$/,
  /^docs\/program\/2026-09-05\/(?:README|AGENT-KICKOFF|DELIVERY-STAGES|EXECUTION-CONTRACT|ISSUES)\.md$/,
  /^docs\/program\/2026-09-05\/issue-bodies\/VPJ-\d{2}\.md$/,
];

export function classifyChanges(files, eventName) {
  return eventName === 'pull_request' && files.length > 0 &&
    files.every(file => documents.has(file) || documentPatterns.some(pattern => pattern.test(file)))
    ? 'documentation' : 'full';
}

export function detectScope(env = process.env) {
  if (env.VP_CI_EVENT !== 'pull_request' ||
      !/^[a-f0-9]{40}$/.test(env.VP_CI_BASE ?? '') ||
      !/^[a-f0-9]{40}$/.test(env.VP_CI_HEAD ?? '')) return 'full';
  try {
    // Disable rename detection so moving runtime code into docs cannot hide its old path.
    const changed = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z',
      env.VP_CI_BASE, env.VP_CI_HEAD, '--'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return classifyChanges(changed.split('\0').filter(Boolean), env.VP_CI_EVENT);
  } catch {
    return 'full';
  }
}

export const DB_LANES = ['postgres','postgres-native','supabase-rls','supabase-http-native','supabase-http-ops'];
const checkNames = ['typecheck','build','test','unit','contract','integration','security','e2e','browser','evals','flags','assets'];
const baseChecks = () => Object.fromEntries(checkNames.map(k=>[k,false]));
const full = reason => ({version:1,profile:'full',reason,checks:Object.fromEntries(checkNames.map(k=>[k,true])),dbLanes:[...DB_LANES]});
const prose = f => documents.has(f)||documentPatterns.some(p=>p.test(f))||/^docs\/.+\.md$/.test(f)||/^artifacts\/.+\.(?:md|log|log\.gz)$/.test(f);
/** Unknown/unsafe diff and CI policy itself always select the full superset. */
export function selectCheckPlan(files,eventName,forceFull=false){
 if(forceFull||eventName!=='pull_request'||!Array.isArray(files)||files.length===0)return full('manual_push_or_unavailable_diff');
 if(files.some(f=>typeof f!=='string'||!/^[-A-Za-z0-9_./]+$/.test(f)||f.split('/').includes('..')))return full('unknown_path');
 if(files.some(f=>f.startsWith('.github/workflows/')||/^scripts\/(?:ci-change-scope|run-ci-suite|ci-suites\/)/.test(f)||/tests\/unit\/governance\/(?:ci-change-scope|db-integration-ci|ci-selected)/.test(f)))return full('ci_policy_changed');
 if(files.every(prose))return {version:1,profile:'documentation',reason:'prose_only',checks:baseChecks(),dbLanes:[]};
 const checks=baseChecks(),lanes=new Set();let known=true;
 for(const f of files){
  if(prose(f))continue;
  if(f==='package.json'||f==='pnpm-lock.yaml'||f==='tsconfig.json'||/^next\.config\./.test(f)||/^middleware\./.test(f))return full('shared_runtime_configuration');
  if(f.startsWith('supabase/')){for(const l of DB_LANES)lanes.add(l);Object.assign(checks,{typecheck:true,test:true,unit:true,contract:true,security:true,flags:true});continue;}
  if(f.startsWith('ios/')||f.startsWith('scripts/ios/'))continue; // Native workflow builds/tests changed iOS code; no unrelated Web/DB.
  if(f.startsWith('app/')||f.startsWith('components/')||f.startsWith('apps/ops/')||f.startsWith('public/')){
   Object.assign(checks,{typecheck:true,build:true,test:true,unit:true,contract:true,security:true,e2e:true,browser:true,flags:true,assets:true});
   lanes.add(f.startsWith('apps/ops/')?'supabase-http-ops':'supabase-http-native');
   if(f.startsWith('app/api/')||f.startsWith('apps/ops/')){lanes.add('postgres');lanes.add('supabase-rls');}
   continue;
  }
  if(f.startsWith('lib/server/')||f.startsWith('deploy/hosted-worker/')){
   Object.assign(checks,{typecheck:true,test:true,unit:true,contract:true,security:true,flags:true});
   lanes.add('postgres');lanes.add('supabase-http-native');
   if(/^lib\/server\/(?:identity|privacy|auth)\//.test(f))for(const l of DB_LANES)lanes.add(l);
   if(f.startsWith('lib/server/model-gateway/'))checks.evals=true;
   if(f.startsWith('lib/server/knowledge/')||f.startsWith('lib/server/jobs/wiki')){lanes.add('postgres-native');lanes.add('supabase-http-ops');}
   if(f.startsWith('lib/server/ops/'))lanes.add('supabase-http-ops');continue;
  }
  if(f.startsWith('tests/integration/')){
   Object.assign(checks,{typecheck:true,unit:true,contract:true,security:true,integration:true});
   // Static conservative families; shared fixtures/unknown families require full lanes.
   if(f.startsWith('tests/integration/web-trip-continuity/')){lanes.add('supabase-http-native');checks.build=true;checks.browser=true;checks.e2e=true;continue;}
   if(/\/fixtures\//.test(f)){for(const l of DB_LANES)lanes.add(l);continue;}
   const classified=integrationClassification();if(classified.problems.length)return full('classification_error');
   const row=classified.rows.find(r=>r.file===f);
   if(row&&DB_LANES.includes(row.lane)){lanes.add(row.lane);continue;}
   if(row?.lane==='test:integration')continue;
   return full('unmapped_integration_dependency');
  }
  if(/^tests\/(?:unit|contract|security)\//.test(f)){Object.assign(checks,{typecheck:true,unit:true,contract:true,security:true});if(f.startsWith('tests/security/')){lanes.add('postgres');lanes.add('supabase-rls');lanes.add('supabase-http-native');}continue;}
  if(f.startsWith('tests/e2e/')){Object.assign(checks,{typecheck:true,build:true,e2e:true,browser:true,assets:true});continue;}
  if(f.startsWith('evals/')){checks.evals=true;checks.contract=true;continue;}
  known=false;
 }
 return known?{version:1,profile:'affected',reason:'known_changed_paths',checks,dbLanes:DB_LANES.filter(l=>lanes.has(l))}:full('unknown_dependency');
}
export function detectPlan(env=process.env){
 if(env.VP_CI_FORCE_FULL==='true')return full('explicit_full');
 if(env.VP_CI_EVENT!=='pull_request'||!/^[a-f0-9]{40}$/.test(env.VP_CI_BASE??'')||!/^[a-f0-9]{40}$/.test(env.VP_CI_HEAD??''))return full('unavailable_diff');
 try{const changed=execFileSync('git',['diff','--name-only','--no-renames','-z',env.VP_CI_BASE,env.VP_CI_HEAD,'--'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});return selectCheckPlan(changed.split('\0').filter(Boolean),env.VP_CI_EVENT);}catch{return full('diff_error');}
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/ci-change-scope.mjs')) {
 const plan=detectPlan();
 // Both required gates really classify all files; an unregistered test is never hidden by a narrow scope.
 const {classify}=await import('./ci-suites/db-integration.mjs');const classification=classify();if(classification.problems.length)throw Error(classification.problems.join('\n'));
 if(process.env.GITHUB_OUTPUT){const outputs={scope:plan.profile,has_db:String(plan.dbLanes.length>0),db_lanes_json:JSON.stringify(plan.dbLanes.length?plan.dbLanes:['none']),...Object.fromEntries(Object.entries(plan.checks).map(([k,v])=>[k,String(v)]))};for(const [k,v]of Object.entries(outputs))appendFileSync(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);}
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\nCI plan ${plan.profile} (${plan.reason}); selected DB lanes: ${plan.dbLanes.join(', ')||'none (classification only)'}. This is affected-code validation, not runtime/user acceptance.\n`);
 console.log(JSON.stringify(plan));
}
