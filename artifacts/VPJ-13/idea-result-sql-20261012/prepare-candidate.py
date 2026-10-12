from pathlib import Path
import hashlib,json,difflib
out=Path(__file__).parent
root=out.parents[2]
src=Path('/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj13-idea-result-server-20261012/artifacts/VPJ-13/idea-result-server-20261012/shared-candidates')
records=[]
for name in ['public-complete_planning_intake_comparison_v1','turn_private-valid_current_v2_completion_proof']:
 before=(src/(name+'.before.sql.txt')).read_text()
 after=before.replace('create function ','create or replace function ',1)
 if name.startswith('public-'):
  old='turn_private.valid_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,place.observation,locale,p_content) is distinct from true'
  new='p_content is distinct from turn_private.journey_idea_result_content_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,p_attempt,p_output_digest,p_usage_digest,locale) or p_content is null'
  assert after.count(old)==1
  after=after.replace(old,new)
 else:
  old=' return true;'
  new=""" -- The original transaction proof remains the only terminal/publication gate.
 -- Its immutable collector output also fixes option order, including recovered
 -- original attempts. Caller supplied selection/content digests cannot override it.
 if proof.content->'actions' is distinct from '[]'::jsonb
  or jsonb_array_length(proof.content->'options') is distinct from 2
  or proof.content->'options'->0->>'id' is distinct from
   (case v.output_wire->'output'->>'highlight' when 'peoples_square' then 'peoples_square' when 'jingan' then 'jingan' when 'none' then 'jingan' end)
  or proof.content->'options'->1->>'id' is distinct from
   (case v.output_wire->'output'->>'highlight' when 'peoples_square' then 'jingan' when 'jingan' then 'peoples_square' when 'none' then 'peoples_square' end)
 then return false;end if;
 return true;"""
  assert after.count(old)==1
  after=after.replace(old,new)
 (out/(name+'.before.sql')).write_text(before)
 (out/(name+'.after.sql')).write_text(after)
 patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile=name+'.before.sql',tofile=name+'.after.sql'))
 (out/(name+'.patch')).write_text(patch)
 records.append(dict(name=name,beforeSHA256=hashlib.sha256(before.encode()).hexdigest(),afterSHA256=hashlib.sha256(after.encode()).hexdigest(),patchSHA256=hashlib.sha256(patch.encode()).hexdigest()))
(out/'idea-result-core.candidate.sql').write_text((out/'idea-result-helper.candidate.sql').read_text()+'\n'+''.join((out/(r['name']+'.after.sql')).read_text()+'\n' for r in records))
(out/'source-manifest.json').write_text(json.dumps(dict(baseline='daa7bae44a660381fb3295d0d2afc327ea98d3ba',stage='PRIVATE CANDIDATE ONLY',functions=records),indent=2)+'\n')
