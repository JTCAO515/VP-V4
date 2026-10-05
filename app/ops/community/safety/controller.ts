import {record,exact,uuid,parseSafetyInput,isSafetyMutation,matchesSafetyOutcome,decodeSafetyOutcome,type SafetyInput,type SafetyRecord,type SafetyObject,type SafetyOutcome} from '../../../../lib/server/community/safety/contract.ts';
import type {SafetyIdentity} from './transport.ts';
export type SafetyPending=Readonly<{actorId:string;sessionId:string;bytes:string}>;
export type SafetyView=Readonly<{records:readonly SafetyRecord[];selected:SafetyRecord|null;object:SafetyObject|null;pending:SafetyPending|null;busy:boolean;cursor:string|null;collection:'reports'|'appeals';deleted:boolean;message:'empty'|'ready'|'login'|'unavailable'|'unknown'|'storage'|'conflict';exported:Extract<SafetyOutcome,{kind:'export'}>|null}>;
export const emptySafetyView:SafetyView={records:[],selected:null,object:null,pending:null,busy:false,cursor:null,collection:'reports',message:'empty',deleted:false,exported:null};
export function decodeSafetyPending(raw:string|null):SafetyPending|null {
  if (!raw) return null;
  const p:unknown=JSON.parse(raw);
  if (!record(p) || !exact(p,['actorId','sessionId','bytes']) || !uuid(p.actorId) || !uuid(p.sessionId) || typeof p.bytes!=='string') throw Error('Journal unavailable');
  const command=parseSafetyInput(JSON.parse(p.bytes));if (!command || !isSafetyMutation(command)) throw Error('Journal unavailable');return p as SafetyPending;
}
type Dependencies={identity():Promise<SafetyIdentity|null>;send(bytes:string,identity:SafetyIdentity,signal:AbortSignal):Promise<{data:SafetyOutcome}|{error:string}>;read():SafetyPending|null;write(p:SafetyPending):void;erase():void;changed(v:SafetyView):void};
/** Single mutation journal, exact retry only, lifecycle fences late replies. */
export class SafetyOpsController {
  view:SafetyView=emptySafetyView;private epoch=0;private mounted=true;private abort:AbortController|null=null;private identity:SafetyIdentity|null=null;private visibleUntil=0;
  private readonly deps:Dependencies;
  constructor(deps:Dependencies) {this.deps=deps;}
  private changed(p:Partial<SafetyView>) {this.view={...this.view,...p};if (this.mounted) this.deps.changed(this.view);}
  private async run<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T> {
    return new Promise((resolve,reject)=>{const cancelled=()=>reject(Error('Request expired'));if (signal.aborted) {cancelled();return;}signal.addEventListener('abort',cancelled,{once:true});Promise.resolve().then(work).then(v=>{if (signal.aborted) cancelled();else resolve(v);},reject).finally(()=>signal.removeEventListener('abort',cancelled));});
  }
  invalidate(erase=false) {this.epoch++;this.abort?.abort();this.abort=null;this.identity=null;this.visibleUntil=0;let message:SafetyView['message']='empty';if (erase) {try {this.deps.erase();} catch {message='storage';}}this.changed({...emptySafetyView,message});}
  dispose() {this.invalidate();this.mounted=false;}
  expire() {if (this.identity && (this.identity.expiresAt<=Date.now() || this.visibleUntil && this.visibleUntil<=Date.now())) this.invalidate();}
  async execute(command:SafetyInput,retryBytes?:string) {
    if (this.view.busy || !this.mounted) return;
    const priorSelected=command.action==='object'?this.view.selected:null;
    const epoch=this.epoch;const abort=new AbortController();this.abort=abort;const timer=setTimeout(()=>abort.abort(),8000);
    this.changed({busy:true,records:[],selected:null,object:null,exported:null,deleted:false,cursor:null,message:'empty'});
    let pending:SafetyPending|null=null;let dispatched=false;
    try {
      const identity=await this.run(abort.signal,()=>this.deps.identity());if (epoch!==this.epoch) return;
      if (!identity || identity.expiresAt<=Date.now()) {this.deps.erase();this.changed({...emptySafetyView,message:'login',busy:true});return;}
      if (this.identity && (this.identity.actorId!==identity.actorId || this.identity.sessionId!==identity.sessionId)) this.deps.erase();
      this.identity=identity;pending=this.deps.read();
      if (pending && (pending.actorId!==identity.actorId || pending.sessionId!==identity.sessionId)) {this.deps.erase();pending=null;}
      this.changed({pending});
      const bytes=retryBytes??JSON.stringify(command);
      if (isSafetyMutation(command)) {
        if (retryBytes ? !pending || pending.bytes!==retryBytes : !!pending) {this.changed({message:'unknown'});return;}
        if (!retryBytes) {pending={actorId:identity.actorId,sessionId:identity.sessionId,bytes};this.deps.write(pending);this.changed({pending});}
      } else if (command.action==='operation' || command.action==='abandon') {
        if (!pending || pending.bytes!==command.mutationBytes) {this.changed({message:'conflict'});return;}
      }
      dispatched=true;const result=await this.run(abort.signal,()=>this.deps.send(bytes,identity,abort.signal));
      const after=await this.run(abort.signal,()=>this.deps.identity());if (epoch!==this.epoch || abort.signal.aborted) return;
      if (!after || after.actorId!==identity.actorId || after.sessionId!==identity.sessionId || after.expiresAt<=Date.now()) {this.deps.erase();this.identity=null;this.changed({...emptySafetyView,message:'login',busy:true});return;}
      if ('error' in result) {
        if (isSafetyMutation(command) && !retryBytes && ['INVALID_INPUT','SAFETY_FORBIDDEN','SAFETY_CONFLICT','SAFETY_NOT_FOUND','SAFETY_OPERATION_ABANDONED','SAFETY_DISABLED'].includes(result.error)) {this.deps.erase();pending=null;}
        this.changed({pending,message:pending?'unknown':result.error==='SAFETY_CONFLICT'?'conflict':'unavailable'});return;
      }
      const o=decodeSafetyOutcome(result.data);if (!o || !matchesSafetyOutcome(o,command,identity.actorId,identity.sessionId)) throw Error('Reply unavailable');
      if (o.kind==='operation' && o.state!=='absent' || o.kind==='deleted') {this.deps.erase();pending=null;}
      const object=o.kind==='object'?o.object:null;
      if (object && (Date.parse(object.expiresAt)<=Date.now() || Date.parse(object.expiresAt)>Date.now()+30000)) throw Error('Object expired');
      this.visibleUntil=Math.min(Date.now()+30000,identity.expiresAt,object?Date.parse(object.expiresAt):Infinity);
      this.changed({pending,deleted:o.kind==='deleted',message:pending?'unknown':'ready',records:o.kind==='page'?o.records:[],selected:o.kind==='record'?o.record:o.kind==='operation'?o.record:object && priorSelected && priorSelected.submissionId===object.id && 'submissionVersion' in priorSelected && priorSelected.submissionVersion===object.submissionVersion && priorSelected.safetyVersion===object.safetyVersion?priorSelected:null,object,exported:o.kind==='export'?o:null,cursor:o.kind==='page'?o.nextCursor:null,collection:o.kind==='page' && (o.collection==='reports' || o.collection==='appeals')?o.collection:this.view.collection});
    } catch {if (epoch===this.epoch) this.changed({pending,message:pending && dispatched?'unknown':'storage'});}
    finally {clearTimeout(timer);if (epoch===this.epoch) {this.abort=null;this.changed({busy:false});}}
  }
  exportSnapshot() {if (!this.identity || this.identity.expiresAt<=Date.now() || this.visibleUntil<=Date.now()) {this.invalidate();return null;}return this.view.exported;}
  queue(collection:'reports'|'appeals'=this.view.collection,cursor:string|null=null) {return this.execute({action:'queue',collection,cursor});}
  inspect(collection:'reports'|'appeals',id:string) {return this.execute({action:'inspect',collection,id});}
  decide(decision:'dismiss'|'remove'|'uphold'|'restore',note:string) {
    const selected=this.view.selected;if (!selected || this.view.pending || !('state' in selected) || selected.state!=='pending' || selected.version!==1 || selected.kind!=='report' && selected.kind!=='appeal') return;
    const common={operationId:crypto.randomUUID(),expectedSubmissionVersion:selected.submissionVersion,expectedSafetyVersion:selected.safetyVersion,decision,note};
    const command=parseSafetyInput(selected.kind==='report'?{action:'disposition',reportId:selected.id,expectedReportVersion:1,...common}:{action:'appealReview',appealId:selected.id,expectedAppealVersion:1,...common});if (command) return this.execute(command);
  }
  resolve(action:'operation'|'abandon') {const p=this.view.pending;if (!p) return;const original=parseSafetyInput(JSON.parse(p.bytes));if (original && isSafetyMutation(original)) return this.execute({action,operationId:original.operationId,mutationBytes:p.bytes});}
  retry() {const p=this.view.pending;if (!p) return;const original=parseSafetyInput(JSON.parse(p.bytes));if (original && isSafetyMutation(original)) return this.execute(original,p.bytes);}
}
