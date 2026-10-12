import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {db,owned} from './kernel.mjs';
await owned();
const candidates=JSON.parse(await db(`select coalesce(jsonb_agg(x),'[]') from (
 select a.id as artifact,a.current_revision as revision,a.owner_id as owner,mobile.session_id as session,mobile.epoch,
 c.policy_id as policy,c.id as conversation,g.id as goal,g.scope_version as version,m.id as parent,m.sequence
 from turn_private.result_artifacts a join turn_private.result_revisions r on r.artifact_id=a.id and r.revision=a.current_revision
 join turn_private.assistant_goals g on g.id=a.goal_id and g.owner_id=a.owner_id
 join turn_private.assistant_conversations c on c.id=g.conversation_id and c.owner_id=a.owner_id
 join turn_private.assistant_messages m on m.id=a.input_message_id and m.owner_id=a.owner_id
 join identity_private.mobile_accounts mobile on mobile.owner_id=a.owner_id
 where a.lifecycle='active' and r.content->>'schemaVersion'='decision/1' and r.content->>'state'='chosen'
 and mobile.session_id is not null and m.scope_version=g.scope_version
 order by a.created_at desc limit 16
) x;`));
let receipt;
for(const a of candidates){
 const lines=(await db(`begin;set role authenticated;set request.jwt.claim.role='authenticated';
 set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:'authenticated',is_anonymous:false})}';
 select public.read_goal_return_reference_v1('${a.policy}','${a.conversation}','${a.goal}',${a.version},'${a.parent}',${a.sequence},${a.epoch});
 select public.read_result_artifact_v2('${a.artifact}',${a.revision});commit;`)).split('\n');
 const reference=JSON.parse(lines[0]),result=JSON.parse(lines[1]);
 if(reference.kind!=='goal_return'||reference.lastDecision.artifactId!==a.artifact||reference.lastDecision.revision!==a.revision)continue;
 assert.equal(result.kind,'result_artifact');assert.equal(result.current,true);assert.equal(result.content.state,'chosen');
 receipt={base:'daa7bae44a660381fb3295d0d2afc327ea98d3ba',candidateSourceCommit:'e4ae920071afd271f72445f6b30433418090ea27',nonce:'vpj13-goal-return-sql-20261012-51fb6d9a',observedAt:new Date().toISOString(),provenance:'Actual own PG17.6 SQL fixture, same ordinary-authenticated transaction; synthetic SQL claims only, not GoTrue/JWT/HTTP',reference,result};break;
}
assert.ok(receipt,'No existing current readable fixture; do not invent a pair');
writeFileSync(new URL('actual-receipt-pair.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({pair:'actual-receipt-pair.json',kind:receipt.reference.kind,revision:receipt.reference.lastDecision.revision,eventId:receipt.reference.lastDecision.eventId,current:receipt.result.current,fixture:'existing only'}));
