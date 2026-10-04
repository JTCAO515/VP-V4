'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CLASSIFICATION_ACTIONS,isClassificationOperation,decodeClassificationReply,type ClassificationAction} from '@/lib/server/knowledge/classification/contract';
import {decodePendingClassification,dispatchClassificationPending,PENDING_CLASSIFICATION_KEY,type PendingClassification} from '@/lib/server/knowledge/classification/pending';
import {createPasswordAuthClient} from '@/lib/server/identity/browser-auth-client';
const fields:Record<ClassificationAction,readonly string[]>={
 submit:['candidateId','title','statement'],review:['candidateId','expectedVersion','decision','note'],publish:['candidateId','expectedVersion','expiresAt','useBasis','useNote'],revoke:['candidateId','expectedPublicationVersion','note'],
 submit_mapping:['canonicalPoiId','statementId','expectedStatementRevision','expectedPayloadHash','expectedSourceDigest','expectedPublicationVersion','expectedRightsDigest','city'],review_mapping:['mappingId','expectedVersion','expectedDigest','decision','note'],revoke_mapping:['mappingId','expectedVersion','note'],
};
const defaults:Record<ClassificationAction,Record<string,string>>={submit:{candidateId:'',title:'',statement:''},review:{expectedVersion:'1',decision:'reviewed'},publish:{expectedVersion:'2',useBasis:'original_factual_summary'},revoke:{expectedPublicationVersion:'1'},submit_mapping:{expectedStatementRevision:'1',expectedPublicationVersion:'1',city:'shanghai'},review_mapping:{expectedVersion:'1',decision:'approved'},revoke_mapping:{expectedVersion:'2'}};
const labels:Record<ClassificationAction,string>={submit:'提交分类来源 / Submit',review:'独立复核 / Review',publish:'发布分类 / Publish',revoke:'撤回发布 / Revoke',submit_mapping:'提交实体关联 / Map',review_mapping:'独立复核关联 / Review mapping',revoke_mapping:'撤销关联 / Revoke mapping'};
/** Dedicated closed classification workflow, no arbitrary RPC/legacy predicate. */
export function ClassificationOpsWorkspace(){
 const [action,setAction]=useState<ClassificationAction>('submit'),[values,setValues]=useState<Record<string,string>>(defaults.submit),[actor,setActor]=useState<string|null>(null),[frozen,setFrozen]=useState<PendingClassification|null>(null),[recoveryBlocked,setRecoveryBlocked]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<Record<string,unknown>|null>(null);
 const pending=useRef(false),generation=useRef(0);
 async function currentActor(){const epoch=generation.current;const r=await fetch('/api/ops/review',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});const data=r.ok?await r.json():null;const id=typeof data?.data?.actorId==='string'?data.data.actorId:null;if(epoch===generation.current){setActor(id);setResult(previous=>id===actor?previous:null);}return id;}
 useEffect(()=>{
  const refresh=()=>{void currentActor().catch(()=>{setActor(null);setResult(null);});};refresh();
  try{const raw=sessionStorage.getItem(PENDING_CLASSIFICATION_KEY);if(raw){const p=decodePendingClassification(JSON.parse(raw));if(p)setFrozen(p);else {setRecoveryBlocked(true);setMessage('保存的原请求无法核实；请先核对操作记录，勿重新提交。');}}}catch{setRecoveryBlocked(true);setMessage('保存的原请求无法读取；请先核对操作记录。');}
  const subscription=createPasswordAuthClient()?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){++generation.current;setActor(null);setResult(null);setTimeout(refresh,0);}});
  const visible=()=>{if(document.visibilityState==='visible'){++generation.current;setActor(null);setResult(null);refresh();}};document.addEventListener('visibilitychange',visible);
  return()=>{++generation.current;subscription?.data.subscription.unsubscribe();document.removeEventListener('visibilitychange',visible);};
 },[]);
 function keep(p:PendingClassification|null){setFrozen(p);try{if(p)sessionStorage.setItem(PENDING_CLASSIFICATION_KEY,JSON.stringify(p));else sessionStorage.removeItem(PENDING_CLASSIFICATION_KEY);}catch{setMessage('本机无法保存恢复请求；请保持当前页，勿新建操作重复提交。');}}
 async function dispatch(p:PendingClassification){
  if(pending.current)return;pending.current=true;setBusy(true);setResult(null);setMessage('');
  const epoch=generation.current;
  try{const outcome=await dispatchClassificationPending(p,{isCurrent:()=>epoch===generation.current,currentActor,send:async input=>{const response=await fetch('/api/ops/lodging-classification',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-ops-expected-actor':p.actorId},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});const wire=await response.json();return {ok:response.ok,status:response.status,data:wire.data};}});
   if(outcome.kind==='identity_changed'){setResult(null);setMessage('当前账号已变化；原请求仍未确认，禁止跨账号重试。请回到原 Ops 会话核对。');return;}
   if(outcome.kind==='received'){const receipt=decodeClassificationReply(outcome.data,p.input);if(!receipt){setMessage('ACK 未核实；原 body/op 保留，不假定已发布。');return;}setResult(receipt);keep(null);setMessage('已收到原操作精确回执；后续读取仍需核对当前资格。');return;}
   if(outcome.kind==='rejected'){keep(null);setMessage('服务端已拒绝本次请求；无成功回执。');return;}setMessage('ACK 未知；原请求已冻结。仅可在原账号重试该原请求，不创建新操作。');
  }finally{pending.current=false;setBusy(false);}
 }
 async function submit(event:FormEvent){event.preventDefault();if(recoveryBlocked||frozen||pending.current||busy)return;pending.current=true;let id:string|null;try{id=await currentActor();}catch{setMessage('Ops 会话暂时无法核实。');return;}finally{pending.current=false;}if(frozen)return;if(!id){setMessage('需要有效 Ops 会话。');return;}const input:Record<string,unknown>={action,operationId:crypto.randomUUID()};try{for(const key of fields[action])input[key]=key==='statement'?JSON.parse(values[key]??''):key.startsWith('expected')&&(key.endsWith('Version')||key.endsWith('Revision'))?Number(values[key]):values[key]??'';}catch{setMessage('statement JSON 无效。');return;}if(!isClassificationOperation(input)){setMessage('字段不符合 closed contract；请核对来源、版本与摘要。');return;}const p={actorId:id,input:JSON.parse(JSON.stringify(input)),createdAt:Date.now()} as PendingClassification;keep(p);await dispatch(p);}
 return <main className="mx-auto max-w-4xl space-y-5 p-6">
  <h1 className="text-2xl font-semibold">酒店分类来源与实体复核</h1>
  <p>本流程仅证明当前 reviewed hotel classification。星级、价格、空房、预订与外籍旅客入住资格均不在此分类范围。</p>
  <p>提交、来源复核、发布及实体关联复核分别记录。复核必须由独立且有权限的 Ops actor 完成；名称或 canonical category 不是酒店证据。</p>
  <form onSubmit={submit} className="space-y-4">
   <label className="block">操作<select className="ml-3 border p-2" disabled={recoveryBlocked||busy||frozen!==null} value={action} onChange={e=>{const next=e.target.value as ClassificationAction;setAction(next);setValues(defaults[next]);setResult(null);}}>{CLASSIFICATION_ACTIONS.map(a=><option key={a} value={a}>{labels[a]}</option>)}</select></label>
   <p>实际 Ops 会话：{actor??'未验证'}</p>
   {fields[action].map(key=><label className="block" key={key}>{key}{key==='statement'?<textarea className="block min-h-64 w-full border p-2 font-mono" value={values[key]??''} disabled={recoveryBlocked||busy||frozen!==null} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));}} aria-label="Typed classification statement JSON"/>:<input className="ml-3 w-full border p-2" value={values[key]??''} disabled={recoveryBlocked||busy||frozen!==null} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));}}/>}</label>)}
   {action==='submit'&&<p>statement 使用 knowledge-lodging-classification/1；classified_as→hotel；唯一 city、独立 lodging_classification scene、zh/en、1–3 个已获允许使用的 source declaration。不填模型猜测或库存信息。</p>}
   <button className="border px-4 py-2" disabled={recoveryBlocked||busy||frozen!==null} type="submit">{busy?'正在核对…':labels[action]}</button>
  </form>
  {frozen&&!busy&&<button type="button" className="border px-4 py-2" disabled={actor!==frozen.actorId} onClick={()=>{void dispatch(frozen);}}>重试冻结的原操作</button>}
  <p role="status">{message}</p>{result&&<section><h2>当前操作回执</h2><pre className="overflow-auto whitespace-pre-wrap border p-3">{JSON.stringify(result,null,2)}</pre></section>}
 </main>;
}
