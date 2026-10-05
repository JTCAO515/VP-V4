import {record,exact,uuid,parsePublicationInput,isPublicationMutation,decodePublicationOutcome,matchesPublicationOutcome,outcomeExperiences,type PublicationInput,type PublicationRecord,type PublicationOutcome} from '../../../../lib/server/community/publication/contract.ts';
import {decodeSafetyOutcome,type SafetyObject} from '../../../../lib/server/community/safety/contract.ts';
import type {PublicationIdentity} from './transport.ts';
export type PublicationPending=Readonly<{actorId:string;sessionId:string;bytes:string}>;
export type PublicationView=Readonly<{records:readonly PublicationRecord[];selected:PublicationRecord|null;source:SafetyObject|null;pending:PublicationPending|null;busy:boolean;cursor:string|null;deleted:boolean;message:'empty'|'ready'|'login'|'unavailable'|'unknown'|'storage'|'conflict';exported:Extract<PublicationOutcome,{kind:'export'}>|null}>;
export const emptyPublicationView:PublicationView={records:[],selected:null,source:null,pending:null,busy:false,cursor:null,deleted:false,message:'empty',exported:null};
export function decodePublicationPending(raw:string|null):PublicationPending|null {
  if (!raw) return null;const p:unknown=JSON.parse(raw);
  if (!record(p) || !exact(p,['actorId','sessionId','bytes']) || !uuid(p.actorId) || !uuid(p.sessionId) || typeof p.bytes!=='string') throw Error('Journal unavailable');
  const c=parsePublicationInput(JSON.parse(p.bytes));if (!c || !isPublicationMutation(c)) throw Error('Journal unavailable');return p as PublicationPending;
}
type Dependencies={identity():Promise<PublicationIdentity|null>;send(bytes:string,identity:PublicationIdentity,signal:AbortSignal):Promise<{data:PublicationOutcome}|{error:string}>;source(submissionId:string,identity:PublicationIdentity,signal:AbortSignal):Promise<unknown>;read():PublicationPending|null;write(p:PublicationPending):void;erase():void;changed(v:PublicationView):void};
/** Exact-byte journal; every request clears display and fences late replies. */
export class PublicationOpsController {
  view:PublicationView=emptyPublicationView;private generation=0;private mounted=true;private controller:AbortController|null=null;private identity:PublicationIdentity|null=null;private visibleUntil=0;
  private readonly deps:Dependencies;
  constructor(deps:Dependencies) {this.deps=deps;}
  private changed(p:Partial<PublicationView>) {this.view={...this.view,...p};if (this.mounted) this.deps.changed(this.view);}
  private async bounded<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T> {
    return new Promise((resolve,reject)=>{const cancel=()=>reject(Error('Request ended'));if (signal.aborted) {cancel();return;}signal.addEventListener('abort',cancel,{once:true});Promise.resolve().then(work).then(v=>signal.aborted?cancel():resolve(v),reject).finally(()=>signal.removeEventListener('abort',cancel));});
  }
  invalidate(erase=false) {this.generation++;this.controller?.abort();this.controller=null;this.identity=null;this.visibleUntil=0;let message:PublicationView['message']='empty';if (erase) {try {this.deps.erase();} catch {message='storage';}}this.changed({...emptyPublicationView,message});}
  dispose() {this.invalidate();this.mounted=false;}
  expire() {if (this.identity && (this.identity.expiresAt<=Date.now() || this.visibleUntil && this.visibleUntil<=Date.now())) this.invalidate();}
  async execute(command:PublicationInput,retryBytes?:string) {
    if (!parsePublicationInput(command) || this.view.busy || !this.mounted) return;
    const generation=this.generation;const controller=new AbortController();this.controller=controller;const timer=setTimeout(()=>controller.abort(),8000);
    this.visibleUntil=0;this.changed({...emptyPublicationView,busy:true});
    let pending:PublicationPending|null=null;let dispatched=false;
    try {
      const identity=await this.bounded(controller.signal,()=>this.deps.identity());if (generation!==this.generation) return;
      if (!identity || identity.expiresAt<=Date.now()) {this.deps.erase();this.changed({message:'login'});return;}
      if (this.identity && (identity.actorId!==this.identity.actorId || identity.sessionId!==this.identity.sessionId)) this.deps.erase();
      this.identity=identity;pending=this.deps.read();
      if (pending && (pending.actorId!==identity.actorId || pending.sessionId!==identity.sessionId)) {this.deps.erase();pending=null;}
      this.changed({pending});const bytes=retryBytes??JSON.stringify(command);
      if (isPublicationMutation(command)) {
        if (retryBytes?!pending || pending.bytes!==retryBytes:!!pending) {this.changed({message:'unknown'});return;}
        if (!retryBytes) {pending={actorId:identity.actorId,sessionId:identity.sessionId,bytes};this.deps.write(pending);this.changed({pending});}
      } else if (command.action==='operation' || command.action==='abandon') {if (!pending || pending.bytes!==command.mutationBytes) {this.changed({message:'conflict'});return;}}
      dispatched=true;const result=await this.bounded(controller.signal,()=>this.deps.send(bytes,identity,controller.signal));
      const after=await this.bounded(controller.signal,()=>this.deps.identity());if (generation!==this.generation || controller.signal.aborted) return;
      if (!after || after.actorId!==identity.actorId || after.sessionId!==identity.sessionId || after.expiresAt<=Date.now()) {this.deps.erase();this.identity=null;this.changed({...emptyPublicationView,message:'login',busy:true});return;}
      if ('error' in result) {
        // A denial on retry cannot prove that the original unknown dispatch failed.
        if (isPublicationMutation(command) && !retryBytes && ['INVALID_INPUT','PUBLICATION_FORBIDDEN','PUBLICATION_CONFLICT','PUBLICATION_NOT_FOUND','PUBLICATION_DISABLED','PUBLICATION_OPERATION_ABANDONED'].includes(result.error)) {this.deps.erase();pending=null;}
        this.changed({pending,message:pending?'unknown':result.error==='PUBLICATION_CONFLICT'?'conflict':'unavailable'});return;
      }
      const o=decodePublicationOutcome(result.data);if (!o || !matchesPublicationOutcome(o,command,identity.actorId,identity.sessionId)) throw Error('Reply unavailable');
      const experiences=outcomeExperiences(o);if (experiences.some(e=>Date.parse(e.expiresAt)<=Date.now() || Date.parse(e.expiresAt)>Date.now()+30000)) throw Error('Expired reply');
      if (o.kind==='operation' && o.state!=='absent' || o.kind==='deleted') {this.deps.erase();pending=null;}
      this.visibleUntil=Math.min(identity.expiresAt,Date.now()+30000,...experiences.map(e=>Date.parse(e.expiresAt)));
      this.changed({records:o.kind==='publications'?o.publications:[],selected:o.kind==='publication'?o.publication:o.kind==='operation'?o.publication:null,pending,cursor:o.kind==='publications'?o.nextCursor:null,exported:o.kind==='export'?o:null,deleted:o.kind==='deleted',message:pending?'unknown':'ready'});
    } catch {if (generation===this.generation) this.changed({pending,message:pending && dispatched?'unknown':!dispatched?'storage':'unavailable'});}
    finally {clearTimeout(timer);if (generation===this.generation) {this.controller=null;this.changed({busy:false});}}
  }
  async inspectSource() {
    this.expire();const selected=this.view.selected;if (!selected || this.view.busy || !this.mounted || this.view.pending) return;
    const generation=this.generation;const controller=new AbortController();this.controller=controller;const timer=setTimeout(()=>controller.abort(),8000);
    this.visibleUntil=0;this.changed({busy:true,source:null,records:[],exported:null,message:'empty'});
    try {
      const identity=await this.bounded(controller.signal,()=>this.deps.identity());
      if (!identity || !this.identity || identity.actorId!==this.identity.actorId || identity.sessionId!==this.identity.sessionId || identity.expiresAt<=Date.now()) throw Error('Session changed');
      const value=await this.bounded(controller.signal,()=>this.deps.source(selected.submissionId,identity,controller.signal));
      const after=await this.bounded(controller.signal,()=>this.deps.identity());if (generation!==this.generation || controller.signal.aborted) return;
      const o=decodeSafetyOutcome(value);const source=o?.kind==='object'?o.object:null;
      if (!after || after.actorId!==identity.actorId || after.sessionId!==identity.sessionId || after.expiresAt<=Date.now() || !o || o.actorId!==identity.actorId || o.sessionId!==identity.sessionId || !source || source.id!==selected.submissionId || source.submissionVersion!==selected.submissionVersion || source.safetyVersion!==selected.safetyVersion || Date.parse(source.expiresAt)<=Date.now() || Date.parse(source.expiresAt)>Date.now()+30000) throw Error('Source unavailable');
      this.visibleUntil=Math.min(identity.expiresAt,Date.parse(source.expiresAt));this.changed({selected,source,message:'ready'});
    } catch {if (generation===this.generation) {this.changed({selected:null,source:null,message:'unavailable'});}}
    finally {clearTimeout(timer);if (generation===this.generation) {this.controller=null;this.changed({busy:false});}}
  }
  decide(decision:'approve'|'reject',note:string) {
    this.expire();const p=this.view.selected;const s=this.view.source;if (!p || !s || this.view.pending || p.state!=='pending_rights' || s.id!==p.submissionId || s.submissionVersion!==p.submissionVersion || s.safetyVersion!==p.safetyVersion) return;
    return this.execute({action:'rightsReview',operationId:crypto.randomUUID(),publicationId:p.id,expectedPublicationVersion:p.version,expectedSubmissionVersion:p.submissionVersion,expectedSafetyVersion:p.safetyVersion,decision,note});
  }
  publish() {this.expire();const p=this.view.selected;const s=this.view.source;if (!p || !s || this.view.pending || p.state!=='rights_approved' || s.submissionVersion!==p.submissionVersion || s.safetyVersion!==p.safetyVersion) return;return this.execute({action:'publish',operationId:crypto.randomUUID(),publicationId:p.id,expectedPublicationVersion:p.version,expectedSubmissionVersion:p.submissionVersion,expectedSafetyVersion:p.safetyVersion});}
  revoke() {this.expire();const p=this.view.selected;if (!p || this.view.pending || p.state!=='published') return;return this.execute({action:'revoke',operationId:crypto.randomUUID(),publicationId:p.id,expectedPublicationVersion:p.version});}
  resolve(action:'operation'|'abandon') {const p=this.view.pending;if (!p) return;const c=parsePublicationInput(JSON.parse(p.bytes));if (c && isPublicationMutation(c)) return this.execute({action,operationId:c.operationId,mutationBytes:p.bytes});}
  retry() {const p=this.view.pending;if (!p) return;const c=parsePublicationInput(JSON.parse(p.bytes));if (c && isPublicationMutation(c)) return this.execute(c,p.bytes);}
  exportSnapshot() {this.expire();return this.view.exported;}
}
