// Test-only bridge. No DB transport, production port, permit or ledger mutation.
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fields=['kind','schemaVersion','ownerId','taskId','turnId','textPolicyId','planningPolicyId','scopeId','attemptId','provider','model','priceVersion','intakeContextDigest','planningContextDigest','ledgerStatus','reservedMicros','actualMicros','unknown','reconciliationRequired','executionAllowed','executionAvailable','readyForProvider'];
const snapshotFields=['schemaVersion','ownerId','taskId','turnId','intakeContextDigest','planningContextDigest','place','modelAttempt'];
export function modelBindingWorkerSnapshot(snapshot,binding,expected){
 if(!exact(binding,fields)||binding.kind!=='model_attempt_binding'||binding.schemaVersion!=='planning-v2-model-binding/1')throw Error('binding read unavailable; no missing/none fallback');
 for(const key of ['ownerId','taskId','turnId','textPolicyId','planningPolicyId','scopeId','attemptId','provider','model','priceVersion','intakeContextDigest','planningContextDigest'])if(binding[key]!==expected[key])throw Error('binding identity mismatch');
 if(binding.executionAllowed!==false||binding.executionAvailable!==false||binding.readyForProvider!==false||typeof binding.unknown!=='boolean'||typeof binding.reconciliationRequired!=='boolean')throw Error('binding flags malformed');
 if(typeof binding.ledgerStatus!=='string'||!['reserved','dispatched','pending','settled','released'].includes(binding.ledgerStatus))throw Error('ledger status unavailable');
 if(!Number.isSafeInteger(binding.reservedMicros)||binding.reservedMicros<1||binding.reservedMicros>1e12||
  (binding.ledgerStatus==='settled'?(!Number.isSafeInteger(binding.actualMicros)||binding.actualMicros<0||binding.actualMicros>1e12):binding.actualMicros!==null))throw Error('unknown money cannot become zero/none');
 if(binding.reconciliationRequired!==(binding.unknown||['dispatched','pending','settled'].includes(binding.ledgerStatus)))throw Error('lost reconciliation marker');
 if(binding.unknown)throw Error('sticky unknown has no exact modelAttempt enum; fail closed');
 if(!exact(snapshot,snapshotFields)||snapshot.schemaVersion!=='planning-v2-checkpoints/1')throw Error('checkpoint read unavailable');
 for(const key of ['ownerId','taskId','turnId','intakeContextDigest','planningContextDigest'])if(snapshot[key]!==expected[key])throw Error('checkpoint identity mismatch');
 if(snapshot.modelAttempt!==binding.ledgerStatus)throw Error('different ledger generations; fail closed');
 // Preserve actual released/reserved/settled/pending/dispatched. Never infer none from NULL money.
 return {...snapshot,modelAttempt:binding.ledgerStatus};
}
