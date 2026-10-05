import { parseCommunityInput,isMutation,type CommunityItem,type CommunityInput,type CommunityOutcome,record,exact,uuid } from '../../../lib/server/community/contract.ts';
import type {CommunityIdentity} from './transport.ts';
export type PendingReview=Readonly<{actorId:string;sessionId:string;bytes:string}>;
export type CommunityView=Readonly<{items:readonly CommunityItem[];selected:CommunityItem|null;pending:PendingReview|null;busy:boolean;message:'empty'|'ready'|'login'|'unavailable'|'unknown'|'storage'|'conflict';cursor:string|null}>;
export const emptyView:CommunityView={items:[],selected:null,pending:null,busy:false,message:'empty',cursor:null};
export function decodePendingReview(raw:string|null):PendingReview|null {
  if (!raw) return null;
  const p:unknown=JSON.parse(raw);
  if (!record(p) || !exact(p,['actorId','sessionId','bytes']) || !uuid(p.actorId) || !uuid(p.sessionId) || typeof p.bytes!=='string') throw Error('Pending unavailable');
  const command=parseCommunityInput(JSON.parse(p.bytes));if (!command || command.action!=='review') throw Error('Pending unavailable');return p as PendingReview;
}
/** One in-flight request, saved exact review bytes before dispatch; auth/lifecycle
 * invalidation clears private views and fences late replies. No automatic replay. */
