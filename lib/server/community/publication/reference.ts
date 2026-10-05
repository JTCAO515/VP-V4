import {decodeExperienceReference,type ExperienceReference,type Experience} from './contract.ts';
/** Callers retain identifiers only. Every re-open asks the authoritative reader.
 * A user's confirmed Trip owns its plan; invalidation changes only source display. */
export type ExperienceReferenceHandle=Readonly<{referenceId:string}>;
export type ExperienceSourceView=Readonly<{availability:'loading'|'current'|'unavailable';experience:Experience|null}>;
export class ExperienceReferenceReader {
  view:ExperienceSourceView={availability:'unavailable',experience:null};
  private generation=0;private controller:AbortController|null=null;private expiresAt=0;
  private readonly deps:{read(referenceId:string,signal:AbortSignal):Promise<ExperienceReference|null>;changed(v:ExperienceSourceView):void;current():boolean;now?():number};
  constructor(deps:ExperienceReferenceReader['deps']) {this.deps=deps;}
  private changed(view:ExperienceSourceView) {this.view=view;this.deps.changed(view);}
  invalidate() {this.generation++;this.controller?.abort();this.controller=null;this.expiresAt=0;this.changed({availability:'unavailable',experience:null});}
  expire() {if (!this.deps.current() || this.expiresAt && this.expiresAt<=this.now()) this.invalidate();}
  private now() {return this.deps.now?.()??Date.now();}
  async open(handle:ExperienceReferenceHandle) {
    this.invalidate();if (!this.deps.current()) return;
    const generation=this.generation;const controller=new AbortController();this.controller=controller;
    this.changed({availability:'loading',experience:null});
    const timer=setTimeout(()=>controller.abort(),8000);
    try {
      const value=await this.deps.read(handle.referenceId,controller.signal);
      if (generation!==this.generation || controller.signal.aborted) return;
      const reference=decodeExperienceReference(value);const e=reference?.experience;
      if (!this.deps.current() || !reference || reference.id!==handle.referenceId || reference.availability!=='current' || !e || Date.parse(e.expiresAt)<=this.now() || Date.parse(e.expiresAt)>this.now()+30000) {this.invalidate();return;}
      this.expiresAt=Date.parse(e.expiresAt);this.changed({availability:'current',experience:e});
    } catch {if (generation===this.generation) this.invalidate();}
    finally {clearTimeout(timer);if (generation===this.generation && this.view.availability==='loading') this.invalidate();}
  }
  snapshot():ExperienceSourceView {this.expire();return this.view;}
}
