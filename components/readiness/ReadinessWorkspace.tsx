"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import type {ReadinessAssessment,ReadinessActionResult} from "@/lib/server/readiness/assessment-contract";
import type {ReadinessAction} from "@/lib/server/readiness/actions-contract";
import type {ReadinessDeclaration} from "@/lib/server/readiness/declarations-contract";
import styles from "./readiness.module.css";
type Answer="unknown"|"yes"|"no";
type TaskReference={taskId:string;tripVersion:number};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function assessment(v:unknown,task:TaskReference,tripId:string):ReadinessAssessment{
 if(!object(v)||v.schemaVersion!=="readiness/2"||!object(v.basis)||v.basis.taskId!==task.taskId||v.basis.tripId!==tripId||v.basis.tripVersion!==task.tripVersion
  ||v.ruleVersion!=="readiness-actions/1"||v.declarationBasis!=="explicit_user_report"||!Number.isSafeInteger(v.declarationRevision)
  ||!["empty","current","stale"].includes(v.declarationState as string)||!["available","unknown"].includes(v.knowledgeAvailability as string)
  ||!["unknown","satisfied","not_satisfied","not_applicable"].includes(v.userReadiness as string)||!["now","not_yet","unknown","not_applicable"].includes(v.actionTiming as string)
  ||!object(v.declaration)||!Array.isArray(v.evidence)||v.evidence.length>50||!Array.isArray(v.actions)||v.actions.length>4
  ||typeof v.evaluatedAt!=="string"||typeof v.expiresAt!=="string"||Date.parse(v.expiresAt)<=Date.now()
  ||Date.parse(v.expiresAt)-Date.parse(v.evaluatedAt)>30000||Date.parse(v.evaluatedAt)>Date.now()
  ||typeof v.assessmentDigest!=="string"||!/^[0-9a-f]{64}$/.test(v.assessmentDigest))throw Error("READINESS_UNAVAILABLE");
 return v as ReadinessAssessment;
}
export function ReadinessWorkspace({tripId}:{tripId:string}){
 const [locale,setLocale]=useState<"en"|"zh">("en"),[city,setCity]=useState("shanghai"),[scenario,setScenario]=useState<ReadinessDeclaration["scenario"]>("connectivity");
 const [subjectId,setSubjectId]=useState<string|null>(null),[subjects,setSubjects]=useState<{id:string;label:string}[]>([]);
 const [applies,setApplies]=useState<Answer>("unknown"),[resourcesReady,setResourcesReady]=useState<Answer>("unknown"),[conditionsChecked,setConditionsChecked]=useState<Answer>("unknown");
 const [checkAt,setCheckAt]=useState("unknown"),[selectedTime,setSelectedTime]=useState("");
 const [task,setTask]=useState<TaskReference|null>(null),[snapshot,setSnapshot]=useState<ReadinessAssessment|null>(null),[result,setResult]=useState<ReadinessAssessment|null>(null);
 const [actionResult,setActionResult]=useState<ReadinessActionResult|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState<string|null>(null);
 const request=useRef<AbortController|null>(null),expiry=useRef<ReturnType<typeof setTimeout>|null>(null),retry=useRef<string|null>(null);
 const t=(en:string,zh:string)=>locale==="zh"?zh:en;
 const needsPlace=scenario==="address"||scenario==="admission";
 const resetReport=()=>{setApplies("unknown");setResourcesReady("unknown");setConditionsChecked("unknown");setCheckAt("unknown");setSelectedTime("");};
 const stop=()=>{request.current?.abort();request.current=null;if(expiry.current)clearTimeout(expiry.current);setResult(null);setActionResult(null);setBusy(false);};
 async function json(url:string,controller:AbortController,body?:string){
  const response=await fetch(url,{method:body===undefined?"GET":"POST",cache:"no-store",signal:controller.signal,...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body})});
  const value:unknown=await response.json();
  if(!response.ok)throw Error(object(value)&&object(value.error)&&typeof value.error.code==="string"?value.error.code:"READINESS_UNAVAILABLE");
  if(!object(value)||!Object.hasOwn(value,"data"))throw Error("READINESS_UNAVAILABLE");
  return value.data;
 }
 const common=(target:TaskReference)=>({schemaVersion:"readiness-request/2",taskId:target.taskId,expectedTripVersion:target.tripVersion,scenario,city,locale,subjectId:needsPlace?subjectId:null});
 function accept(value:ReadinessAssessment){
  setSnapshot(value);setResult(value);setApplies(value.declaration.applies);setResourcesReady(value.declaration.resourcesReady);setConditionsChecked(value.declaration.conditionsChecked);
  if(value.declaration.checkAt==="now"||value.declaration.checkAt==="unknown"){setCheckAt(value.declaration.checkAt);setSelectedTime("");}
  else{setCheckAt("later");setSelectedTime(value.declaration.checkAt);}
  if(expiry.current)clearTimeout(expiry.current);expiry.current=setTimeout(()=>{setResult(null);setActionResult(null);setNotice("expired");},Math.max(0,Date.parse(value.expiresAt)-Date.now()));
 }
 async function refresh(){
  stop();setSnapshot(null);resetReport();retry.current=null;setNotice(null);
  const controller=new AbortController();request.current=controller;setBusy(true);
  try{
   let target:TaskReference;
   const savedTask=new URL(window.location.href).searchParams.get("readinessTask");
   if(uuid(savedTask)){
    const response=await fetch("/api/trips/"+tripId,{cache:"no-store",signal:controller.signal});if(!response.ok)throw Error("READINESS_UNAVAILABLE");
    const value:unknown=await response.json();if(!object(value)||!object(value.trip)||!Number.isSafeInteger(value.trip.headVersion))throw Error("READINESS_UNAVAILABLE");
    target={taskId:savedTask,tripVersion:value.trip.headVersion as number};
   }else{
    const value=await json("/api/trips/"+tripId+"/readiness/task",controller);
    if(!object(value)||value.kind!=="readiness_task_reference/1"||!uuid(value.taskId)||value.tripId!==tripId||!Number.isSafeInteger(value.tripVersion))throw Error("TASK_UNAVAILABLE");
    target={taskId:value.taskId,tripVersion:value.tripVersion as number};
   }
   const value=assessment(await json("/api/trips/"+tripId+"/readiness/actions",controller,JSON.stringify({...common(target),operation:"read"})),target,tripId);
   if(controller.signal.aborted||request.current!==controller)return;
   setTask(target);accept(value);
   const url=new URL(window.location.href);url.searchParams.set("readinessTask",target.taskId);window.history.replaceState(window.history.state,"",url);
   if(value.declarationState==="stale")setNotice("changed");
  }catch(error){if(controller.signal.aborted||request.current!==controller)return;setTask(null);setSnapshot(null);resetReport();setNotice(error instanceof Error?error.message:"READINESS_UNAVAILABLE");}
  finally{if(request.current===controller)setBusy(false);}
 }
 useEffect(()=>{void refresh();return ()=>{request.current?.abort();if(expiry.current)clearTimeout(expiry.current);};},[tripId,scenario,city,locale,subjectId]);
 useEffect(()=>{
  const hide=()=>{if(document.visibilityState!=="visible")stop();else void refresh();};
  document.addEventListener("visibilitychange",hide);return ()=>document.removeEventListener("visibilitychange",hide);
 },[tripId,scenario,city,locale,subjectId]);
 useEffect(()=>{
  setSubjects([]);if(!needsPlace)return;
  const controller=new AbortController();
  void (async()=>{try{
   const value=await json("/api/knowledge?"+new URLSearchParams({city,scene:"attraction",locale}),controller);
   if(!object(value)||!Array.isArray(value.statements)||controller.signal.aborted)return;
   const actual=new Map<string,string>();
   for(const row of value.statements){if(object(row)&&object(row.assertion)&&typeof row.assertion.subjectId==="string"&&typeof row.text==="string"&&typeof row.expiresAt==="string"&&Date.parse(row.expiresAt)>Date.now())actual.set(row.assertion.subjectId,row.text);}
   setSubjects([...actual].map(([id,label])=>({id,label})));
  }catch{/* Qualified absence remains unknown; no names or locations are guessed. */}})();
  return ()=>controller.abort();
 },[needsPlace,city,locale]);
 function edited(){retry.current=null;setResult(null);setActionResult(null);}
 async function save(){
  if(!task||!snapshot)return;stop();const controller=new AbortController();request.current=controller;setBusy(true);setNotice(null);
  try{
   const declaration={scenario,city,locale,subjectId:needsPlace?subjectId:null,applies,resourcesReady,conditionsChecked,checkAt:checkAt==="later"?selectedTime:checkAt};
   const body=retry.current??JSON.stringify({...common(task),operation:"save",operationId:crypto.randomUUID(),expectedRevision:snapshot.declarationRevision,expectedBasis:snapshot.basis,declaration});
   retry.current=body;
   const value=assessment(await json("/api/trips/"+tripId+"/readiness/actions",controller,body),task,tripId);
   if(controller.signal.aborted||request.current!==controller)return;
   retry.current=null;accept(value);
  }catch(error){if(controller.signal.aborted||request.current!==controller)return;const code=error instanceof Error?error.message:"READINESS_UNAVAILABLE";setNotice(code);
   if(code==="STALE_TRIP_VERSION"||code==="STALE_READINESS_BASIS"){retry.current=null;setSnapshot(null);resetReport();}}
  finally{if(request.current===controller)setBusy(false);}
 }
 async function execute(action:ReadinessAction){
  if(!task||!result)return;
  const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setActionResult(null);setNotice(null);
  try{
   const value=await json("/api/trips/"+tripId+"/readiness/actions",controller,JSON.stringify({...common(task),operation:"execute",expectedRevision:result.declarationRevision,expectedBasis:result.basis,assessmentDigest:result.assessmentDigest,actionId:action.actionId}));
   if(!object(value)||value.kind!=="readiness_action/1"||value.actionId!==action.actionId||!object(value.result))throw Error("READINESS_UNAVAILABLE");
   if(controller.signal.aborted||request.current!==controller)return;
   if(Date.parse(result.expiresAt)<=Date.now()){setResult(null);setNotice("expired");return;}setActionResult(value.result as ReadinessActionResult);
  }catch(error){if(controller.signal.aborted||request.current!==controller)return;setResult(null);setNotice(error instanceof Error?error.message:"READINESS_UNAVAILABLE");}
  finally{if(request.current===controller)setBusy(false);}
 }
 const answerSelect=(label:string,value:Answer,change:(value:Answer)=>void)=><label>{label}<select value={value} disabled={busy} onChange={e=>{change(e.target.value as Answer);edited();}}><option value="unknown">{t("Unknown","未知")}</option><option value="yes">{t("Yes, I report so","是，我明确说明")}</option><option value="no">{t("No, I report so","否，我明确说明")}</option></select></label>;
 const status=(v:string)=>({available:t("Current guidance available","有当前指引"),unknown:t("Unknown","未知"),satisfied:t("You report prepared","你声明已准备"),not_satisfied:t("You report a gap","你声明尚有缺口"),not_applicable:t("Not applicable","不适用"),now:t("Now","现在"),not_yet:t("Not yet your selected time","未到你选定的时间")}[v]??v);
 const material=actionResult&&(actionResult.kind==="material"||actionResult.kind==="conditional_candidate")?actionResult.evidence:null;
 return <main className={styles.main}>
  <header className={styles.header}><h1>{t("Preparation: a next step for each gap","准备检查：把缺口变成下一步")}</h1><Link href={"/visepanda/trips/"+tripId}>{t("Back to this Trip","返回此行程")}</Link></header>
  <section className={styles.panel}><label>{t("Language","语言")}<select value={locale} onChange={e=>setLocale(e.target.value as "en"|"zh")}><option value="en">English</option><option value="zh">中文</option></select></label>
   <label>{t("City","城市")}<select value={city} onChange={e=>{setCity(e.target.value);setSubjectId(null);}}>{["shanghai","beijing","guangzhou","chongqing"].map(c=><option key={c}>{c}</option>)}</select></label>
   <label>{t("Preparation scope","准备场景")}<select value={scenario} onChange={e=>{setScenario(e.target.value as ReadinessDeclaration["scenario"]);setSubjectId(null);}}>{(["connectivity","payment","admission","address","transport"] as const).map((s,i)=><option key={s} value={s}>{locale==="zh"?["网络","支付","入场","地址","交通"][i]:["Connectivity","Payment","Admission","Address","Transport"][i]}</option>)}</select></label>
   {needsPlace?<label>{t("Choose an actual reviewed knowledge entity","选择实际已审核知识实体")}<select value={subjectId??""} onChange={e=>setSubjectId(e.target.value||null)}><option value="">{t("No qualified entity selected","尚未选择合格实体")}</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>:null}
   <button disabled={busy} onClick={()=>void refresh()}>{t("Reload current scope and evidence","重新读取当前作用域与依据")}</button>
   <button disabled={busy} onClick={()=>{const url=new URL(window.location.href);url.searchParams.delete("readinessTask");window.history.replaceState(window.history.state,"",url);void refresh();}}>{t("Choose the current linked result task again","重新选择当前关联结果的任务")}</button>
   {task?<p>{t("Uses the existing linked task","复用既有真实任务")} · {task.taskId}</p>:<p>{t("No currently authorized linked task. Continue the existing assistant goal first; no new task is fabricated.","没有当前可用的关联任务。请先继续既有助手目标；这里不会伪造新任务。")}</p>}
  </section>
  {snapshot?<section className={styles.panel}><h2>{t("Your explicit reports","你的明确声明")}</h2>
   {answerSelect(t("Does this scope apply to you?","此项是否适用于你？"),applies,setApplies)}
   {answerSelect(t("Have you prepared the required resources/documents?","所需资料或证件是否已备妥？"),resourcesReady,setResourcesReady)}
   {answerSelect(t("Have you checked the listed conditions?","是否已核对所列适用条件？"),conditionsChecked,setConditionsChecked)}
   <label>{t("Your selected check time","你选择的检查时间")}<select value={checkAt} disabled={busy} onChange={e=>{setCheckAt(e.target.value);edited();}}><option value="unknown">{t("Unknown","未知")}</option><option value="now">{t("Now","现在")}</option><option value="later">{t("Explicit time with UTC offset","带 UTC 偏移的明确时间")}</option></select></label>
   {checkAt==="later"?<label>{t("RFC3339 time, e.g. 2026-10-10T09:00:00+08:00","RFC3339 时间，例如 2026-10-10T09:00:00+08:00")}<input value={selectedTime} onChange={e=>{setSelectedTime(e.target.value);edited();}}/></label>:null}
   <button disabled={busy} onClick={()=>void save()}>{retry.current?t("Retry this exact declaration","重试同一份声明"):t("Save my reports and check","保存我的声明并核验")}</button>
   <p>{t("Reports are not official eligibility or fulfillment. Unknown is not a failure or completion rate.","声明不代表官方资格或服务已完成。未知不算失败，也不用于计算完成率。")}</p>
  </section>:null}
  {result?<section className={styles.panel}><h2>{t("Current assessment","当前核验")}</h2><dl><div><dt>{t("Knowledge","知识依据")}</dt><dd>{status(result.knowledgeAvailability)}</dd></div><div><dt>{t("Your preparation","你的准备情况")}</dt><dd>{status(result.userReadiness)}</dd></div><div><dt>{t("Action timing","行动时机")}</dt><dd>{status(result.actionTiming)}</dd></div></dl>
   {result.evidence.map(e=><article key={e.factId}><p>{e.text}</p><ul>{[...e.conditions,...e.exclusions].map((line,i)=><li key={i}>{line}</li>)}</ul><p>{e.factId} · v{e.publicationVersion} / r{e.assertionRevision}</p></article>)}
   {result.actions.map(a=><button key={a.actionId} disabled={busy} onClick={()=>void execute(a)}>{({read_material:t("Read authorized material","阅读获准资料"),verify_entry:t("Open the verification entry","打开核实入口"),conditional_candidate:t("Inspect this conditional candidate","查看此条件性候选"),trip_proposal:t("Review the exact existing proposal","审阅这份既有提案")})[a.kind]}</button>)}
   <p>{result.ruleVersion} · {result.basis.dateBasis}</p>
  </section>:null}
  {material?<section className={styles.panel}><h2>{t("Authorized current material","获准的当前资料")}</h2><p>{material.text}</p><ul>{[...material.conditions,...material.exclusions].map((line,i)=><li key={i}>{line}</li>)}</ul>{material.sources.map(s=><p key={s.sourceRevisionId}><a href={s.uri} target="_blank" rel="noreferrer">{s.publisher} · {s.locator}</a></p>)}</section>:null}
  {actionResult?.kind==="verification_entry"?<section className={styles.panel}><h2>{t("Verification entry","核实入口")}</h2><p>{actionResult.target==="declaration"?t("Update only the reports you can explicitly verify in the form above.","请在上方表单更新你能明确核实的声明。"):t("Refresh guidance or verify with its official source. Missing sources remain unknown.","请刷新指引或通过官方来源核实。缺少来源时仍为未知。")}</p>{actionResult.sources.map(s=><a key={s.sourceRevisionId} href={s.uri} target="_blank" rel="noreferrer">{s.publisher}</a>)}<button disabled={busy} onClick={()=>void refresh()}>{t("Read current guidance again","重新读取当前指引")}</button></section>:null}
  {actionResult?.kind==="trip_proposal_reference"?<section className={styles.panel}><p>{actionResult.proposalId} · r{actionResult.proposalRevision}</p><p>{t("Use the existing Trip review, visible diff and explicit confirmation. This preparation action does not apply a patch.","请使用既有行程审阅、可见差异和明确确认。本准备动作不会应用修改。")}</p><Link href={"/visepanda/trips/"+tripId}>{t("Open this Trip's existing review","打开此行程的既有审阅")}</Link></section>:null}
  {notice?<p role="status">{notice==="changed"||notice==="STALE_READINESS_BASIS"||notice==="STALE_TRIP_VERSION"?t("Scope or dates changed. Reload and explicitly report again.","作用域或日期已改变。请重新读取并明确声明。"):notice==="expired"?t("The current check expired. Reload before using actions.","本次核验已到期。使用动作前请重新读取。"):t("Current task, evidence or permission is unavailable. Nothing is marked complete.","当前任务、依据或权限不可用。没有把任何问题标为已解决。")}</p>:null}
 </main>;
}
