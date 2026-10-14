import { CONTROL_SCHEMA, exact, mutationId, record, type ControlInput } from '../../../lib/server/observability/ops-control/contract.ts';
import { decodeBudget, decodeReceipt, decodeWorkspace, receiptMatches, sameFence, type ControlBudget, type ControlReceipt, type ControlWorkspace, type SessionFence } from '../../../lib/server/observability/ops-control/projection.ts';
export type ControlView=Readonly<{busy:boolean;workspace:ControlWorkspace|null;budget:ControlBudget|null;receipt:ControlReceipt|null;pending:ControlInput|null;message:'empty'|'unavailable'|'conflict'|'unknown'|'applied'|'session_changed'}>;
export const emptyControlView:ControlView={busy:false,workspace:null,budget:null,receipt:null,pending:null,message:'empty'};
export type ControlTransport=(input:ControlInput,signal:AbortSignal)=>Promise<{status:number;body:unknown}>;
/** Client state holds no authority or durable controls. Only validated server
 * receipts can acknowledge mutations; an unknown attempt is read back, never retried. */
export class ControlController{
 view:ControlView=emptyControlView;private generation=0;private abort:AbortController|null=null;private fence:SessionFence|null=null;
 private readonly send:ControlTransport;private readonly changed:(view:ControlView)=>void;
 constructor(send:ControlTransport,changed:(view:ControlView)=>void){this.send=send;this.changed=changed;}
 private publish(change:Partial<ControlView>){this.view={...this.view,...change};this.changed(this.view);}
 invalidate(){this.generation++;this.abort?.abort();this.abort=null;this.fence=null;this.view={...emptyControlView,message:'session_changed'};this.changed(this.view);}
 async execute(input:ControlInput){
  if(this.view.busy)return;
  const mutation=mutationId(input);
  if(mutation&&this.view.pending){this.publish({message:'unknown'});return;}
  if(input.action==='receipt'&&this.view.pending&&mutationId(this.view.pending)!==input.operationId){this.publish({message:'conflict'});return;}
  const generation=++this.generation;const abort=new AbortController();this.abort=abort;const timer=setTimeout(()=>abort.abort(),10000);
  const pending=mutation?input:this.view.pending;
  this.publish({busy:true,receipt:null,pending,message:pending?'unknown':'empty'});
  try{
   const result=await this.send(input,abort.signal);if(generation!==this.generation||abort.signal.aborted)return;
   if(result.status!==200){
    const known=record(result.body)&&record(result.body.error)&&exact(result.body.error,['code'])&&['OPS_FORBIDDEN','OPS_CONFLICT','OPS_INVALID_INPUT','UNAUTHENTICATED'].includes(String(result.body.error.code))&&!Object.hasOwn(result.body,'acknowledgement');
    if(known&&mutation)this.publish({pending:null});
    this.publish({workspace:null,budget:null,message:this.view.pending?'unknown':result.status===409?'conflict':'unavailable'});return;
   }
   if(!record(result.body)||!exact(result.body,['data']))throw Error('Unavailable');
   const data=input.action==='workspace'?decodeWorkspace(result.body.data):input.action==='budget_read'?decodeBudget(result.body.data):decodeReceipt(result.body.data);
   if(!data)throw Error('Unavailable');
   if(this.fence&&!sameFence(this.fence,data)){this.invalidate();return;}this.fence=data;
   if(input.action==='workspace')this.publish({workspace:data as ControlWorkspace,message:pending?'unknown':'empty'});
   else if(input.action==='budget_read'){
    if((data as ControlBudget).scopeId!==input.scopeId)throw Error('Unavailable');
    this.publish({budget:data as ControlBudget,message:pending?'unknown':'empty'});
   }else{
    const receipt=data as ControlReceipt;if(!receiptMatches(input,receipt)||this.view.pending&&!receiptMatches(this.view.pending,receipt))throw Error('Unavailable');
    this.publish({receipt,pending:null,workspace:null,budget:null,message:'applied'});
   }
  }catch{if(generation===this.generation)this.publish({workspace:null,budget:null,message:this.view.pending?'unknown':'unavailable'});}
  finally{clearTimeout(timer);if(generation===this.generation){this.abort=null;this.publish({busy:false});}}
 }
 readPending(){const id=this.view.pending&&mutationId(this.view.pending);return id?this.execute({schemaVersion:CONTROL_SCHEMA,action:'receipt',operationId:id}):Promise.resolve();}
}