type Dependencies={identity():Promise<CommunityIdentity|null>;send(bytes:string,identity:CommunityIdentity,signal:AbortSignal):Promise<{data:CommunityOutcome}|{error:string}>;read():PendingReview|null;write(p:PendingReview):void;erase():void;changed(v:CommunityView):void};
export class CommunityOpsController {
  view:CommunityView=emptyView;
  private epoch=0;private identity:CommunityIdentity|null=null;private abort:AbortController|null=null;private mounted=true;
  private readonly deps:Dependencies;
  constructor(deps:Dependencies) {this.deps=deps;}
  private run<T>(signal:AbortSignal, work:()=>Promise<T>):Promise<T> {
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(Error('Community request expired'));
      if (signal.aborted) {abort();return;}
      signal.addEventListener('abort',abort,{once:true});
      Promise.resolve().then(work).then(v=>{if (signal.aborted) abort();else resolve(v);},reject).finally(()=>signal.removeEventListener('abort',abort));
    });
  }
  private changed(p:Partial<CommunityView>) {this.view={...this.view,...p};if (this.mounted) this.deps.changed(this.view);}
  invalidate(auth=false) {
    this.epoch++;this.abort?.abort();this.abort=null;this.identity=null;
    let message:CommunityView['message']='empty';
    if (auth) {try {this.deps.erase();} catch {message='storage';}}
    this.changed({...emptyView,message});
  }
  dispose() {this.invalidate();this.mounted=false;}
  expire() {if (this.identity && this.identity.expiresAt<=Date.now()) this.invalidate();}
  async execute(command:CommunityInput) {
    if (this.view.busy || !this.mounted) return;
    const epoch=this.epoch;this.changed({busy:true,items:[],selected:null,message:'empty'});
    const abort=new AbortController();this.abort=abort;const timer=setTimeout(()=>abort.abort(),8000);
    let identity:CommunityIdentity|null=null;let mutating=false;let pending:PendingReview|null=null;
    const current=()=>this.mounted && epoch===this.epoch && !abort.signal.aborted;
    try {
      identity=await this.run(abort.signal,()=>this.deps.identity());if (!current()) return;
      if (!identity || identity.expiresAt<=Date.now()) {this.changed({message:'login',pending:null});return;}
      if (this.identity && (this.identity.actorId!==identity.actorId || this.identity.sessionId!==identity.sessionId)) this.deps.erase();
      this.identity=identity;
      pending=this.deps.read();
      if (pending && (pending.actorId!==identity.actorId || pending.sessionId!==identity.sessionId)) {this.deps.erase();pending=null;}
      this.changed({pending});
      const bytes=JSON.stringify(command);
      if (isMutation(command)) {
        if (command.action!=='review' || pending) {this.changed({message:'unknown'});return;}
        pending={actorId:identity.actorId,sessionId:identity.sessionId,bytes};this.deps.write(pending);this.changed({pending});mutating=true;
      } else if (command.action==='operation' || command.action==='abandon') {
        if (!pending || command.mutationBytes!==pending.bytes) {this.changed({message:'conflict'});return;}
        mutating=command.action==='abandon';
      }
      const result=await this.run(abort.signal,()=>this.deps.send(bytes,identity!,abort.signal));
      const after=await this.run(abort.signal,()=>this.deps.identity());if (!current()) return;
      if (!after || after.actorId!==identity.actorId || after.sessionId!==identity.sessionId || after.expiresAt<=Date.now()) {this.deps.erase();this.identity=null;this.changed({...emptyView,message:'login'});return;}
      if ('error' in result) {
        if (isMutation(command) && ['COMMUNITY_FORBIDDEN','COMMUNITY_SELF_REVIEW','COMMUNITY_CONFLICT','COMMUNITY_NOT_FOUND','COMMUNITY_OPERATION_ABANDONED','INVALID_INPUT'].includes(result.error)) {this.deps.erase();pending=null;}
        this.changed({pending,message:pending?'unknown':result.error==='COMMUNITY_CONFLICT'?'conflict':'unavailable'});return;
      }
      const out=result.data;
      if (out.kind==='operation' && out.state!=='absent') {this.deps.erase();pending=null;}
      this.changed({pending,message:pending?'unknown':'ready',items:out.kind==='page'?out.submissions:[],cursor:out.kind==='page'?out.nextCursor:null,selected:out.kind==='item'?out.submission:out.kind==='operation'?out.submission:null});
    } catch {if (epoch===this.epoch) this.changed({message:pending && mutating?'unknown':this.view.pending?'unknown':'storage'});}
    finally {clearTimeout(timer);if (epoch===this.epoch) {this.abort=null;this.changed({busy:false});}}
  }
  refresh(cursor:string|null=null) {return this.execute({action:'queue',cursor});}
  inspect(id:string) {return this.execute({action:'inspect',submissionId:id});}
  review(decision:'approve'|'reject',note:string) {
    const item=this.view.selected;if (!item || item.status!=='pending' || item.version!==1 || this.view.pending) return;
    const input=parseCommunityInput({action:'review',operationId:crypto.randomUUID(),submissionId:item.id,expectedVersion:1,decision,note});if (input) return this.execute(input);
  }
  resolve(action:'operation'|'abandon') {
    const p=this.view.pending;if (!p) return;
    const command=parseCommunityInput(JSON.parse(p.bytes));if (!command || !isMutation(command)) return;
    return this.execute({action,operationId:command.operationId,mutationBytes:p.bytes});
  }
  async retry() {
    const p=this.view.pending;if (!p || this.view.busy) return;
    // Retain the journal through replay; execute's normal new-mutation path forbids it.
    const original=parseCommunityInput(JSON.parse(p.bytes));if (!original || original.action!=='review') return;
    return this.replay(p,original);
  }
  private async replay(p:PendingReview,original:CommunityInput) {
    const epoch=this.epoch;this.changed({busy:true,items:[],selected:null});const abort=new AbortController();this.abort=abort;const timer=setTimeout(()=>abort.abort(),8000);
    try {
      const identity=await this.run(abort.signal,()=>this.deps.identity());if (epoch!==this.epoch || abort.signal.aborted) return;
      if (!identity || identity.expiresAt<=Date.now() || identity.actorId!==p.actorId || identity.sessionId!==p.sessionId) {this.deps.erase();this.changed({...emptyView,message:'login'});return;}
      const restored=this.deps.read();if (restored?.bytes!==p.bytes) throw Error('Journal unavailable');
      const out=await this.run(abort.signal,()=>this.deps.send(p.bytes,identity,abort.signal));
      const after=await this.run(abort.signal,()=>this.deps.identity());if (epoch!==this.epoch || abort.signal.aborted) return;
      if (!after || after.expiresAt<=Date.now() || after.actorId!==identity.actorId || after.sessionId!==identity.sessionId) {this.deps.erase();this.changed({...emptyView,message:'login'});return;}
      if ('data' in out && out.data.kind==='operation' && out.data.state==='committed' && 'submissionId' in original && out.data.submission?.id===original.submissionId) {this.deps.erase();this.changed({selected:out.data.submission,pending:null,message:'ready'});}
      else this.changed({message:'unknown'});
    } catch {if (epoch===this.epoch) this.changed({message:'unknown'});}
    finally {clearTimeout(timer);if (epoch===this.epoch) {this.abort=null;this.changed({busy:false});}}
  }
}
