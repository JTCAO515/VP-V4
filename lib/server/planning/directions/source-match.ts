import { parseResultArtifactReadV2 } from '../../artifacts/result-v2-contract.ts';
import { directionsReceipt, object } from './protocol.ts';
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>object(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const memories=(v:unknown)=>Array.isArray(v)?canonical([...v].sort((a,b)=>String(a.id).localeCompare(String(b.id)))):null;
/** Comparison only: both values must come from original canonical actor-qualified RPCs. */
export function directionsPublishedSourceMatches(receipt:Record<string,unknown>,params:Record<string,unknown>,artifact:unknown,intake:unknown):boolean{
 if(!directionsReceipt('submit',receipt,params)||receipt.current!==true||!directionsReceipt('intake',intake,params)||!object(intake))return false;
 const r=parseResultArtifactReadV2(artifact);if(!r||!r.current||r.lifecycle!=='active'||r.content.schemaVersion!=='travel-directions/1'||r.artifactId!==receipt.artifactId||r.revision!==receipt.revision)return false;
 const s=r.source;
 return s.taskId===receipt.taskId&&s.taskTurnId===receipt.turnId&&s.goalId===receipt.goalId&&s.goalVersion===receipt.goalVersion&&s.inputMessageId===receipt.inputMessageId&&s.inputSequence===receipt.inputSequence
  &&['conversationId','goalId','goalVersion','inputMessageId','inputSequence','intakeRevision','intakeDigest'].every(k=>intake[k]===receipt[k])
  &&intake.tripId===s.tripId&&intake.tripVersion===s.tripVersion&&canonical(intake.intake)===canonical(params.intake)&&canonical(r.content.intake)===canonical(params.intake)
  &&memories(intake.memoryBasis)===memories(params.memoryBasis)&&memories(r.basis.memories)===memories(params.memoryBasis)&&r.basis.evidence.length===0;
}
export function directionsProposalMatches(receipt:Record<string,unknown>,directionsArtifact:unknown,proposalArtifact:unknown):boolean{
 const original=parseResultArtifactReadV2(directionsArtifact),proposal=parseResultArtifactReadV2(proposalArtifact);
 return !!original&&original.current&&!!proposal&&proposal.current&&proposal.lifecycle==='active'&&proposal.artifactId===receipt.proposalArtifactId&&proposal.revision===receipt.proposalArtifactRevision
  &&proposal.source.tripId===receipt.tripId&&proposal.source.tripVersion===receipt.tripVersion&&proposal.source.goalId===original.source.goalId&&proposal.content.schemaVersion==='change-proposal-reference/1'
  &&proposal.content.proposalId===receipt.proposalId&&proposal.content.proposalRevision===receipt.proposalRevision;
}
