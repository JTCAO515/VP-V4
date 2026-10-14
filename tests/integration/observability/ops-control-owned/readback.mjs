import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {db,rpc,out} from './fixture.mjs';
const rows=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('owner',j.owner_id,'turn',j.turn_id,'task',j.task_id,'session',s.id,'policy',c.policy_id,'conversation',g.conversation_id,'mode',w.execution_mode)) from turn_private.planning_comparisons j join turn_private.work w on w.turn_id=j.turn_id join turn_private.text_content c on c.turn_id=j.turn_id join turn_private.assistant_goals g on g.id=j.goal_id join auth.sessions s on s.user_id=j.owner_id where w.state='failed' and j.state='paused_unknown';`));
const results=[];for(const a of rows){
 const reply=await rpc('read_assistant_task_activity_v1',{p_policy_id:a.policy,p_conversation_id:a.conversation,p_task_id:a.task},a);
 assert.equal(reply.kind,'task_activity');assert.equal(reply.taskId,a.task);assert.equal(reply.turnId,a.turn);assert.equal(reply.turnStatus,'unavailable');
 const list=await rpc('list_assistant_conversation_tasks_v1',{p_policy_id:a.policy,p_conversation_id:a.conversation,p_cursor:null},a);assert.equal(list.kind,'conversation_tasks');
 results.push({turn:a.turn,task:a.task,mode:a.mode,result:'PASS',activity:reply,tasks:list});console.log('PASS owned original task readback '+a.mode);
}
writeFileSync(out+'readback-results.json',JSON.stringify({results,proof:'Actual authenticated-role public task activity/list RPCs; original unavailable terminal and exact task/turn, no new task'},null,2)+'\n');
