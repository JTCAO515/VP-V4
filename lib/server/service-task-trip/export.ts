import {exact,integer,record,uuid,digest} from '../trip/scoped-edit/contract.ts';
import {validBinding} from '../turn/scoped-edit/protocol.ts';
type Row=Record<string,unknown>;
/** The retained tombstone contains only original identity fences. Live exports
 * must close through the same actual owner/Task/goal/message graph. */
export function validTripObjectiveExport(task:Row,rows:(table:string)=>Row[]):boolean{
 const b=task.trip_objective;
 if(b===null)return task.expected_result!=='trip_modification';
 if(task.expected_result!=='trip_modification'||!record(b))return false;
 if(b.outcome==='erased')return exact(b,['schemaVersion','outcome','goalId',...(Object.hasOwn(b,'proposalId')?['proposalId']:[])])
 &&b.schemaVersion==='trip-service-task-erased/1'&&uuid(b.goalId)&&(!Object.hasOwn(b,'proposalId')||uuid(b.proposalId));
 const fields=['conversationId','goalId','goalVersion','messageId','messageSequence','linkVersion','linkOperationId','tripId','baseVersion','operationId','contextId','contextDigest','requestDigest','outcome'];
 const proposal=Object.hasOwn(b,'proposalId'),settled=Object.hasOwn(b,'settledVersion');
 if(!exact(b,[...fields,...(proposal?['proposalId','proposalRevision','proposalDigest','producerBinding']:[]),...(settled?['settledVersion']:[])])||!['pending','settled','cancelled','blocked','rejected','expired','conflicted'].includes(String(b.outcome)))return false;
 if(!['conversationId','goalId','messageId','linkOperationId','tripId','operationId','contextId'].every(k=>uuid(b[k]))
 ||!['goalVersion','messageSequence','linkVersion'].every(k=>integer(b[k],1))||!integer(b.baseVersion)||!digest(b.contextDigest)||!digest(b.requestDigest))return false;
 if(settled&&(b.outcome!=='settled'||!integer(b.settledVersion,1)||b.settledVersion!==Number(b.baseVersion)+1))return false;
 if(b.outcome==='settled'&&!settled)return false;
 if(proposal&&(!uuid(b.proposalId)||!integer(b.proposalRevision,1)||typeof b.proposalDigest!=='string'||!/^trip-v2:[a-f0-9]{64}$/.test(b.proposalDigest)||!validBinding(b.producerBinding)
 ||b.producerBinding.ownerId!==task.owner_id||b.producerBinding.taskId!==task.id||b.producerBinding.tripId!==b.tripId||b.producerBinding.operationId!==b.operationId||b.producerBinding.contextId!==b.contextId||b.producerBinding.contextDigest!==b.contextDigest||b.producerBinding.baseVersion!==b.baseVersion))return false;
 const message=rows('turn_private.assistant_messages').find(m=>m.id===b.messageId);
 return !!message&&message.owner_id===task.owner_id&&message.task_id===task.id&&message.conversation_id===b.conversationId&&message.goal_id===b.goalId&&message.scope_version===b.goalVersion&&String(message.sequence)===String(b.messageSequence)
 &&rows('turn_private.assistant_goals').some(g=>g.id===b.goalId&&g.owner_id===task.owner_id&&g.conversation_id===b.conversationId)
 &&rows('turn_private.assistant_conversations').some(c=>c.id===b.conversationId&&c.owner_id===task.owner_id);
}
