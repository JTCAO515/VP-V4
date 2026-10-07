// Actual parent lookups at all three notification relationships, plus Brief
// empty/typed-field records. Before/after function sets must be identical.
import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
import {db,fixture,json,lit} from './runtime.mjs';
const prior=execFileSync('git',['show','92e338e19450061f4e048c92177256461825a596:supabase/migrations/20261007010000_result_data.sql'],{encoding:'utf8'});let start=prior.indexOf('create function result_data_private.parents_v1('),end=prior.indexOf('end$$;',start)+7;
await db(prior.slice(start,end).replace('create function result_data_private.parents_v1','create function result_data_private.ownproof_parents_before_v1'));
const a=await fixture(),reminder=uuid(),operation=uuid(),outbox=uuid();
await db(`insert into notification_private.reminders(id,owner_id,trip_id,operation_id,session_id,epoch,base_version,purpose,source,due_at,expires_at,time_zone,quiet_hours,consent_at,status) values('${reminder}','${a.owner}','${a.trip}','${operation}','${a.session}',1,0,'accepted_task_result',${json({kind:'task_result',sourceId:a.artifact})},clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour','UTC','{}',clock_timestamp(),'saved');
 insert into notification_private.outbox(id,reminder_id,state) values('${outbox}','${reminder}','scheduled');`);
const vectors=[
 ['service_brief_private.audit',{owner_id:a.owner,field_keys:[]}],
 ['service_brief_private.audit',{owner_id:a.owner,field_keys:[{artifactId:a.artifact}]}],
 ['service_brief_private.audit',{owner_id:a.owner,field_keys:[],artifactIds:[a.artifact]}],
 ['notification_private.outbox',{reminder_id:reminder}],
 ['notification_private.attempts',{notification_id:outbox}],
 ['notification_private.operations',{owner_id:a.owner,operation_id:operation,receipt:{resultId:reminder}}],
];
const verified=[];for(const [relation,value] of vectors){const query=name=>`select coalesce(jsonb_agg(to_jsonb(p) order by kind,entity_id),'[]') from(select distinct * from result_data_private.${name}(${lit(relation)},${json(value)})) p;`;
 const before=await db(query('ownproof_parents_before_v1')),after=await db(query('parents_v1'));assert.equal(after,before);if(relation.startsWith('notification_private.'))assert.ok(after.includes(a.artifact));verified.push({relation,equal:true,parents:JSON.parse(after)});
}
await db('drop function result_data_private.ownproof_parents_before_v1(text,jsonb);');
// Full original account cascade still deletes the scoped fixture rows. No
// erasure permission or source-free DELETE shortcut is introduced by this delta.
await db(`delete from auth.users where id='${a.owner}';`);assert.equal(await db(`select count(*) from notification_private.reminders where id='${reminder}';`),'0');
writeFileSync('tests/integration/privacy/result-data-sql/ownproof/brief-guard-parent-equivalence.json',JSON.stringify({kind:'actual PG owned original/updated function set equivalence; synthetic sources',verified,accountCascade:'PASS'},null,2)+'\n');console.log('all six typed/source-free and notification parent sets identical; account cascade PASS');
