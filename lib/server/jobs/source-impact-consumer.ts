import {nativeRequestScope} from '../identity/native-request.ts';
import {decodeSourceImpactLease,decodeSourceImpactDelivery,sameSourceImpactDelivery,sourceImpactApplied,sourceImpactFailed,sourceImpactIdle} from '../knowledge/report/source-impact.ts';
/** One finite default-disabled persistent delivery poll. SQL is authoritative;
 * no in-memory ledger, source fetch, publication, Trip writes or fake ACK. */
export type SourceImpactRpc=(name:'claim_source_impact_delivery_v1'|'apply_source_impact_projection_v1'|'fail_source_impact_delivery_v1'|'read_source_impact_delivery_v1'|'claim_trip_support_impact_delivery_v1'|'apply_reviewed_trip_support_delivery_v1'|'read_reviewed_trip_support_delivery_v1'|'fail_reviewed_trip_support_delivery_v1',params:Readonly<Record<string,unknown>>,signal:AbortSignal)=>Promise<unknown>;
/** Actual projection and ACK are atomic in the supplied persistent SQL port. */
export async function runSourceImpactConsumer(options:Readonly<{enabled?:boolean;consumer?:'knowledge_recheck_projection'|'trip_item_support';rpc:SourceImpactRpc}>,signal:AbortSignal){
 if(options.enabled!==true)return 'disabled' as const;if(signal.aborted)return 'blocked' as const;
 const rpc:SourceImpactRpc=async(name,p,external)=>{const scope=nativeRequestScope(external,15000);try{return await scope.run(()=>options.rpc(name,p,scope.signal));}finally{scope.dispose();}};
 const support=options.consumer==='trip_item_support';
 let claim:unknown;try{claim=await rpc(support?'claim_trip_support_impact_delivery_v1':'claim_source_impact_delivery_v1',support?{p_limit:1,p_lease_ms:15000}:{p_consumer:'knowledge_recheck_projection',p_limit:1,p_lease_ms:15000},signal);}catch{return 'unknown' as const;}
 if(sourceImpactIdle(claim))return 'idle' as const;
 const lease=decodeSourceImpactLease(claim);if(!lease||support!==(lease.target.kind==='trip_item_support'))return 'blocked' as const;
 const p={p_delivery:lease.deliveryId,p_lease:lease.leaseToken,p_expected_attempt:lease.attempt,p_expected_digest:lease.sourceDigest};
 try{const applied=await rpc(support?'apply_reviewed_trip_support_delivery_v1':'apply_source_impact_projection_v1',p,signal);if(sourceImpactApplied(applied,lease))return 'acked' as const;}
 catch{/* Read only the same durable receipt after an uncertain write ACK. */}
 const cleanup=new AbortController(),timer=setTimeout(()=>cleanup.abort(),15000);
 try{
  const saved=decodeSourceImpactDelivery(await rpc(support?'read_reviewed_trip_support_delivery_v1':'read_source_impact_delivery_v1',{p_delivery:lease.deliveryId},cleanup.signal));if(saved&&saved.state==='acked'&&sameSourceImpactDelivery(saved,lease))return 'acked' as const;
  const failed=await rpc(support?'fail_reviewed_trip_support_delivery_v1':'fail_source_impact_delivery_v1',{...p,p_code:'apply_ack_unknown'},cleanup.signal);return sourceImpactFailed(failed,lease)?'failed' as const:'unknown' as const;
 }catch{return 'unknown' as const;}finally{clearTimeout(timer);}
}
